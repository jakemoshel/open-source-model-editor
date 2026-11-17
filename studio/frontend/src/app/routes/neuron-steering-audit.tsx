// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { requireAuth } from "../auth-guards";
import { Route as rootRoute } from "./__root";

const NeuronSteeringAuditPage = lazyRouteComponent(
  () => import("@/features/chat/neuron-steering-audit-page"),
  "NeuronSteeringAuditPage",
);

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/neuron-steering-audit",
  staticData: { titleKey: "shell.navigation.steeringAudit" },
  beforeLoad: () => requireAuth(),
  component: NeuronSteeringAuditPage,
});
