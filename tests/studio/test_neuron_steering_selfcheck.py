"""Run directly with a Python environment containing MLX; no model download needed."""
import ast
import math
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "studio/backend"))
import mlx.core as mx
import mlx.nn as nn
from core.inference.neuron_steering import SteeringError, learn_steering_vector, temporary_neuron_steering


class Layer(nn.Module):
    def __init__(self):
        super().__init__()
        self.weight = mx.ones((3,))

    def __call__(self, x):
        return x * self.weight


class SteeringCheck(unittest.TestCase):
    def setUp(self):
        self.layer = Layer()
        self.backend = SimpleNamespace(_model=SimpleNamespace(layers=[self.layer]), _speculative_draft=None)
        self.clears = 0
        def clear():
            self.clears += 1
            self.backend._prompt_cache_unavailable = False
            self.backend._vlm_snapshot_store_unavailable = False
        self.backend._clear_prompt_cache = clear
        self.x = mx.array([[[1., 2., 3.], [4., 5., 6.]]])

    def test_offset_applies_to_only_one_coordinate_and_never_weights(self):
        for offset in (1, -1, 0.5):
            original = self.layer.weight
            with temporary_neuron_steering(self.backend, dict(layer=0, neuron=1, offset=offset)):
                expected = self.x + mx.array([0., offset, 0.])
                self.assertTrue(mx.array_equal(self.layer(self.x), expected).item())
                self.assertIs(self.layer.weight, original)
                self.assertTrue(self.backend._prompt_cache_unavailable)
                self.assertTrue(self.backend._vlm_snapshot_store_unavailable)
            self.assertIs(type(self.layer), Layer)
            self.assertTrue(mx.array_equal(self.layer(self.x), self.x).item())
            self.assertFalse(self.backend._prompt_cache_unavailable)
        self.assertEqual(self.clears, 6)

    def test_failure_and_generator_close_restore_layer_and_caches(self):
        with self.assertRaises(SteeringError):
            with temporary_neuron_steering(self.backend, dict(layer=0, neuron=3, offset=1)):
                self.layer(self.x)
        self.assertIs(type(self.layer), Layer)
        self.assertFalse(self.backend._prompt_cache_unavailable)
        def stream():
            with temporary_neuron_steering(self.backend, dict(layer=0, neuron=0, offset=1)):
                yield self.layer(self.x)
        reply = stream()
        next(reply)
        reply.close()
        self.assertIs(type(self.layer), Layer)
        self.assertFalse(self.backend._vlm_snapshot_store_unavailable)

    def test_invalid_inputs_do_not_change_model(self):
        for change in [dict(layer=-1), dict(layer=True), dict(layer=2), dict(neuron=-1), dict(neuron=1.5), dict(offset=float('nan')), dict(offset=float('inf')), dict(offset=101)]:
            with self.subTest(change=change), self.assertRaises(SteeringError):
                with temporary_neuron_steering(self.backend, dict(layer=0, neuron=0, offset=1) | change):
                    pass
            self.assertIs(type(self.layer), Layer)

    def test_text_tower_and_speculative_refusal(self):
        self.backend._model = SimpleNamespace(language_model=SimpleNamespace(model=SimpleNamespace(layers=[self.layer])))
        with temporary_neuron_steering(self.backend, dict(layer=0, neuron=0, offset=1)):
            self.assertEqual(self.layer(self.x)[0,0,0].item(), 2)
        self.backend._speculative_draft = object()
        with self.assertRaisesRegex(SteeringError, 'speculative'):
            with temporary_neuron_steering(self.backend, dict(layer=0, neuron=0, offset=1)):
                pass

    def test_real_qwen_decoder_logits_change_and_reset_exactly(self):
        from mlx_lm.models.qwen3 import Model, ModelArgs
        mx.random.seed(42)
        model = Model(ModelArgs(model_type="qwen3", hidden_size=32, num_hidden_layers=2,
            intermediate_size=64, num_attention_heads=4, rms_norm_eps=1e-6, vocab_size=64,
            num_key_value_heads=2, max_position_embeddings=128, head_dim=8,
            tie_word_embeddings=True, rope_theta=10000))
        self.backend._model = model
        tokens = mx.array([[1, 2, 3]])
        baseline = model(tokens)
        mx.eval(baseline)
        with temporary_neuron_steering(self.backend, dict(layer=0, neuron=1, offset=1)):
            changed = model(tokens)
            mx.eval(changed)
            self.assertFalse(mx.allclose(baseline, changed).item())
        reset = model(tokens)
        mx.eval(reset)
        self.assertTrue(mx.array_equal(baseline, reset).item())

    def test_qwen35_hybrid_decoder_steering_and_reset(self):
        from mlx_lm.models.qwen3_5 import Model, ModelArgs
        model = Model(ModelArgs(model_type="qwen3_5", text_config=dict(
            hidden_size=32, num_hidden_layers=4, intermediate_size=64,
            num_attention_heads=4, num_key_value_heads=2, vocab_size=64, head_dim=8,
            linear_num_key_heads=2, linear_num_value_heads=4, linear_key_head_dim=8,
            linear_value_head_dim=8, full_attention_interval=4)))
        self.backend._model = model
        tokens = mx.array([[1, 2, 3]])
        baseline = model(tokens)
        mx.eval(baseline)
        with temporary_neuron_steering(self.backend, dict(layer=0, neuron=1, offset=1)):
            changed = model(tokens)
            mx.eval(changed)
            self.assertFalse(mx.allclose(baseline, changed).item())
        self.assertTrue(mx.array_equal(baseline, model(tokens)).item())

        original_types = [type(layer) for layer in model.layers]
        original_down_types = [type(layer.mlp.down_proj) for layer in model.layers]
        recipe = {
            "layer": 0,
            "coordinates": [
                {"layer": 0, "neuron": 2, "dose": 1},
                {"layer": 2, "neuron": 4, "dose": -1},
            ],
        }
        with temporary_neuron_steering(self.backend, recipe):
            changed = model(tokens)
            mx.eval(changed)
            self.assertFalse(mx.allclose(baseline, changed).item())
        self.assertEqual([type(layer) for layer in model.layers], original_types)
        self.assertEqual(
            [type(layer.mlp.down_proj) for layer in model.layers], original_down_types
        )
        reset = model(tokens)
        mx.eval(reset)
        self.assertTrue(mx.array_equal(baseline, reset).item())

        invalid_recipe = {
            "layer": 0,
            "coordinates": [
                {"layer": 0, "neuron": 2, "dose": 1},
                {"layer": 2, "neuron": 64, "dose": -1},
            ],
        }
        with temporary_neuron_steering(self.backend, invalid_recipe):
            with self.assertRaisesRegex(SteeringError, "outside this layer"):
                model(tokens)
        self.assertEqual([type(layer) for layer in model.layers], original_types)
        self.assertEqual(
            [type(layer.mlp.down_proj) for layer in model.layers], original_down_types
        )

        direction = [1.0 / (32**0.5)] * 32
        with temporary_neuron_steering(
            SimpleNamespace(_model=model, _clear_prompt_cache=lambda: None, _speculative_draft=None),
            dict(layer=0, vector=direction, scale=1),
        ):
            steered = model(tokens)
            mx.eval(steered)
            self.assertFalse(mx.allclose(baseline, steered).item())
        self.assertTrue(mx.array_equal(baseline, model(tokens)).item())

    def test_real_qwen_learns_a_normalized_contrastive_direction(self):
        import threading
        from mlx_lm.models.qwen3 import Model, ModelArgs

        mx.random.seed(43)
        model = Model(ModelArgs(model_type="qwen3", hidden_size=32, num_hidden_layers=2,
            intermediate_size=64, num_attention_heads=4, rms_norm_eps=1e-6, vocab_size=64,
            num_key_value_heads=2, max_position_embeddings=128, head_dim=8,
            tie_word_embeddings=True, rope_theta=10000))

        class Tokenizer:
            def apply_chat_template(self, messages, **_kwargs):
                text = messages[0]["content"]
                return [1, 2, 3] if text.startswith("warm") else [8, 9, 10]

        class Backend:
            _model = model
            _tokenizer = Tokenizer()
            _generation_lock = threading.Lock()
            _speculative_draft = None
            _prompt_cache_unavailable = False
            _vlm_snapshot_store_unavailable = False

            def _clear_prompt_cache(self):
                pass

        direction = learn_steering_vector(
            Backend(), 0, ["warm one", "warm two"], ["cold one", "cold two"]
        )
        self.assertEqual(len(direction), 32)
        self.assertAlmostEqual(sum(value * value for value in direction), 1.0, places=4)

    def test_request_schema_rejects_invalid_values(self):
        from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
        source = ast.parse((ROOT / 'studio/backend/models/inference.py').read_text())
        coordinate = next(n for n in source.body if isinstance(n, ast.ClassDef) and n.name == 'NeuronCoordinate')
        schema = next(n for n in source.body if isinstance(n, ast.ClassDef) and n.name == 'NeuronSteering')
        scope = dict(BaseModel=BaseModel, ConfigDict=ConfigDict, Field=Field, Optional=Optional, field_validator=field_validator, model_validator=model_validator, math=math)
        exec(compile(ast.Module(body=[coordinate, schema], type_ignores=[]), '<schema>', 'exec'), scope)
        validate = scope['NeuronSteering']
        self.assertEqual(validate(layer=0, neuron=1, offset=-1).offset, -1)
        for change in [dict(layer=-1), dict(layer=True), dict(neuron=1.5), dict(offset=float('nan')), dict(offset=101), dict(extra=1)]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                validate(**(dict(layer=0, neuron=1, offset=1) | change))

    def test_transport_keeps_steering_for_worker(self):
        source = ast.parse((ROOT / 'studio/backend/core/inference/orchestrator.py').read_text())
        method = next(n for n in ast.walk(source) if isinstance(n, ast.FunctionDef) and n.name == '_build_generate_cmd')
        scope = {'Optional': Optional}
        exec(compile(ast.Module(body=[method], type_ignores=[]), '<transport>', 'exec'), scope)
        steering = dict(layer=0, neuron=1, offset=-1)
        cmd = scope['_build_generate_cmd'](SimpleNamespace(effective_parallel_slots=1), 'test', None, neuron_steering=steering)
        self.assertEqual(cmd['neuron_steering'], steering)


if __name__ == '__main__':
    unittest.main()
