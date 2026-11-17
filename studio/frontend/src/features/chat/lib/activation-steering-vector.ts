export function parseSavedSteeringVector(text: string, modelId: string) {
  const saved = JSON.parse(text) as {
		// biome-ignore lint/style/useNamingConvention: versioned vector files use this persisted JSON key.
    model_id?: unknown;
    layer?: unknown;
    vector?: unknown;
  };
  if (
    saved.model_id !== modelId ||
    !Number.isSafeInteger(saved.layer) ||
    (saved.layer as number) < 0 ||
    !Array.isArray(saved.vector) ||
		saved.vector.length === 0 ||
    saved.vector.length > 65536 ||
    !saved.vector.every(
      (value) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        Math.abs(value) <= 100,
    )
  ) {
    throw new Error(
      "This file is invalid or belongs to a different model. Use a vector saved for the currently loaded model.",
    );
  }
  return { layer: saved.layer as number, vector: saved.vector as number[] };
}
