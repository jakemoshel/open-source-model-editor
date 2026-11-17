// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import assert from "node:assert/strict";
import test from "node:test";

import { readSrcAsync } from "./helpers/kit.ts";

test("the More flyout no longer links to removed appearance settings", async () => {
  const source = await readSrcAsync("components/app-sidebar.tsx");
  assert.doesNotMatch(source, /openDialog\("appearance"/);
  assert.match(source, /ref=\{moreContentRef\}/);
});
