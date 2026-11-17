// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { createRoute } from "@tanstack/react-router";
import { requireAuth } from "../auth-guards";
import { Route as rootRoute } from "./__root";
import { NeuronSteeringPage } from "@/features/chat/neuron-steering-page";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/neuron-steering",
  staticData: { titleKey: "routes.neuronSteering" },
  beforeLoad: () => requireAuth(),
  component: NeuronSteeringPage,
});
