import * as localWorkflow from "../src/config/local-workflow.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { loadWithStubs, stubJsxRuntime, type StubElement } from "./helpers/module-stubs.ts";
import type * as ButtonModule from "../src/features/chat/components/local-model-load-button.tsx";

function button(busy: boolean, onLoad: (selection: unknown) => Promise<void>) {
  const pending: boolean[] = [];
  const { LocalModelLoadButton } = loadWithStubs<typeof ButtonModule>(
    new URL("../src/features/chat/components/local-model-load-button.tsx", import.meta.url),
    {
      "@/config/local-workflow": localWorkflow,
      react: { useState: () => [false, (value: boolean) => pending.push(value)] },
      "react/jsx-runtime": stubJsxRuntime(),
      "@/components/ui/button": { Button: "button" },
    },
  );
  const element = LocalModelLoadButton({ busy, onLoad }) as unknown as StubElement;
  return { props: element.props, pending };
}

test("rendering the start button never loads a model; clicking loads the cached Qwen", async () => {
  const calls: unknown[] = [];
  const { props, pending } = button(false, async (selection) => { calls.push(selection); });
  assert.deepEqual(calls, []);
  assert.equal(props.children, "Load Qwen 3.8 4B");
  assert.equal(props.disabled, false);
  await (props.onClick as () => Promise<void>)();
  assert.deepEqual(calls, [{
    id: "SiddhJagani/Qwen3.8-4B-mlx-4Bit",
    isDownloaded: true,
    forceReload: true,
  }]);
  assert.deepEqual(pending, [true, false]);
});

test("loading disables the button and refuses another request", async () => {
  let calls = 0;
  const { props } = button(true, async () => { calls += 1; });
  assert.equal(props.disabled, true);
  assert.equal(props["aria-busy"], true);
  assert.equal(props.children, "Loading model…");
  await (props.onClick as () => Promise<void>)();
  assert.equal(calls, 0);
});

test("a failed load releases the pending state so it can be retried", async () => {
  const { props, pending } = button(false, async () => { throw new Error("load failed"); });
  await assert.rejects(props.onClick as () => Promise<void>, /load failed/);
  assert.deepEqual(pending, [true, false]);
});

