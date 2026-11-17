// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import assert from "node:assert/strict";
import test from "node:test";
import { readSrc } from "./helpers/kit.ts";

test("coarse-pointer controls keep a 44px target floor across the app", () => {
  const css = readSrc("index.css");
  const rule = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(
    css.slice(css.indexOf("/* Keep touch controls easy to hit throughout the app")),
  );
  assert.ok(rule, "missing global coarse-pointer target rule");
  assert.match(rule[1], /button/);
  assert.match(rule[1], /\[role="menuitem"\]/);
  assert.match(rule[1], /min-width: 44px !important/);
  assert.match(rule[1], /min-height: 44px !important/);
});
