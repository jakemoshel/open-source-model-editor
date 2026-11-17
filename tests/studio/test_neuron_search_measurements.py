"""Check search measurements without loading model weights or requiring MLX."""
import importlib.util
import sys
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np


class SearchMeasurements(unittest.TestCase):
    def test_measurements_match_prompt_contrast_and_restore_hook(self):
        path = Path(__file__).resolve().parents[2] / 'studio/backend/core/inference/neuron_steering.py'
        spec = importlib.util.spec_from_file_location('steering_measurements', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        class Down:
            weight = np.ones((2, 3))
            def __call__(self, x):
                return x

        down = Down()
        layer = types.SimpleNamespace(mlp=types.SimpleNamespace(down_proj=down))
        class Model:
            layers = [layer]
            def __call__(self, tokens):
                value = float(tokens[0, 0])
                return down(np.array([[[999., 999., 999.], [value, -value, 0.]]]))

        backend = types.SimpleNamespace(
            _model=Model(), _tokenizer=types.SimpleNamespace(
                apply_chat_template=lambda messages, **kwargs: [4 if messages[0]['content'] == 'desired' else 1]),
            _generation_lock=threading.Lock(), _clear_prompt_cache=lambda: None)
        core = types.ModuleType('mlx.core')
        for name in ('array', 'mean', 'stack', 'float32'):
            setattr(core, name, getattr(np, name))
        core.eval = lambda *args: None
        mlx = types.ModuleType('mlx')
        mlx.core = core
        with patch.dict(sys.modules, {'mlx': mlx, 'mlx.core': core}):
            rows = module.search_neurons(backend, 0, ['desired'], ['contrast'], 3)
        self.assertEqual(rows[0], dict(neuron=0, score=3., positiveActivations=[4.], negativeActivations=[1.]))
        self.assertEqual(rows[1]['score'], -3.)
        self.assertIs(type(down), Down)


if __name__ == '__main__':
    unittest.main()
