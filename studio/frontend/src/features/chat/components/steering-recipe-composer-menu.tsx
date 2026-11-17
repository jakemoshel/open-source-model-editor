// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useChatModelRuntime } from "../hooks/use-chat-model-runtime";
import { useNeuronSteeringAuditStore } from "../stores/neuron-steering-audit-store";
import { useChatRuntimeStore } from "../stores/chat-runtime-store";
import {
  activeSteeringRecipe,
  shouldApplyNormalModelSelection,
} from "../lib/steering-recipe-selection";
import { toast } from "@/lib/toast";
import { useState } from "react";

export function SteeringRecipeComposerMenu() {
  const checkpoint = useChatRuntimeStore((state) => state.params.checkpoint);
  const activeSteering = useChatRuntimeStore((state) => state.params.neuronSteering);
  const models = useChatRuntimeStore((state) => state.models);
  const recipes = useNeuronSteeringAuditStore((state) => state.recipes);
  const { refresh, selectModel } = useChatModelRuntime();
  const [busy, setBusy] = useState(false);
  const selectedRecipe = activeSteeringRecipe(recipes, activeSteering);
  const modelName = models.find((model) => model.id === checkpoint)?.name ?? checkpoint;

  const apply = async (recipeId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const state = useNeuronSteeringAuditStore.getState();
      const recipe = state.recipes.find((item) => item.id === recipeId);
      const revision = recipe?.revisions[0];
      if (!recipe || !revision) return;
      if (useChatRuntimeStore.getState().params.checkpoint !== recipe.modelId) {
        await refresh();
        const runtime = useChatRuntimeStore.getState();
        await selectModel({
          id: recipe.modelId,
          isLora: runtime.loras.some((model) => model.id === recipe.modelId),
          throwOnError: true,
        });
      }
      const runtime = useChatRuntimeStore.getState();
      if (runtime.params.checkpoint !== recipe.modelId) throw new Error("Could not load the recipe's model.");
      runtime.setParams({ ...runtime.params, neuronSteering: { ...revision.steering } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply this recipe.");
    } finally {
      setBusy(false);
    }
  };

  const chooseModel = async (modelId: string) => {
    if (
      busy ||
      !shouldApplyNormalModelSelection(
        modelId,
        checkpoint,
        Boolean(activeSteering),
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      if (useChatRuntimeStore.getState().params.checkpoint !== modelId) {
        await selectModel(modelId);
      }
      const runtime = useChatRuntimeStore.getState();
      if (runtime.params.checkpoint !== modelId) throw new Error("Could not load this model.");
      runtime.setParams({ ...runtime.params, neuronSteering: undefined });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load this model.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={selectedRecipe ? `Active recipe: ${selectedRecipe.name}` : activeSteering ? "Custom steering active" : `Current model: ${modelName || "choose model"}`} className="min-h-11 min-w-11 max-w-40 truncate px-3 text-sm">
          {busy ? "Loading…" : selectedRecipe?.name ?? (activeSteering ? "Custom steering" : modelName || "Choose model")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel>Models</DropdownMenuLabel>
        {models.length ? models.map((model) => (
          <DropdownMenuItem key={model.id} disabled={busy} onSelect={() => void chooseModel(model.id)}>
            <span className="min-w-0 flex-1 truncate">{model.name || model.id}</span>
            <span className={`ms-2 text-xs ${checkpoint === model.id ? "text-foreground" : "text-muted-foreground"}`}>
              {checkpoint === model.id ? activeSteering ? "normal chat" : "selected" : ""}
            </span>
          </DropdownMenuItem>
        )) : <DropdownMenuItem disabled>No models available</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Chat setup</DropdownMenuLabel>
        <DropdownMenuItem disabled={busy || !activeSteering} onSelect={() => useChatRuntimeStore.getState().setParams({ ...useChatRuntimeStore.getState().params, neuronSteering: undefined })}>
          Normal · steering off{!activeSteering ? " · selected" : ""}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Saved recipes</DropdownMenuLabel>
        {recipes.length ? recipes.map((recipe) => (
          <DropdownMenuItem key={recipe.id} disabled={busy} onSelect={() => void apply(recipe.id)}>
            <span className="min-w-0 flex-1 truncate">{recipe.name}</span>
            <span className="ms-2 max-w-24 truncate text-xs text-muted-foreground">{selectedRecipe?.id === recipe.id ? "selected" : recipe.modelId}</span>
          </DropdownMenuItem>
        )) : <DropdownMenuItem disabled>No saved recipes yet</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
