// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InferenceParams } from "../types/runtime";

export type SteeringSnapshot = NonNullable<InferenceParams["neuronSteering"]>;

export interface SteeringRevision {
  id: string;
  createdAt: string;
  action: "saved" | "reverted" | "reset";
  sourceRevisionId?: string;
  steering: SteeringSnapshot;
}

export interface SteeringRecipe {
  id: string;
  name: string;
  modelId: string;
  createdAt: string;
  revisions: SteeringRevision[];
}

interface SteeringAuditState {
  recipes: SteeringRecipe[];
  saveRecipe: (name: string, steering: SteeringSnapshot) => string;
  revertRecipe: (recipeId: string, revisionId: string) => void;
  resetRecipe: (recipeId: string) => void;
  deleteRecipe: (recipeId: string) => void;
}

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function copySnapshot(steering: SteeringSnapshot): SteeringSnapshot {
  return {
    ...steering,
    vector: steering.vector ? [...steering.vector] : undefined,
    coordinates: steering.coordinates?.map((coordinate) => ({ ...coordinate })),
  };
}

export const useNeuronSteeringAuditStore = create<SteeringAuditState>()(
  persist(
    (set) => ({
      recipes: [],
      saveRecipe: (rawName, steering) => {
        const name = rawName.trim();
        if (!name) throw new Error("Give this recipe a name before saving.");
        const now = new Date().toISOString();
        const revision: SteeringRevision = {
          id: makeId(),
          createdAt: now,
          action: "saved",
          steering: copySnapshot(steering),
        };
        let recipeId = "";
        set((state) => {
          const existing = state.recipes.find(
            (recipe) =>
              recipe.modelId === steering.modelId &&
              recipe.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          );
          if (existing) {
            recipeId = existing.id;
            return {
              recipes: state.recipes.map((recipe) =>
                recipe.id === existing.id
                  ? { ...recipe, revisions: [revision, ...recipe.revisions] }
                  : recipe,
              ),
            };
          }
          recipeId = makeId();
          return {
            recipes: [
              {
                id: recipeId,
                name,
                modelId: steering.modelId,
                createdAt: now,
                revisions: [revision],
              },
              ...state.recipes,
            ],
          };
        });
        return recipeId;
      },
      revertRecipe: (recipeId, revisionId) =>
        set((state) => ({
          recipes: state.recipes.map((recipe) => {
            if (recipe.id !== recipeId) return recipe;
            const target = recipe.revisions.find(
              (item) => item.id === revisionId,
            );
            if (!target) return recipe;
            return {
              ...recipe,
              revisions: [
                {
                  id: makeId(),
                  createdAt: new Date().toISOString(),
                  action: "reverted",
                  sourceRevisionId: target.id,
                  steering: copySnapshot(target.steering),
                },
                ...recipe.revisions,
              ],
            };
          }),
        })),
      resetRecipe: (recipeId) =>
        set((state) => ({
          recipes: state.recipes.map((recipe) =>
            recipe.id === recipeId
              ? {
                  ...recipe,
                  revisions: [
                    {
                      id: makeId(),
                      createdAt: new Date().toISOString(),
                      action: "reset",
                      steering: {
                        modelId: recipe.modelId,
                        layer: 0,
                        neuron: 0,
                        offset: 0,
                      },
                    },
                    ...recipe.revisions,
                  ],
                }
              : recipe,
          ),
        })),
      deleteRecipe: (recipeId) =>
        set((state) => ({
          recipes: state.recipes.filter((recipe) => recipe.id !== recipeId),
        })),
    }),
    {
      name: "unsloth_neuron_steering_audit_v1",
      partialize: (state) => ({ recipes: state.recipes }),
      merge: (persisted, current) => {
        const recipes = (persisted as Partial<SteeringAuditState> | undefined)
          ?.recipes;
        return {
          ...current,
          recipes: Array.isArray(recipes) ? recipes : [],
        };
      },
    },
  ),
);
