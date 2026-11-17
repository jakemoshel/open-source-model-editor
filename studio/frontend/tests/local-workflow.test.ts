import assert from "node:assert/strict";
import test from "node:test";
import { localNavigationVisible, localWorkspaceVisible, localRouteAllowed } from "../src/config/local-workflow.ts";

test("chat and the complete weight-experiment workflow remain reachable", () => {
  for (const path of ["/chat", "/neuron-steering", "/studio", "/studio/history", "/hub", "/export"]) assert.equal(localRouteAllowed(path), true, path);
  for (const id of ["hub", "train", "steering", "export"]) assert.equal(localNavigationVisible(id), true, id);
  for (const id of ["recipes", "projects"]) assert.equal(localNavigationVisible(id), false, id);
  for (const id of ["switchToChat", "switchToTrain", "switchToExport"]) assert.equal(localWorkspaceVisible(id), true, id);
  for (const id of ["switchToProjects", "switchToRecipes"]) assert.equal(localWorkspaceVisible(id), false, id);
});

test("removed workspaces stay out of navigation and cannot reopen from old URLs", () => {
  for (const path of ["/images", "/images/train", "/video", "/audio", "/library", "/tasks", "/api-monitor", "/projects", "/projects/example", "/data-recipes", "/data-recipes/local-dataset"]) assert.equal(localRouteAllowed(path), false, path);
  for (const id of ["images", "video", "audio", "tasks", "library", "api"]) assert.equal(localNavigationVisible(id), false, id);
  for (const id of ["switchToImages", "switchToVideo", "switchToAudio"]) assert.equal(localWorkspaceVisible(id), false, id);
  assert.equal(localRouteAllowed("/studio/audio-dataset"), true);
});

// Exercise the shipped token-count path with old agent preferences still enabled.
test("local chat does not restore agent tools from saved preferences", async () => {
  const ts = (await import("@typescript/typescript6")).default;
  const { readFileSync } = await import("node:fs");
  const source = ts.createSourceFile("chat-adapter.ts", readFileSync(new URL("../src/features/chat/api/chat-adapter.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "buildLocalTokenCountExtras");
  assert.ok(fn);
  const code = ts.transpileModule(fn.getText(source).replace("export ", ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const count = new Function("useChatRuntimeStore", "LOCAL_QWEN_WORKFLOW", "codeToolsOn", "ggufCompactionRequestFields", "isServedByLlamaCpp", `${code}; return buildLocalTokenCountExtras;`)(
    { getState: () => ({ params: { checkpoint: "Qwen", maxTokens: 256 }, supportsTools: true, toolsEnabled: true, mcpEnabledForChat: true, deepResearchEnabled: true }) },
    true, () => true, () => ({}), () => false,
  ) as (thread: string) => Promise<Record<string, unknown>>;
  const extras = await count("local-experiment");
  assert.equal(extras.enable_tools, false);
  assert.equal(extras.thread_id, "local-experiment");
  assert.equal(extras.max_tokens, 256);
});
