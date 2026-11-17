# SPDX-License-Identifier: AGPL-3.0-only
"""Request-scoped residual-stream steering; model parameters are never written."""

import math
from contextlib import contextmanager


class SteeringError(ValueError):
    public = True
    openai_param = "neuron_steering"


def search_neurons(backend, layer_index, positive_examples, negative_examples, limit=20):
    """Rank down_proj coordinates by their contrastive activation on example prompts."""
    import mlx.core as mx

    model = getattr(backend._model, "language_model", backend._model)
    layers = getattr(model, "layers", None)
    if layers is None:
        layers = getattr(getattr(model, "model", None), "layers", None)
    if not layers or type(layer_index) is not int or not 0 <= layer_index < len(layers):
        raise SteeringError("Choose a valid decoder layer before searching neurons.")
    if getattr(backend, "_speculative_draft", None) is not None:
        raise SteeringError("Turn off speculative decoding and reload the model before searching.")
    tokenizer = getattr(backend, "_tokenizer", None)
    if tokenizer is None:
        raise SteeringError("Load a local text model before searching neurons.")
    layer = layers[layer_index]
    mlp = getattr(layer, "mlp", None)
    down = getattr(mlp, "down_proj", None)
    weight = getattr(down, "weight", None)
    if down is None or weight is None or len(weight.shape) != 2:
        raise SteeringError("This layer does not expose a searchable down_proj.")
    captured = []
    down_type = type(down)
    def tokens(text):
        try:
            ids = tokenizer.apply_chat_template([{"role": "user", "content": text}], tokenize=True, add_generation_prompt=True)
            if hasattr(ids, "tolist"):
                ids = ids.tolist()
            if ids and isinstance(ids[0], list):
                ids = ids[0]
        except (AttributeError, TypeError, ValueError):
            ids = tokenizer.encode(text, add_special_tokens=True)
        if not ids or len(ids) > 4096:
            raise SteeringError("Each search example must tokenize to between 1 and 4,096 tokens.")
        return mx.array([ids])
    def probe(text):
        captured.clear()
        class CapturingDown(down_type):
            def __call__(self, x, *args, **kwargs):
                captured.append(x)
                return down_type.__call__(self, x, *args, **kwargs)
        try:
            down.__class__ = CapturingDown
            backend._model(tokens(text))
            if not captured:
                raise SteeringError("The model did not expose down_proj activations for this layer.")
            value = captured[-1]
            mx.eval(value)
            # Prompt-start tokens are excluded, matching the linked experiment.
            value = value[:, 1:, :] if value.shape[-2] > 1 else value
            return mx.mean(value.astype(mx.float32), axis=(0, 1))
        finally:
            down.__class__ = down_type
    def run():
        with backend._generation_lock:
            backend._prompt_cache_unavailable = True
            backend._vlm_snapshot_store_unavailable = True
            backend._clear_prompt_cache()
            try:
                positive = [probe(x) for x in positive_examples]
                negative = [probe(x) for x in negative_examples]
                delta = mx.mean(mx.stack(positive), axis=0) - mx.mean(mx.stack(negative), axis=0)
                mx.eval(delta)
                scores = delta.tolist()
                positive_values = [value.tolist() for value in positive]
                negative_values = [value.tolist() for value in negative]
                # Absolute contrast is useful for discovery; sign preserves which
                # prompt set activates the coordinate more strongly.
                ranked = sorted(range(len(scores)), key=lambda i: abs(scores[i]), reverse=True)[:limit]
                return [{
                    "neuron": int(i), "score": float(scores[i]),
                    "positiveActivations": [float(values[i]) for values in positive_values],
                    "negativeActivations": [float(values[i]) for values in negative_values],
                } for i in ranked]
            finally:
                backend._clear_prompt_cache()
    return run()


