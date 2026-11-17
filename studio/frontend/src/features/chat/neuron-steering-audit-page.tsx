// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { listTrainingRuns } from "@/features/training/api/history-api";
import type { TrainingRunSummary } from "@/features/training/types/history";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useChatModelRuntime } from "./hooks/use-chat-model-runtime";
import { useChatRuntimeStore } from "./stores/chat-runtime-store";
import {
  type SteeringRecipe,
  type SteeringRevision,
  useNeuronSteeringAuditStore,
} from "./stores/neuron-steering-audit-store";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function recipeSummary(revision: SteeringRevision) {
  const steering = revision.steering;
  if (steering.vector)
    return `learned direction · ${steering.vector.length} values · strength ${steering.scale ?? 1}`;
  if (steering.coordinates?.length)
    return steering.coordinates
      .map(
        ({ layer, neuron, dose }) =>
          `L${layer} N${neuron} ${dose > 0 ? "+" : ""}${dose}`,
      )
      .join(" · ");
  return `L${steering.layer} coordinate ${steering.neuron} · offset ${steering.offset > 0 ? "+" : ""}${steering.offset}`;
}

function RecipeCard({ recipe }: { recipe: SteeringRecipe }) {
  const activeModel = useChatRuntimeStore((state) => state.params.checkpoint);
  const [message, setMessage] = useState("");
  const [opening, setOpening] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const modelLoading = useChatRuntimeStore((state) => state.modelLoading);
  const { selectModel, refresh } = useChatModelRuntime();
  const navigate = useNavigate();
  const revisions = [...recipe.revisions].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const restore = async (revision: SteeringRevision) => {
    setOpening(true);
    setMessage("");
    try {
      if (useChatRuntimeStore.getState().params.checkpoint !== recipe.modelId) {
        await refresh();
        const state = useChatRuntimeStore.getState();
        await selectModel({
          id: recipe.modelId,
          isLora: state.loras.some((model) => model.id === recipe.modelId),
          throwOnError: true,
        });
      }
      const loaded = useChatRuntimeStore.getState();
      if (loaded.params.checkpoint !== recipe.modelId) {
        throw new Error("The recipe's model did not load. Try again or select it in Chat.");
      }
      useChatRuntimeStore.setState({
        params: { ...loaded.params, neuronSteering: { ...revision.steering } },
      });
      useNeuronSteeringAuditStore.getState().revertRecipe(recipe.id, revision.id);
      loaded.setActiveThreadId(null);
      loaded.setContextUsage(null);
      await navigate({ to: "/chat", search: { new: crypto.randomUUID() } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open this recipe. Try again.");
    } finally {
      setOpening(false);
    }
  };
  const reset = () => {
    if (activeModel !== recipe.modelId) {
      setMessage(
        `Select ${recipe.modelId} in Chat first. This recipe is model-specific.`,
      );
      return;
    }
    const state = useChatRuntimeStore.getState();
    useChatRuntimeStore.setState({
      params: { ...state.params, neuronSteering: undefined },
    });
    useNeuronSteeringAuditStore.getState().resetRecipe(recipe.id);
    setMessage("Steering is off for the original model. Open Chat to continue.");
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">{recipe.name}</h2>
        <p className="break-all text-xs text-muted-foreground">
          {recipe.modelId}
        </p>
        </div>
        <Button variant="destructive" className="min-h-10" onClick={() => setConfirmingDelete(true)}>Delete recipe</Button>
      </header>
      <Button
        className="min-h-11 self-start"
        disabled={opening || modelLoading || !revisions.length}
        onClick={() => void restore(revisions[0])}
      >
        {opening ? "Preparing chat…" : "Chat with recipe"}
      </Button>
      {modelLoading && <p role="status" className="text-sm text-muted-foreground">A model is loading. Wait for it to finish before opening a recipe.</p>}
      <Button
        variant="outline"
        className="min-h-10 self-start"
        disabled={activeModel !== recipe.modelId}
        onClick={reset}
      >
        Turn steering off
      </Button>
      <ol className="flex flex-col gap-2">
        {revisions.map((revision, index) => (
          <li
            key={revision.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 p-3"
          >
            <div className="min-w-0">
              <p className="text-sm">
                {revision.action === "reset"
                  ? "steering turned off"
                  : revision.action === "reverted"
                  ? "restored version"
                  : index === revisions.length - 1
                    ? "first saved version"
                    : "saved update"}
              </p>
              <p className="text-xs text-muted-foreground">
                {dateLabel(revision.createdAt)}
              </p>
              <p className="mt-1 break-words text-xs">
                {recipeSummary(revision)}
              </p>
            </div>
            <Button
              variant="outline"
              className="min-h-10"
              disabled={opening || modelLoading}
              onClick={() => void restore(revision)}
            >
              Chat with this version
            </Button>
          </li>
        ))}
      </ol>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete “{recipe.name}” and all its saved versions from this audit log? This cannot be undone. Your model files are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => useNeuronSteeringAuditStore.getState().deleteRecipe(recipe.id)}>Delete recipe</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function NeuronSteeringAuditPage() {
  const recipes = useNeuronSteeringAuditStore((state) => state.recipes);
  const [trainingRuns, setTrainingRuns] = useState<TrainingRunSummary[]>([]);
  const [trainingError, setTrainingError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void listTrainingRuns(50, 0, controller.signal)
      .then((result) => setTrainingRuns(result.runs))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setTrainingError(
            error instanceof Error
              ? error.message
              : "Training history could not load.",
          );
        }
      });
    return () => controller.abort();
  }, []);
  const sorted = [...recipes].sort((a, b) => {
    const aLatest = a.revisions.reduce(
      (latest, item) => (item.createdAt > latest ? item.createdAt : latest),
      a.createdAt,
    );
    const bLatest = b.revisions.reduce(
      (latest, item) => (item.createdAt > latest ? item.createdAt : latest),
      b.createdAt,
    );
    return bLatest.localeCompare(aLatest);
  });
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-visible">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Steering audit log
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Saved recipes and every saved or restored version stay in this app
              profile.
            </p>
          </div>
          <Button asChild={true} variant="outline">
            <Link to="/neuron-steering">Edit steering</Link>
          </Button>
        </header>
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-medium">Actual model training</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Training creates a separate adapter from example data; it does not
            rewrite the original model or turn neuron settings into weights.
            Open Train to create or review training runs, then select a
            completed adapter in Chat.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild={true} variant="outline" className="min-h-10">
              <Link to="/studio">Open Train and run history</Link>
            </Button>
            <Button asChild={true} variant="outline" className="min-h-10">
              <Link to="/chat">Open Chat</Link>
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-2" aria-label="Recent training runs">
            <h3 className="text-sm font-medium">Recent training runs</h3>
            {trainingRuns.length ? (
              trainingRuns.map((run) => (
                <div key={run.id} className="flex flex-wrap justify-between gap-2 rounded-md border border-border/70 p-3 text-sm">
                  <span className="min-w-0 break-words">{run.display_name || run.model_name} · {run.dataset_name}</span>
                  <span className="text-muted-foreground">{run.status} · {dateLabel(run.started_at)}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                {trainingError || "No training runs yet."}
              </p>
            )}
          </div>
        </section>
        {sorted.length ? (
          sorted.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} />)
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No recipes saved yet. Go to Neuron steering and use Save recipe.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          These entries are stored in this app profile, not backed up off this
          Mac. Keep your model and training output files; deleting them cannot
          be undone here.
        </p>
      </div>
    </main>
  );
}
