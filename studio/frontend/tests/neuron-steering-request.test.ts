import assert from "node:assert/strict";
import test from "node:test";

import { neuronSteeringRequest } from "../src/features/chat/lib/neuron-steering-request.ts";
import { parseSavedSteeringVector } from "../src/features/chat/lib/activation-steering-vector.ts";
import type { InferenceParams } from "../src/features/chat/types/runtime.ts";

function params(overrides: Partial<InferenceParams> = {}): InferenceParams {
  return {
    temperature: 0.6,
    topP: 0.95,
    topK: 0,
    minP: 0,
    repetitionPenalty: 1,
    presencePenalty: 0,
    maxSeqLength: 4096,
    maxTokens: 256,
    systemPrompt: "",
    systemVariables: "",
    checkpoint: "model-a",
    neuronSteering: {
      modelId: "model-a",
      layer: 3,
      neuron: 8,
      offset: 2,
    },
    ...overrides,
  };
}

test("legacy coordinate steering remains an MLX-only request", () => {
  assert.deepEqual(neuronSteeringRequest(params(), true), {
    neuron_steering: { layer: 3, neuron: 8, offset: 2 },
  });
  assert.deepEqual(neuronSteeringRequest(params(), false), {});
});

test("down_proj recipe coordinates are sent as multiple layer-specific neuron edits", () => {
  const request = neuronSteeringRequest(
    params({
      neuronSteering: {
        modelId: "model-a",
        layer: 0,
        neuron: 0,
        offset: 0,
        coordinates: [
          { layer: 14, neuron: 8949, dose: 1 },
          { layer: 13, neuron: 7956, dose: -1 },
        ],
      },
    }),
    true,
  );
  assert.deepEqual(request, {
    neuron_steering: {
      layer: 0,
      neuron: 0,
      offset: 0,
      coordinates: [
        { layer: 14, neuron: 8949, dose: 1 },
        { layer: 13, neuron: 7956, dose: -1 },
      ],
    },
  });
});

test("a learned vector is sent with its layer and strength even when coordinate offset is zero", () => {
  assert.deepEqual(
    neuronSteeringRequest(
      params({
        neuronSteering: {
          modelId: "model-a",
          layer: 4,
          neuron: 0,
          offset: 0,
          vector: [0.6, 0.8],
          scale: -0.5,
        },
      }),
      true,
    ),
    {
      neuron_steering: {
        layer: 4,
        neuron: 0,
        offset: 0,
        vector: [0.6, 0.8],
        scale: -0.5,
      },
    },
  );
});

test("a vector from another selected model is not sent", () => {
  assert.deepEqual(
    neuronSteeringRequest(
      params({
        neuronSteering: {
          modelId: "model-b",
          layer: 4,
          neuron: 0,
          offset: 0,
          vector: [1],
        },
      }),
      true,
    ),
    {},
  );
});

test("saved vectors are accepted only for the matching model and valid shape", () => {
  const saved = JSON.stringify({
    version: 1,
    model_id: "model-a",
    layer: 2,
    vector: [0.6, 0.8],
  });
  assert.deepEqual(parseSavedSteeringVector(saved, "model-a"), {
    layer: 2,
    vector: [0.6, 0.8],
  });
  assert.throws(
    () => parseSavedSteeringVector(saved, "model-b"),
    /different model/,
  );
  assert.throws(
    () =>
      parseSavedSteeringVector(
        JSON.stringify({ model_id: "model-a", layer: -1, vector: [1] }),
        "model-a",
      ),
    /invalid/,
  );
  assert.throws(
    () =>
      parseSavedSteeringVector(
        JSON.stringify({ model_id: "model-a", layer: 1, vector: [Number.NaN] }),
        "model-a",
      ),
    /invalid/,
  );
});
