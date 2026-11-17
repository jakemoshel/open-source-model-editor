// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { GuidedTour, useGuidedTourController } from "@/features/tour";
import { Link } from "@tanstack/react-router";
import { NeuronSteeringControls } from "./components/neuron-steering-controls";
import { useChatRuntimeStore } from "./stores/chat-runtime-store";
import { neuronSteeringTourSteps } from "./tour";

export function NeuronSteeringPage() {
  const checkpoint = useChatRuntimeStore((state) => state.params.checkpoint);
  const disabled = !checkpoint;
  const tour = useGuidedTourController({
    id: "neuron-steering",
    steps: neuronSteeringTourSteps,
  });

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-visible">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Neuron steering
          </h1>
          <p className="text-sm text-muted-foreground">
            Inspect neuron activations and steer local MLX replies. This is an
            inference experiment, not training, and it does not edit model
            weights.
          </p>
          <details
            data-tour="neuron-steering-about"
            className="rounded-lg border border-border/70 px-4 py-3 text-sm"
          >
            <summary className="cursor-pointer font-medium">
              What is a neuron, and what am I changing?
            </summary>
            <div className="mt-3 space-y-2 text-muted-foreground">
              <p>
                An MLP neuron is a signal inside a layer before down_proj. A
                residual coordinate is a different signal in the vector leaving
                the whole layer. It is not a separate mini-model, and it usually
                does not have one clean, human-readable meaning.
              </p>
              <p>
                The layer selects where in the model to intervene; the neuron
                index selects one coordinate at that layer. A positive offset
                adds to that coordinate and a negative offset subtracts from it.
                The −1 and +1 buttons change the offset by one; Reset sets it to
                zero, which turns this coordinate edit off. The size of an
                offset is experimental, not a percentage or a guaranteed
                strength scale.
              </p>
              <p>
                A coordinate is not labeled with a behavior like “polite” or
                “brief,” so changing one may do nothing useful or make replies
                worse. The example-based vector option instead compares positive
                and contrasting prompts to find a multi-coordinate direction.
                Either way, this only affects replies from the selected local
                model; it does not train or permanently change model weights.
              </p>
            </div>
          </details>
        </header>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-medium text-foreground">Active chat model</h2>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {checkpoint ||
                  "No chat model selected. Load Qwen in Chat first."}
              </p>
            </div>
            <Button asChild={true} variant="outline">
              <Link to="/chat">Open chat</Link>
            </Button>
          </div>
          {disabled && (
            <p className="text-sm text-muted-foreground">
              The controls stay disabled until a chat model is selected.
            </p>
          )}
          <div data-tour="neuron-steering-coordinate">
            <NeuronSteeringControls disabled={disabled} />
          </div>
        </section>
      </div>
      <GuidedTour {...tour.tourProps} />
    </main>
  );
}
