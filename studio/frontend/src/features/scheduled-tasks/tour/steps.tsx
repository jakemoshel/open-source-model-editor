// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import type { TourStep } from "@/features/tour";

export function buildTasksTourSteps({
  hasTasks,
}: { hasTasks: boolean }): TourStep[] {
  const steps: TourStep[] = [
    {
      id: "toolbar",
      target: "tasks-toolbar",
      title: "Create or find a task",
      body: (
        <>
          Scheduled tasks save a prompt and run it at the times you choose.
          Search by task name or prompt, and use New task to set up a schedule.
        </>
      ),
    },
  ];
  if (hasTasks) {
    steps.push({
      id: "list",
      target: "tasks-list",
      title: "Manage scheduled runs",
      body: (
        <>
          Filter by active, paused, or completed. Open a task to edit it; use
          its row actions to run it now, pause or resume it, or review results.
        </>
      ),
    });
  }
  return steps;
}
