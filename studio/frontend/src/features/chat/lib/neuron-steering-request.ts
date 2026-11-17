import type { InferenceParams } from "../types/runtime";

export function neuronSteeringRequest(params: InferenceParams, isMlx: boolean) {
  const steering = params.neuronSteering;
  if (
    !isMlx ||
    steering?.modelId !== params.checkpoint ||
    (steering.coordinates?.length
      ? steering.coordinates.every((item) => item.dose === 0)
      : steering.vector
        ? (steering.scale ?? 1) === 0
        : steering.offset === 0)
  ) {
    return {};
  }
  return {
    // biome-ignore lint/style/useNamingConvention: OpenAI-compatible API wire fields use snake_case.
    neuron_steering: {
      layer: steering.layer,
      neuron: steering.neuron,
      offset: steering.offset,
      ...(steering.coordinates?.length
        ? { coordinates: steering.coordinates }
        : {}),
      ...(steering.vector
        ? { vector: steering.vector, scale: steering.scale ?? 1 }
        : {}),
    },
  };
}
