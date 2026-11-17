import assert from "node:assert/strict";
import test from "node:test";
import ts from "@typescript/typescript6";
import { readSrc } from "./helpers/kit.ts";

const source = ts.createSourceFile("audit.tsx", readSrc("features/chat/neuron-steering-audit-page.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let restore: ts.ArrowFunction | undefined;
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "restore" && node.initializer && ts.isArrowFunction(node.initializer)) restore = node.initializer;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(restore);
const js = ts.transpileModule(`const restore = ${restore.getText(source)}; return restore;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(checkpoint: string, fail = false, cancel = false) {
  const events: string[] = [];
  const messages: string[] = [];
  const state = {
    params: { checkpoint, neuronSteering: undefined as unknown },
    loras: [{ id: "recipe-model" }],
    setActiveThreadId: () => events.push("new-thread"),
    setContextUsage: () => events.push("clear-context"),
  };
  const revision = { id: "v1", steering: { modelId: "recipe-model", layer: 3, neuron: 7, offset: 2 } };
  const run = new Function("recipe", "useChatRuntimeStore", "useNeuronSteeringAuditStore", "selectModel", "navigate", "setOpening", "setMessage", "refresh", js)(
    { id: "recipe", modelId: "recipe-model" },
    { getState: () => state, setState: (patch: Partial<typeof state>) => { Object.assign(state, patch); events.push("apply"); } },
    { getState: () => ({ revertRecipe: () => events.push("audit") }) },
    async (selection: { id: string; isLora: boolean; throwOnError: boolean }) => {
      assert.equal(selection.isLora, true);
      assert.equal(selection.throwOnError, true);
      events.push("load");
      if (fail) throw new Error("Load failed");
      if (!cancel) state.params.checkpoint = selection.id;
    },
    async (target: { to: string; search: { new: string } }) => { assert.equal(target.to, "/chat"); assert.ok(target.search.new); events.push("navigate"); },
    () => {},
    (message: string) => messages.push(message),
    async () => events.push("refresh"),
  );
  return { run: () => run(revision), events, state, revision, messages };
}

test("recipe chat loads its model before applying steering and opens a fresh chat", async () => {
  const h = harness("other-model");
  await h.run();
  assert.deepEqual(h.events, ["refresh", "load", "apply", "audit", "new-thread", "clear-context", "navigate"]);
  assert.deepEqual(h.state.params.neuronSteering, h.revision.steering);
});

test("recipe chat reuses the matching model", async () => {
  const h = harness("recipe-model");
  await h.run();
  assert.ok(!h.events.includes("load"));
  assert.ok(h.events.includes("navigate"));
});

for (const canceled of [false, true]) {
  test(`recipe chat leaves steering and conversation untouched after ${canceled ? "canceled" : "failed"} load`, async () => {
    const h = harness("other-model", !canceled, canceled);
    await h.run();
    assert.deepEqual(h.events, ["refresh", "load"]);
    assert.equal(h.state.params.neuronSteering, undefined);
    assert.ok(h.messages.at(-1));
  });
}
