// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import type { TourStep } from "../types";

export function useTourAvailable(_id: string | null): boolean {
  void _id;
  return false;
}

export function useGuidedTourController(_options: {
  id: string;
  steps: TourStep[];
  enabled?: boolean;
  autoKey?: string;
  autoWhen?: boolean;
}) {
  void _options;
  const setOpen = (_open: boolean) => {
    void _open;
  };
  const onSkip = () => {};
  const onComplete = () => {};
  return {
    open: false,
    setOpen,
    onSkip,
    onComplete,
    tourProps: {
      open: false,
      onOpenChange: setOpen,
      steps: [],
      onSkip,
      onComplete,
    },
  };
}

