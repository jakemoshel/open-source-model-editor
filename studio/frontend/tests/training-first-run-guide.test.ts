// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import assert from "node:assert/strict";
import test from "node:test";

import { readSrc } from "./helpers/kit.ts";

const WIZARD = readSrc("features/studio/wizard/training-wizard.tsx");
const DATASET = readSrc("features/studio/sections/dataset-section.tsx");
const PAGE = readSrc("features/studio/studio-page.tsx");
const PREVIEW = readSrc("features/studio/wizard/run-preview-card.tsx");

test("the first-run guide explains model, dataset and start, with a prominent action", () => {
  assert.match(WIZARD, /Your first training run/);
  assert.match(WIZARD, /Choose the model you want to teach/);
  assert.match(WIZARD, /Choose examples for it to learn from/);
  assert.match(WIZARD, /Keep the suggested settings and start/);
  assert.match(WIZARD, /data-training-guide-action/);
  assert.match(WIZARD, /startCta/);
  assert.match(PAGE, /startCta=\{<StartTrainingCta\s*\/>\}/);
  assert.match(WIZARD, /jumpTo\(step\.target\)/);
  assert.match(WIZARD, /studio-model-section/);
  assert.match(WIZARD, /studio-dataset-section/);
  assert.match(WIZARD, /studio-params-section/);
  assert.doesNotMatch(PREVIEW, /startCta/);
});

test("dataset guidance explains sources, example contents and preview checks", () => {
  assert.match(DATASET, /A dataset is a collection of examples/);
  assert.match(DATASET, /Hugging Face dataset/);
  assert.match(DATASET, /upload your own JSONL,/);
  assert.match(DATASET, /CSV, or Parquet file/);
  assert.match(DATASET, /inspect\s+the preview/);
  assert.match(DATASET, /Show a chat dataset example/);
  assert.match(DATASET, /one JSON object on each line/);
  assert.match(DATASET, /messages/);
});
