import type { SteeringRecipe, SteeringSnapshot } from "../stores/neuron-steering-audit-store";

export function shouldApplyNormalModelSelection(
  modelId: string,
  currentModelId: string,
  hasActiveSteering: boolean,
): boolean {
  return modelId !== currentModelId || hasActiveSteering;
}

function snapshotKey(snapshot: SteeringSnapshot): string {
  return JSON.stringify([
    snapshot.modelId,
    snapshot.layer,
    snapshot.neuron,
    snapshot.offset,
    snapshot.vector ?? null,
    snapshot.scale ?? null,
    snapshot.coordinates ?? null,
  ]);
}

export function activeSteeringRecipe(
  recipes: SteeringRecipe[],
  steering?: SteeringSnapshot,
): SteeringRecipe | undefined {
  if (!steering) return undefined;
  const key = snapshotKey(steering);
  return recipes.find(
    (recipe) =>
      recipe.modelId === steering.modelId &&
      recipe.revisions.some((revision) => snapshotKey(revision.steering) === key),
  );
}
