import assert from "node:assert/strict";
import test from "node:test";
import ts from "@typescript/typescript6";
import { readSrc } from "./helpers/kit.ts";

const source = ts.createSourceFile("hub-page.tsx", readSrc("features/hub/hub-page.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hook = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "useModelsTabState");
assert.ok(hook);
const code = ts.transpileModule(hook.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function modelsTab(search: Record<string, unknown>) {
  const navigations: Array<{ search: (previous: Record<string, unknown>) => Record<string, unknown>; replace: boolean }> = [];
  const effects: Array<() => void> = [];
  const result = new Function("useNavigate", "useSearch", "useEffect", "useCallback", "LOCAL_QWEN_WORKFLOW", `${code}; return useModelsTabState();`)(
    () => (options: typeof navigations[number]) => navigations.push(options),
    () => search,
    (effect: () => void) => effects.push(effect),
    (callback: unknown) => callback,
    true,
  ) as { tab: string; setTab: (tab: string) => void };
  effects.forEach((effect) => effect());
  return { ...result, navigations };
}

test("opening Model Hub shows installed models and records that tab in the URL", () => {
  const result = modelsTab({});
  assert.equal(result.tab, "downloaded");
  assert.deepEqual(result.navigations[0]?.search({ kind: "models" }), { kind: "models", tab: "downloaded" });
  assert.equal(result.navigations[0]?.replace, true);
});

test("old model Discover links resolve to installed models; dataset discovery remains available", () => {
  assert.equal(modelsTab({ tab: "discover" }).tab, "downloaded");
  assert.equal(modelsTab({ tab: "discover" }).navigations.length, 1);
  assert.equal(modelsTab({ kind: "datasets" }).tab, "discover");
});
