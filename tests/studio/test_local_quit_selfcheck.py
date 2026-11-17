"""Dependency-free checks of the real unload/shutdown functions, without importing GPU packages.

Run: python3 tests/studio/test_local_quit_selfcheck.py
Native process termination tests live in the Rust modules and require cargo on macOS.
"""
import ast
import gc
import logging
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch
import weakref

ROOT = Path(__file__).resolve().parents[2]


def function_from_source(relative, name, namespace):
    tree = ast.parse((ROOT / relative).read_text())
    functions = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == name]
    assert len(functions) == 1, (relative, name)
    definition = functions[0]
    definition.decorator_list = []
    exec(compile(ast.Module(body=[definition], type_ignores=[]), relative, "exec"), namespace)
    return namespace[name]


class LocalQuitTests(unittest.TestCase):
    def test_shutdown_attempts_every_model_even_if_one_unload_fails(self):
        shutdown = function_from_source(
            "studio/backend/core/inference/worker.py", "_unload_for_shutdown",
            {"logger": logging.getLogger("quit-test")},
        )
        calls = []

        def unload(name):
            calls.append(name)
            if name == "broken":
                raise RuntimeError("failed model load")
            del backend.models[name]

        backend = SimpleNamespace(models={"broken": {}, "good": {}}, unload_model=unload)
        with self.assertLogs("quit-test", level="WARNING"):
            shutdown(backend)
        self.assertEqual(calls, ["broken", "good"])
        self.assertEqual(list(backend.models), ["broken"])

    def test_actual_mlx_unload_drops_model_and_cache_references_and_clears_allocator(self):
        for failed_load in (False, True):
            with self.subTest(failed_load=failed_load):
                events = []
                mlx = ModuleType("mlx")
                mx = ModuleType("mlx.core")
                mx.clear_cache = lambda: events.append("allocator")
                mx.metal = SimpleNamespace(is_available=lambda: True)
                mx.set_wired_limit = lambda limit: events.append(("wired", limit))
                mlx.core = mx
                unload = function_from_source(
                    "studio/backend/core/inference/mlx_inference.py", "unload_model",
                    {"logger": logging.getLogger("quit-test"),
                     "_fast_verify_status": lambda *args: {},
                     "_drain_generation_streams": lambda mx: events.append("drain")},
                )

                class Tensor:
                    pass

                tensor = Tensor()
                reference = weakref.ref(tensor)
                prompt_cache = [tensor]
                backend = SimpleNamespace(
                    _model_fusion=SimpleNamespace(close=lambda: events.append("fusion")),
                    _ane_prefill={"active": False}, _model=tensor, _tokenizer=tensor,
                    _processor=tensor, _speculative_draft=tensor, _prefill_step=tensor,
                    _prefill_layer_step=tensor, _distributed_group=tensor,
                    models={} if failed_load else {"qwen": {"model": tensor}},
                    active_model_name=None if failed_load else "qwen",
                    _memory_limits_applied={"wired": 1},
                    _clear_prompt_cache=prompt_cache.clear,
                )
                del tensor
                with patch.dict(sys.modules, {"mlx": mlx, "mlx.core": mx}):
                    self.assertTrue(unload(backend, "qwen"))
                gc.collect()
                self.assertIsNone(reference())
                self.assertEqual(backend.models, {})
                self.assertEqual(prompt_cache, [])
                self.assertEqual(events, ["fusion", "drain", "allocator", ("wired", 0)])

    def test_checkpoint_failure_is_reported_before_training_is_forced_to_stop(self):
        events = []
        training = ModuleType("core.training.training")
        training._training_backend = SimpleNamespace(
            stop_for_shutdown=lambda: events.append("checkpoint") or False,
            force_terminate=lambda: events.append("force"),
        )
        lifetime = ModuleType("utils.process_lifetime")
        lifetime.mark_process_shutting_down = lambda: events.append("latch")
        lifetime.terminate_all = lambda: events.append("sweep") or []
        lifetime.clear_breadcrumb = lambda: None
        modules = {"core.training.training": training, "utils.process_lifetime": lifetime}
        # Optional subsystems are explicitly empty so this check never imports hardware runtimes.
        for module, name in [
            ("core.inference.orchestrator", "_inference_backend"),
            ("core.export.orchestrator", "_export_backend"),
        ]:
            modules[module] = ModuleType(module)
            setattr(modules[module], name, None)
        shutdown = function_from_source("studio/backend/run.py", "_graceful_shutdown", {
            "logger": logging.getLogger("quit-test"), "sys": sys,
            "_remove_pid_file": lambda: events.append("pid_removed"),
        })
        with patch.dict(sys.modules, modules), self.assertLogs("quit-test", level="WARNING") as logs:
            shutdown()
        self.assertTrue(any("checkpoint did not finish saving" in line for line in logs.output))
        self.assertLess(events.index("latch"), events.index("checkpoint"))
        self.assertLess(events.index("checkpoint"), events.index("force"))
        self.assertLess(events.index("force"), events.index("sweep"))


if __name__ == "__main__":
    unittest.main()
