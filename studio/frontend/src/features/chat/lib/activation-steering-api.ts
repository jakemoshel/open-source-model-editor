import { authFetch } from "@/features/auth";

export type LearnedSteeringVector = {
  modelId: string;
  layer: number;
  method: "contrastive_activation_addition";
  vector: number[];
};

export type SearchedNeuron = {
  neuron: number;
  score: number;
  positiveActivations: number[];
  negativeActivations: number[];
};

export async function searchSteeringNeurons(input: {
  layer: number;
  positiveExamples: string[];
  negativeExamples: string[];
  limit?: number;
}): Promise<SearchedNeuron[]> {
  const response = await authFetch(
    "/api/inference/activation-steering/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layer: input.layer,
        positive_examples: input.positiveExamples,
        negative_examples: input.negativeExamples,
        limit: input.limit ?? 20,
      }),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(
      body.detail || `Neuron search failed (${response.status}).`,
    );
  }
  const result = (await response.json()) as { neurons: SearchedNeuron[] };
  return result.neurons;
}

export async function learnSteeringVector(input: {
  layer: number;
  positiveExamples: string[];
  negativeExamples: string[];
}): Promise<LearnedSteeringVector> {
  const response = await authFetch("/api/inference/activation-steering/learn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      layer: input.layer,
      // biome-ignore lint/style/useNamingConvention: the backend request schema uses snake_case.
      positive_examples: input.positiveExamples,
      // biome-ignore lint/style/useNamingConvention: the backend request schema uses snake_case.
      negative_examples: input.negativeExamples,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      detail?: string | { msg?: string };
    };
    const detail =
      typeof body.detail === "string" ? body.detail : body.detail?.msg;
    throw new Error(
      detail || `Could not learn a steering vector (${response.status}).`,
    );
  }
  const result = (await response.json()) as {
    // biome-ignore lint/style/useNamingConvention: the backend response schema uses snake_case.
    model_id: string;
    layer: number;
    method: LearnedSteeringVector["method"];
    vector: number[];
  };
  return {
    modelId: result.model_id,
    layer: result.layer,
    method: result.method,
    vector: result.vector,
  };
}
