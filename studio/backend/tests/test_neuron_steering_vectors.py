import sys
import types

import pytest

from core.inference.neuron_steering import SteeringError, temporary_neuron_steering
from models.inference import ActivationSteeringLearnRequest, NeuronSteering


class FakeArray:
    def __init__(self, values, dtype="float32"):
        self.values = values
        self.dtype = dtype
        self.shape = (1, 1, len(values))
        self.ndim = 3

    def __mul__(self, scale):
        return FakeArray([value * scale for value in self.values], self.dtype)

    def __add__(self, other):
        return FakeArray([a + b for a, b in zip(self.values, other.values)], self.dtype)


class FakeLayer:
    def __call__(self, *_args, **_kwargs):
        return FakeArray([0.0, 0.0, 0.0])


class FakeBackend:
    def __init__(self):
        self._model = types.SimpleNamespace(layers=[FakeLayer()])
        self._speculative_draft = None
        self._prompt_cache_unavailable = False
        self._vlm_snapshot_store_unavailable = False

    def _clear_prompt_cache(self):
        pass


def install_fake_mlx(monkeypatch):
    mlx = types.ModuleType("mlx")
    core = types.ModuleType("mlx.core")
    core.array = FakeArray
    mlx.core = core
    monkeypatch.setitem(sys.modules, "mlx", mlx)
    monkeypatch.setitem(sys.modules, "mlx.core", core)


def test_vector_is_added_to_every_activation_coordinate(monkeypatch):
    install_fake_mlx(monkeypatch)
    backend = FakeBackend()
    original_type = type(backend._model.layers[0])
    with temporary_neuron_steering(
        backend, {"layer": 0, "vector": [0.2, -0.4, 0.1], "scale": 2}
    ):
        result = backend._model.layers[0]()
        assert result.values == pytest.approx([0.4, -0.8, 0.2])
    assert type(backend._model.layers[0]) is original_type


def test_vector_width_mismatch_fails_and_restores_layer(monkeypatch):
    install_fake_mlx(monkeypatch)
    backend = FakeBackend()
    original_type = type(backend._model.layers[0])
    with temporary_neuron_steering(backend, {"layer": 0, "vector": [1, 2], "scale": 1}):
        with pytest.raises(SteeringError, match="exactly 3 values"):
            backend._model.layers[0]()
    assert type(backend._model.layers[0]) is original_type


def test_legacy_coordinate_steering_schema_still_defaults_vector_fields():
    steering = NeuronSteering(layer=2, neuron=7, offset=1)
    assert steering.vector is None
    assert steering.scale == 1


def test_linked_down_proj_recipe_accepts_coordinates_across_layers():
    steering = NeuronSteering(
        layer=0,
        coordinates=[
            {"layer": 14, "neuron": 8949, "dose": 1},
            {"layer": 13, "neuron": 7956, "dose": -1},
        ],
    )
    assert [item.model_dump() for item in steering.coordinates] == [
        {"layer": 14, "neuron": 8949, "dose": 1},
        {"layer": 13, "neuron": 7956, "dose": -1},
    ]


def test_down_proj_coordinate_schema_rejects_invalid_doses():
    with pytest.raises(ValueError):
        NeuronSteering(layer=0, coordinates=[{"layer": 0, "neuron": 2, "dose": 11}])


def test_down_proj_recipe_cannot_be_combined_with_residual_or_vector_steering():
    coordinates = [{"layer": 0, "neuron": 2, "dose": 1}]
    with pytest.raises(ValueError, match="cannot be combined"):
        NeuronSteering(layer=0, offset=1, coordinates=coordinates)
    with pytest.raises(ValueError, match="cannot be combined"):
        NeuronSteering(layer=0, vector=[1], coordinates=coordinates)


def test_vector_schema_rejects_non_finite_or_oversized_values():
    with pytest.raises(ValueError):
        NeuronSteering(layer=0, vector=[float("nan")])
    with pytest.raises(ValueError):
        NeuronSteering(layer=0, vector=[0.0] * 65537)


def test_learn_request_needs_contrasting_nonempty_examples():
    with pytest.raises(ValueError):
        ActivationSteeringLearnRequest(layer=0, positive_examples=[], negative_examples=["x"])
    with pytest.raises(ValueError):
        ActivationSteeringLearnRequest(layer=0, positive_examples=["  "], negative_examples=["x"])
