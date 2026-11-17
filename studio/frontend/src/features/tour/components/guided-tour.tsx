// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import type { TourStep } from "../types";

type GuidedTourProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: TourStep[];
  onSkip: () => void;
  onComplete: () => void;
  celebrate?: boolean;
};

/** Guided tours were removed; kept temporarily as a compatibility shim for legacy page imports. */
export function GuidedTour(_props: GuidedTourProps) {
  void _props;
  return null;
}
