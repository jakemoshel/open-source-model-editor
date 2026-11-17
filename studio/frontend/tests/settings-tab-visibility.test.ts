import assert from "node:assert/strict";
import test from "node:test";
import { resolveSettingsTab, settingsTabVisible } from "../src/features/settings/settings-tab-visibility.ts";

test("local training and chat settings remain available to the owner", () => {
  for (const tab of ["general", "profile", "resources", "chat", "data", "keyboard-shortcuts", "debugging", "about"] as const) {
    assert.equal(settingsTabVisible(tab, true), true, tab);
    assert.equal(resolveSettingsTab(tab, true), tab);
  }
});

test("unrelated settings cannot reopen through saved tabs or search", () => {
  for (const tab of ["accounts", "sandbox", "voice", "connections", "library", "api-keys", "remote-lan", "agents", "browser"] as const) {
    assert.equal(settingsTabVisible(tab, true), false, tab);
    assert.equal(resolveSettingsTab(tab, true), "general");
  }
});

test("retained owner-only settings still respect account ownership", () => {
  for (const tab of ["resources", "debugging"] as const) {
    assert.equal(settingsTabVisible(tab, false), false);
    assert.equal(resolveSettingsTab(tab, false), "general");
  }
  assert.equal(settingsTabVisible("chat", false), true);
});
