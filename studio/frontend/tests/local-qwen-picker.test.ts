import assert from "node:assert/strict";
import test from "node:test";
import { localModelLabel, localModelRole } from "../src/config/local-model-label.ts";
import * as workflow from "../src/config/local-workflow.ts";
import { loadWithStubs, stubJsxRuntime, type StubElement } from "./helpers/module-stubs.ts";
import type * as Picker from "../src/features/model-picker/components/model-selector/local-qwen-picker.tsx";

const { LocalQwenPicker, localQwenChoices } = loadWithStubs<typeof Picker>(
  new URL("../src/features/model-picker/components/model-selector/local-qwen-picker.tsx", import.meta.url), {
    "react/jsx-runtime": stubJsxRuntime(),
    "@/components/ui/button": { Button: "button" },
    "@/config/local-workflow": workflow,
    "@/config/local-model-label": { localModelLabel },
    "./row-meta": { loraOptionLabel: (model: { name: string }) => model.name },
  },
);

const adapter = { id: "/outputs/Qwen-experiment", name: "My weight experiment", source: "training" as const };

function elements(node: unknown): StubElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as StubElement;
  return [element, ...elements(element.props.children)];
}

test("generated runs get distinct readable names; custom names and model IDs are preserved", () => {
  const first = localModelLabel("/outputs/run", "SiddhJagani_Qwen3.8-4B-mlx-4Bit_1794234361");
  const second = localModelLabel("/outputs/run2", "SiddhJagani_Qwen3.8-4B-mlx-4Bit_1794234000");
  assert.match(first, /^Qwen run · /);
  assert.notEqual(first, second);
  assert.equal(localModelLabel(adapter.id, adapter.name), adapter.name);
  assert.equal(localModelLabel(workflow.LOCAL_QWEN_MODEL), "Qwen 3.8 4B");
  assert.equal(localModelRole(adapter.id), "Training output");
});

test("the short picker keeps the Qwen base and unique trained versions with correct load metadata", () => {
  const choices = localQwenChoices([adapter, adapter, { ...adapter, id: "/exports/full", exportType: "merged", source: "exported" }]);
  assert.equal(choices.length, 3);
  assert.equal(choices[0]?.id, workflow.LOCAL_QWEN_MODEL);
  assert.equal(choices[0]?.meta.isDownloaded, true);
  assert.equal(choices[1]?.id, adapter.id);
  assert.equal(choices[1]?.meta.isLora, true);
  assert.equal(choices[1]?.meta.source, "lora");
  assert.equal(choices[2]?.meta.isLora, false);
  assert.equal(choices[2]?.meta.source, "exported");
});

test("picker loads or configures the exact trained output and unloads only on request", () => {
  const selected: unknown[] = [], configured: unknown[] = [];
  let unloaded = 0;
  const tree = elements(LocalQwenPicker({ adapters: [adapter], value: adapter.id, loaded: true,
    onSelect: (...args) => selected.push(args), onConfigure: (...args) => configured.push(args), onUnload: () => { unloaded++; },
  }));
  assert.deepEqual(selected, []);
  (tree.find((node) => node.props["aria-label"] === `Load ${adapter.name}`)?.props.onClick as () => void)();
  (tree.find((node) => node.props["aria-label"] === `Load settings for ${adapter.name}`)?.props.onClick as () => void)();
  (tree.find((node) => node.props.children === "Unload model")?.props.onClick as () => void)();
  assert.equal((selected[0] as unknown[])[0], adapter.id);
  assert.equal((configured[0] as unknown[])[0], adapter.id);
  assert.equal(unloaded, 1);
});

test("model actions are disabled while a load is in progress", () => {
  const tree = elements(LocalQwenPicker({ adapters: [adapter], busy: true, onSelect: () => {}, onConfigure: () => {} }));
  const controls = tree.filter((node) => node.props["aria-label"]);
  assert.equal(controls.length, 4);
  assert.ok(controls.every((node) => node.props.disabled === true));
  assert.ok(tree.some((node) => node.props.role === "status"));
});
