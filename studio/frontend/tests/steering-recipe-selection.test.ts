import assert from "node:assert/strict";
import test from "node:test";
import { readSrc } from "./helpers/kit.ts";
import {
  activeSteeringRecipe,
  shouldApplyNormalModelSelection,
} from "../src/features/chat/lib/steering-recipe-selection.ts";

const recipe = {
  id: "r1",
  name: "Concise",
  modelId: "local/qwen",
  createdAt: "2026-01-01",
  revisions: [
    { id: "v2", createdAt: "2026-02-01", action: "saved" as const, steering: { modelId: "local/qwen", layer: 14, neuron: 5, offset: 1, vector: [1, 0] } },
    { id: "v1", createdAt: "2026-01-01", action: "saved" as const, steering: { modelId: "local/qwen", layer: 13, neuron: 4, offset: -1 } },
  ],
};

test("active saved recipe is recognized for its current or earlier saved revision", () => {
  assert.equal(activeSteeringRecipe([recipe], { ...recipe.revisions[0].steering })?.id, "r1");
  assert.equal(activeSteeringRecipe([recipe], { ...recipe.revisions[1].steering })?.id, "r1");
  assert.equal(activeSteeringRecipe([recipe], undefined), undefined);
  assert.equal(activeSteeringRecipe([recipe], { modelId: "local/qwen", layer: 1, neuron: 2, offset: 1 }), undefined);
});

test("choosing the already-loaded model turns off its active steering", () => {
  assert.equal(
    shouldApplyNormalModelSelection("local/qwen", "local/qwen", true),
    true,
  );
  assert.equal(
    shouldApplyNormalModelSelection("local/qwen", "local/qwen", false),
    false,
  );
  assert.equal(
    shouldApplyNormalModelSelection("other/model", "local/qwen", false),
    true,
  );
});

test("recipe/model picker sits beside the thinking control", () => {
  const composer = readSrc("features/chat/shared-composer.tsx");
  const actions = composer.indexOf('className="aui-composer-action-wrapper');
  const picker = composer.indexOf("<SteeringRecipeComposerMenu />");
  const thinking = composer.indexOf("{showReasoningControl ?", actions);
  assert.ok(actions >= 0 && picker > actions && thinking > picker);
});
