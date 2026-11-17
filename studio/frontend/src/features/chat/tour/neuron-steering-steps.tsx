// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import type { TourStep } from "@/features/tour";

export const neuronSteeringTourSteps: TourStep[] = [
  {
    id: "meaning",
    target: "neuron-steering-about",
    title: "What a neuron means here",
    body: (
      <>
        This is one numeric activation coordinate inside a model layer, not a
        named concept. The explanation here covers what can and cannot be
        inferred from changing it.
      </>
    ),
  },
  {
    id: "coordinate",
    target: "neuron-steering-coordinate",
    title: "Choose one coordinate",
    body: (
      <>
        Layer and neuron index pick the activation coordinate. The offset adds
        to it when positive, subtracts when negative, and leaves it alone at
        zero. The buttons below change that offset by one or reset it.
      </>
    ),
  },
  {
    id: "vector",
    target: "neuron-steering-vector",
    title: "Learn a direction instead",
    body: (
      <>
        Contrast examples of the behavior you want with examples you want less
        of. The app compares their activations and uses the difference as a
        multi-coordinate direction. It remains an experiment, not a model edit.
      </>
    ),
  },
];