def _patch_down_proj_layer(layer, down, weight, selected, mx):
    """Bind one layer's hooks in a factory so each layer keeps its own state."""
    layer_base, down_base = type(layer), type(down)
    state = {"resid_norm": 0.0}

    class SteeredLayer(layer_base):
        def __call__(self, *args, **kwargs):
            residual = args[0] if args else kwargs.get("x")
            if residual is not None and getattr(residual, "ndim", 0) >= 3:
                norm = mx.sqrt(mx.sum(residual.astype(mx.float32) ** 2, axis=-1)).reshape(-1)
                if norm.shape[0] > 1:
                    norm = norm[1:]
                if norm.shape[0]:
                    state["resid_norm"] = float(mx.median(norm).item())
            return layer_base.__call__(self, *args, **kwargs)

    class SteeredDown(down_base):
        def __call__(self, x, *args, **kwargs):
            widths = x.shape[-1]
            if any(neuron >= widths for neuron, _ in selected):
                raise SteeringError("A selected neuron is outside this layer's down_proj input width.")
            # MLX quantized Linear weights are packed, so their stored final
            # dimension is not the neuron width. Expand only when needed.
            full_weight = weight
            if weight.shape[-1] != widths:
                scales = getattr(self, "scales", None)
                biases = getattr(self, "biases", None)
                if scales is None or biases is None:
                    raise SteeringError("This down_proj weight format cannot be inspected for neuron steering.")
                full_weight = mx.dequantize(
                    weight, scales, biases,
                    group_size=getattr(self, "group_size", 64),
                    bits=getattr(self, "bits", 4),
                )
            delta = mx.zeros((widths,), dtype=x.dtype)
            for neuron, dose in selected:
                column_norm = mx.sqrt(mx.sum(full_weight[:, neuron].astype(mx.float32) ** 2))
                mx.eval(column_norm)
                denom = float(column_norm.item())
                if not denom > 1e-12:
                    raise SteeringError("A selected down_proj neuron has a zero weight norm.")
                amount = dose * state["resid_norm"] / denom
                delta = delta + (mx.arange(widths) == neuron).astype(x.dtype) * amount
            return down_base.__call__(self, x + delta, *args, **kwargs)

    layer.__class__ = SteeredLayer
    down.__class__ = SteeredDown
    return layer, layer_base, down, down_base


def learn_steering_vector(backend, layer_index, positive_examples, negative_examples):
    """Return a unit CAA direction: mean positive-prompt activations minus negative."""
    import mlx.core as mx

    model = getattr(backend._model, "language_model", backend._model)
    layers = getattr(model, "layers", None)
    if layers is None:
        layers = getattr(getattr(model, "model", None), "layers", None)
    if not layers:
        raise SteeringError("This model does not expose decoder layers for steering-vector learning.")
    if type(layer_index) is not int or not 0 <= layer_index < len(layers):
        raise SteeringError(f"Layer must be between 0 and {len(layers) - 1}.")
    if getattr(backend, "_speculative_draft", None) is not None:
        raise SteeringError("Turn off speculative decoding and reload the model before learning a vector.")
    tokenizer = getattr(backend, "_tokenizer", None)
    if tokenizer is None:
        raise SteeringError("Load a local text model before learning a steering vector.")

    layer = layers[layer_index]
    base = type(layer)
    captured = []

    def prompt_tokens(text):
        messages = [{"role": "user", "content": text}]
        try:
            tokens = tokenizer.apply_chat_template(
                messages, tokenize = True, add_generation_prompt = True
            )
            if hasattr(tokens, "tolist"):
                tokens = tokens.tolist()
            if tokens and isinstance(tokens[0], list):
                tokens = tokens[0]
        except (AttributeError, TypeError, ValueError):
            tokens = tokenizer.encode(text, add_special_tokens = True)
        if not tokens or len(tokens) > 4096:
            raise SteeringError("Each example must tokenize to between 1 and 4,096 tokens.")
        return mx.array([tokens])

    def mean_activation(text):
        captured.clear()

        class CapturingLayer(base):
            def __call__(self, *args, **kwargs):
                output = base.__call__(self, *args, **kwargs)
                if not isinstance(output, mx.array) or output.ndim < 2:
                    raise SteeringError("This layer output cannot be used to learn a vector.")
                captured.append(output)
                return output

        try:
            layer.__class__ = CapturingLayer
            backend._model(prompt_tokens(text))
            if not captured:
                raise SteeringError("The model did not expose activations for the selected layer.")
            activation = captured[-1]
            mx.eval(activation)
            return mx.mean(activation.astype(mx.float32), axis = (0, 1))
        finally:
            layer.__class__ = base

    # Avoid racing generation or reading/writing prompt caches while forwarding examples.
    with backend._generation_lock:
        backend._prompt_cache_unavailable = True
        backend._vlm_snapshot_store_unavailable = True
        backend._clear_prompt_cache()
        try:
            positive = [mean_activation(text) for text in positive_examples]
            negative = [mean_activation(text) for text in negative_examples]
            direction = mx.mean(mx.stack(positive), axis = 0) - mx.mean(mx.stack(negative), axis = 0)
            norm = mx.sqrt(mx.sum(direction * direction))
            mx.eval(norm)
            if not float(norm.item()) > 1e-12:
                raise SteeringError("These examples produced no distinct activation direction; try clearer contrasts.")
            direction = direction / norm
            mx.eval(direction)
            return direction.tolist()
        finally:
            backend._clear_prompt_cache()


