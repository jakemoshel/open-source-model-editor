// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import assert from "node:assert/strict";
import test from "node:test";
import { useNeuronSteeringAuditStore } from "../src/features/chat/stores/neuron-steering-audit-store.ts";

test("saved steering keeps model-specific immutable revisions and can restore one", () => {
  const store = useNeuronSteeringAuditStore;
  store.setState({ recipes: [] });
  const first = { modelId: "local/qwen", layer: 14, neuron: 8949, offset: 1 };
  const second = { ...first, layer: 13, neuron: 7956, offset: -1 };
  const recipeId = store.getState().saveRecipe("two neurons", first);
  store.getState().saveRecipe("Two Neurons", second);
  const recipe = store.getState().recipes[0];
  assert.equal(recipe.id, recipeId);
  assert.equal(recipe.revisions.length, 2);
  assert.equal(recipe.revisions[0].steering.neuron, 7956);
  assert.equal(recipe.revisions[1].steering.neuron, 8949);

  store.getState().revertRecipe(recipeId, recipe.revisions[1].id);
  const reverted = store.getState().recipes[0].revisions[0];
  assert.equal(reverted.action, "reverted");
  assert.equal(reverted.steering.neuron, 8949);
  assert.equal(reverted.sourceRevisionId, recipe.revisions[1].id);
  store.getState().resetRecipe(recipeId);
  const reset = store.getState().recipes[0].revisions[0];
  assert.equal(reset.action, "reset");
  assert.equal(reset.steering.offset, 0);
  assert.equal(reset.steering.modelId, "local/qwen");
  assert.throws(() => store.getState().saveRecipe("  ", first), /name/);
  const otherRecipeId = store
    .getState()
    .saveRecipe("keep", { ...first, modelId: "other/model" });
  store.getState().deleteRecipe(recipeId);
  assert.deepEqual(
    store.getState().recipes.map((item) => item.id),
    [otherRecipeId],
  );
  store.setState({ recipes: [] });
});
