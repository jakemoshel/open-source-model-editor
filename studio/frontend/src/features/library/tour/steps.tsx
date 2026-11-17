// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import type { TourStep } from "@/features/tour";

export function buildLibraryTourSteps({
  hasItems,
  hasTabs,
}: { hasItems: boolean; hasTabs: boolean }): TourStep[] {
  const steps: TourStep[] = [];
  if (hasTabs) {
    steps.push({
      id: "tabs",
      target: "library-tabs",
      title: "Choose what to browse",
      body: (
        <>
          Suggested and Favorites help surface useful items. The other tabs
          narrow the library to chats, files, media, models, or folders.
        </>
      ),
    });
  }
  steps.push({
    id: "toolbar",
    target: "library-toolbar",
    title: "Find and organize items",
    body: (
      <>
        Search within the current view, filter by file type, change the sort or
        layout, and use New to add a folder or upload files.
      </>
    ),
  });
  if (hasItems) {
    steps.push({
      id: "items",
      target: "library-items",
      title: "Open or manage an item",
      body: (
        <>
          Open an item to preview it. Select items to collect actions in the bar
          at the bottom; the menu on an item holds actions for that one item.
        </>
      ),
    });
  }
  return steps;
}