@contextmanager
def temporary_neuron_steering(backend, steering):
    coordinates = steering.get("coordinates")
    if coordinates is not None:
        import mlx.core as mx
        model = getattr(backend._model, "language_model", backend._model)
        layers = getattr(model, "layers", None)
        if layers is None:
            layers = getattr(getattr(model, "model", None), "layers", None)
        if not layers or not isinstance(coordinates, (list, tuple)) or not 1 <= len(coordinates) <= 32:
            raise SteeringError("Provide 1 to 32 down_proj neuron coordinates.")
        if getattr(backend, "_speculative_draft", None) is not None:
            raise SteeringError("Turn off speculative decoding and reload the model before steering.")
        by_layer = {}
        for item in coordinates:
            layer_index, neuron, dose = item.get("layer"), item.get("neuron"), item.get("dose")
            if (type(layer_index) is not int or not 0 <= layer_index < len(layers)
                    or type(neuron) is not int or neuron < 0
                    or type(dose) not in (int, float) or not math.isfinite(dose) or abs(dose) > 10):
                raise SteeringError("Each neuron needs a valid layer, non-negative index, and dose from -10 to 10.")
            by_layer.setdefault(layer_index, []).append((neuron, float(dose)))
        patched = []
        backend._clear_prompt_cache()
        backend._prompt_cache_unavailable = True
        backend._vlm_snapshot_store_unavailable = True
        try:
            for layer_index, selected in by_layer.items():
                layer = layers[layer_index]
                down = getattr(getattr(layer, "mlp", None), "down_proj", None)
                weight = getattr(down, "weight", None)
                if down is None or weight is None:
                    raise SteeringError(f"Layer {layer_index} has no steerable down_proj.")
                patched.append(_patch_down_proj_layer(layer, down, weight, selected, mx))
            yield
        finally:
            for layer, layer_base, down, down_base in reversed(patched):
                down.__class__ = down_base
                layer.__class__ = layer_base
            backend._clear_prompt_cache()
        return
    layer_index = steering.get("layer")
    neuron = steering.get("neuron", 0)
    offset = steering.get("offset", 0)
    vector = steering.get("vector")
    scale = steering.get("scale", 1)
    if (
        type(layer_index) is not int or layer_index < 0
        or type(neuron) is not int or neuron < 0
        or type(offset) not in (int, float) or not math.isfinite(offset)
        or not -100 <= offset <= 100
        or type(scale) not in (int, float) or not math.isfinite(scale)
        or not -10 <= scale <= 10
        or (vector is not None and (
            not isinstance(vector, (list, tuple)) or not vector
            or len(vector) > 65536
            or any(type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 100 for value in vector)
        ))
    ):
        raise SteeringError("Use a non-negative layer and neuron, a finite offset from -100 to 100, and a finite vector of at most 65,536 values between -100 and 100.")
    if not offset and (vector is None or scale == 0):
        yield
        return
    if getattr(backend, "_speculative_draft", None) is not None:
        raise SteeringError("Turn off speculative decoding and reload the model before steering.")
    model = getattr(backend._model, "language_model", backend._model)
    layers = getattr(model, "layers", None)
    if layers is None:
        layers = getattr(getattr(model, "model", None), "layers", None)
    if layers is None or not len(layers):
        raise SteeringError("This model does not expose decoder layers for neuron steering.")
    if layer_index >= len(layers):
        raise SteeringError(f"Layer must be between 0 and {len(layers) - 1}.")
    layer = layers[layer_index]
    base = type(layer)

    class SteeredLayer(base):
        def __call__(self, *args, **kwargs):
            import mlx.core as mx

            output = base.__call__(self, *args, **kwargs)
            if not isinstance(output, mx.array) or output.ndim < 2:
                raise SteeringError("This decoder layer's output does not support neuron steering.")
            width = output.shape[-1]
            if vector is not None:
                if len(vector) != width:
                    raise SteeringError(f"Steering vector must have exactly {width} values for this model layer.")
                direction = mx.array(vector, dtype=output.dtype)
                return output + direction * scale
            if neuron >= width:
                raise SteeringError(f"Neuron must be between 0 and {width - 1}.")
            # Broadcast over every prompt/generated token, preserving the original tensor and weights.
            return output + (mx.arange(width) == neuron).astype(output.dtype) * offset

    # A baseline KV cache encodes different activations. Neither read it nor retain steered state.
    backend._clear_prompt_cache()
    backend._prompt_cache_unavailable = True
    backend._vlm_snapshot_store_unavailable = True
    try:
        layer.__class__ = SteeredLayer
        yield
    finally:
        layer.__class__ = base
        backend._clear_prompt_cache()
