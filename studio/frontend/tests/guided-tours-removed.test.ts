// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import assert from "node:assert/strict";
import test from "node:test";
import { readSrc } from "./helpers/kit.ts";

test("tour overlay is inert", () => {
  const src = readSrc("features/tour/components/guided-tour.tsx");
  assert.match(src, /export function GuidedTour[\s\S]*return null/);
});

test("tour controllers do not auto-open or register page tours", () => {
  const src = readSrc("features/tour/hooks/use-guided-tour-controller.ts");
  assert.match(src, /open: false/);
  assert.doesNotMatch(src, /addEventListener|localStorage\.getItem/);
});

test("removed tour and appearance links are not offered in the account menu", () => {
  const ids = readSrc("features/settings/stores/appearance-custom-store.ts");
  assert.doesNotMatch(ids, /"guidedTour"|"darkMode"|"appearance"/);
});
