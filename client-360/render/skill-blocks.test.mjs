#!/usr/bin/env node
// Release gate for the skill's generated permitted-value blocks.
// Run with: node --test render/skill-blocks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SKILL_PATH,
  SkillBlockError,
  applyBlocks,
  beginMarker,
  checkSkillBlocks,
  endMarker,
  renderBlocks,
} from "./skill-blocks.mjs";
import {
  PERMITTED_ACTION_IDS,
  PERMITTED_ACTIVITY_KINDS,
  PERMITTED_REASON_CODES,
} from "./contract-checks.mjs";

const skill = () => readFileSync(SKILL_PATH, "utf8");

test("the skill's permitted-value blocks are what the contract checks generate", () => {
  const { drifted, reason } = checkSkillBlocks();
  assert.equal(drifted, false, `${reason}. Run: node client-360/render/skill-blocks.mjs`);
});

test("every value the assembler accepts is named in the prose, and nothing else is", () => {
  const text = skill();
  for (const [name, body] of renderBlocks()) {
    const from = text.indexOf(beginMarker(name));
    const to = text.indexOf(endMarker(name));
    assert.ok(from !== -1 && to > from, `${name} is not marked in ${SKILL_PATH}`);
    assert.equal(text.slice(from + beginMarker(name).length, to).trim(), body);
  }
});

test("the block bodies carry exactly the contract-check constants", () => {
  const blocks = renderBlocks();
  const values = (name) => blocks.get(name).split(" · ").map((v) => v.replace(/`/g, ""));
  assert.deepEqual(values("permitted-activity-kinds"), [...PERMITTED_ACTIVITY_KINDS]);
  assert.deepEqual(values("permitted-reason-codes"), [...PERMITTED_REASON_CODES]);
  assert.deepEqual(values("permitted-action-ids"), [...PERMITTED_ACTION_IDS]);
});

test("the skill's kinds are exactly the assembler's, executed and staged rows included", () => {
  // The exact drift this gate exists for: the prose once promised RENDER_AUDIT while the
  // assembler rejected it. Both now read the same list, which mirrors the page's own union.
  const block = renderBlocks().get("permitted-activity-kinds");
  for (const k of ["ACTION_TRIGGERED", "ACTION_EXECUTED", "ACTION_STAGED", "RENDER_AUDIT"]) assert.ok(block.includes(k), k);
  assert.ok(skill().includes("ACTION_EXECUTED"));
});

test("a missing marker fails loudly rather than generating nothing", () => {
  assert.throws(() => applyBlocks("prose with no markers at all"), SkillBlockError);
});

test("a duplicated marker fails rather than writing into the wrong one", () => {
  const name = "permitted-reason-codes";
  const doubled = `${beginMarker(name)}\nx\n${endMarker(name)}\n${beginMarker(name)}\ny\n${endMarker(name)}`;
  assert.throws(() => applyBlocks(doubled, new Map([[name, "z"]])), SkillBlockError);
});

test("applying the blocks twice is a fixed point", () => {
  const once = applyBlocks(skill());
  assert.equal(applyBlocks(once), once);
});
