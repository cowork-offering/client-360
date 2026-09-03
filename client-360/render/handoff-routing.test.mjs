#!/usr/bin/env node
// Release gate for the generated handoff routing table.
// Run with: node --test render/handoff-routing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BEGIN_MARKER,
  BLOCK_NAME,
  DISAMBIGUATION,
  END_MARKER,
  EXAMPLES,
  HandoffRoutingError,
  ROOM_ROUTES,
  ROUTING_ROWS,
  TARGET_PATHS,
  applyBlock,
  checkHandoffRouting,
  readPageRoutes,
  renderHandoffRouting,
} from "./handoff-routing.mjs";

test("the agent and the cockpit skill carry the table this module generates", () => {
  for (const { path, drifted } of checkHandoffRouting()) {
    assert.equal(drifted, false, `${path} drifted. Run: node client-360/render/handoff-routing.mjs`);
  }
});

test("both files carry the block, and both bodies are byte-identical", () => {
  const bodies = TARGET_PATHS.map((path) => {
    const text = readFileSync(path, "utf8");
    const from = text.indexOf(BEGIN_MARKER);
    const to = text.indexOf(END_MARKER);
    assert.ok(from !== -1 && to > from, `${BLOCK_NAME} is not marked in ${path}`);
    return text.slice(from + BEGIN_MARKER.length, to).trim();
  });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(bodies[0], renderHandoffRouting());
});

test("every route the page binds has exactly one row, and no row invents one", () => {
  const declared = Object.entries(ROOM_ROUTES).flatMap(([room, routes]) =>
    routes.map((route) => `${room}/${route}`)
  );
  const rows = ROUTING_ROWS.map((r) => `${r.room}/${r.route}`);
  assert.deepEqual([...rows].sort(), [...declared].sort());
  assert.equal(new Set(rows).size, rows.length, "a route is routed twice");
});

test("the rooms bind exactly the routes the published page validates", () => {
  const pageRoutes = readPageRoutes();
  if (!pageRoutes) return; // plugin-only checkout: the app contract is not on disk
  for (const [room, routes] of Object.entries(ROOM_ROUTES)) {
    assert.deepEqual([...routes].sort(), [...pageRoutes[room]].sort(), `room ${room}`);
  }
});

test("a pledge to a facility routes to the facility room, not to intake", () => {
  // The exact mis-route this table exists for: a banker mentioned a new collateral, and the chat
  // agent banged on a modification of its own instead of handing the pledge to the facility room.
  const pledge = EXAMPLES.find((e) => e.said.includes("security on the construction loan"));
  assert.ok(pledge, "the pledge example is gone");
  assert.equal(pledge.room, "facility");
  assert.equal(pledge.route, "modify");

  const asset = EXAMPLES.find((e) => e.said.includes("nothing pledged yet"));
  assert.ok(asset, "the unpledged-asset example is gone");
  assert.equal(asset.room, "relationship");
  assert.equal(asset.route, "intake");

  const modify = ROUTING_ROWS.find((r) => r.room === "facility" && r.route === "modify");
  assert.match(modify.ask, /pledged to it/);
  assert.match(DISAMBIGUATION, /pledged TO a facility is a facility modification/);
});

test("each room gets two worked examples, each on a route it binds", () => {
  for (const [room, routes] of Object.entries(ROOM_ROUTES)) {
    const forRoom = EXAMPLES.filter((e) => e.room === room);
    assert.equal(forRoom.length, 2, `room ${room}`);
    for (const e of forRoom) {
      assert.ok(routes.includes(e.route), `${e.route} is not a ${room} route`);
      assert.ok(e.line.trim().length > 0, "an example carries no line");
    }
  }
});

test("the generated body carries no em dash", () => {
  assert.ok(!renderHandoffRouting().includes("—"));
});

test("a missing marker fails loudly rather than generating nothing", () => {
  assert.throws(() => applyBlock("prose with no markers at all"), HandoffRoutingError);
});

test("a duplicated marker fails rather than writing into the wrong one", () => {
  const doubled = `${BEGIN_MARKER}\nx\n${END_MARKER}\n${BEGIN_MARKER}\ny\n${END_MARKER}`;
  assert.throws(() => applyBlock(doubled, "z"), HandoffRoutingError);
});

test("applying the block twice is a fixed point", () => {
  for (const path of TARGET_PATHS) {
    const once = applyBlock(readFileSync(path, "utf8"));
    assert.equal(applyBlock(once), once);
  }
});
