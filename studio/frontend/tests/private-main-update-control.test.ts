// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readSrc } from "./helpers/kit.ts";

const CONTROL = readSrc("features/settings/components/desktop-update-control.tsx");
const INSTALLER = readFileSync(
  new URL("../../../scripts/setup-local-macos.sh", import.meta.url),
  "utf8",
);

test("the local desktop checks the public main only when asked and installs and restarts", () => {
  assert.match(CONTROL, /invoke<RepoUpdateStatus>\(/);
  assert.match(CONTROL, /"check_local_repo_update"/);
  assert.match(CONTROL, /"update_local_repo"/);
  assert.match(CONTROL, /Check the public main branch manually/);
  assert.match(CONTROL, /Install and restart/);
  assert.match(CONTROL, /repoAction === "updating"/);
  assert.match(CONTROL, /update\.log/);
  assert.doesNotMatch(CONTROL, /Terminal/);
  assert.doesNotMatch(CONTROL, /Quit the app, then run/);
  assert.doesNotMatch(CONTROL, /setInterval|setTimeout/);
  assert.match(INSTALLER, /\/usr\/bin\/open -n "\$app_dest"/);
  assert.match(INSTALLER, /pgrep -x unsloth-studio/);
});
