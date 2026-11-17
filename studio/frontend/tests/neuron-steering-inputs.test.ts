import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controls = readFileSync(
  new URL(
    "../src/features/chat/components/neuron-steering-controls.tsx",
    import.meta.url,
  ),
  "utf8",
);
const page = readFileSync(
  new URL("../src/features/chat/neuron-steering-page.tsx", import.meta.url),
  "utf8",
);
const sidebar = readFileSync(
  new URL("../src/components/app-sidebar.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../src/app/routes/neuron-steering.tsx", import.meta.url),
  "utf8",
);

test("neuron index and layer use editable numeric drafts", () => {
  assert.match(controls, /import \{ NumericValueInput \}/);
  assert.match(controls, /ariaLabel="Layer index \(0-based\)"/);
  assert.match(controls, /ariaLabel="Residual coordinate \(0-based\)"/);
  assert.match(controls, /Choose a layer/);
  assert.match(controls, /Load Qwen3\.5-4B: L14 N8949 \+1, L13 N7956 −1/);
  assert.match(
    controls,
    /models\.find\(\(model\) => model\.id === s\.params\.checkpoint\)/,
  );
  assert.match(controls, /value\.replace\(\/\[\^a-z0-9\]/);
  assert.match(controls, /ariaLabel=\{`Layer for neuron/);
  assert.match(controls, /ariaLabel=\{`Neuron at layer/);
  assert.match(controls, /They do not train or/);
  assert.doesNotMatch(controls, /neuron-steering-coordinate/);
});

test("neuron steering has its own dedicated left-nav page", () => {
  assert.match(sidebar, /steering:\s*\{[\s\S]*?to: "\/neuron-steering"/);
  assert.match(route, /path: "\/neuron-steering"/);
  assert.match(page, /<NeuronSteeringControls disabled=\{disabled\} \/>/);
});

test("steering edits explain and expose both dose directions before save", () => {
  assert.match(controls, /Dose \(\+ adds, − subtracts\)/);
  assert.match(controls, /Decrease dose for layer/);
  assert.match(controls, /Increase dose for layer/);
  assert.match(controls, /Add neuron · L/);
  assert.match(controls, /Remove this neuron from the recipe/);
  assert.ok(
    controls.indexOf("Save your changes") > controls.indexOf("Add neuron ·"),
  );
});

test("steering pages use the outer page scroller", () => {
  const auditPage = readFileSync(
    new URL(
      "../src/features/chat/neuron-steering-audit-page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    page,
    /<main className="flex min-h-0 flex-1 flex-col overflow-visible">/,
  );
  assert.match(
    auditPage,
    /<main className="flex min-h-0 flex-1 flex-col overflow-visible">/,
  );
});
