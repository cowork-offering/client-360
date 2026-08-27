import { describe, expect, it } from "vitest";
import { createScriptedEngine } from "./engine";
import { vocabularyFor, doorFor } from "./modes";
import { scriptFor } from "./scripts";
import { assertNoRecordIds } from "../actions/stagedPlan";
import type { WorkroomContext, WorkroomDelta, WorkroomMode } from "./types";

/* =============================================================================
   ONE ROOM, THREE MODES — AT THE SEAM.

   These hold the ENGINE CONTRACT rather than the storyline: whatever a real
   engine does in a later wave, it answers the same five calls with the same
   shapes, and the shell is written against nothing else. Where a test asserts a
   sentence it is asserting a RULE the sentence carries (a refusal is a refusal,
   a renewal hands into approval), never the prose.
   ============================================================================= */

function contextFor(mode: WorkroomMode, packageId: string | null = "a5Fbb000000IHFJEA4"): WorkroomContext {
  return {
    mode,
    door: doorFor(mode, packageId),
    accountId: "001bb00001DLtRMAA1",
    accountName: "Hartwell Precision Manufacturing LLC",
    productPackageId: packageId,
    packageName: "Hartwell Industrial C&I Credit Package",
    approver: "fabian.goetzens@accenture.com.bankinggpt",
  };
}

/** Walk the whole storyline, confirming everything it proposes. */
async function runToEnd(context: WorkroomContext) {
  const engine = createScriptedEngine(context);
  const script = scriptFor(context.mode, context.door);
  const confirmed: WorkroomDelta[] = [];
  for (const beat of script.beats) {
    const result = await engine.parseIntent(beat.say, context);
    if (result.kind === "deltas") confirmed.push(...result.deltas);
  }
  return { engine, confirmed };
}

describe("the workroom engine, per mode", () => {
  const modes: WorkroomMode[] = ["modify", "renew", "create"];

  it("reads the room before a word is typed, in every mode", async () => {
    for (const mode of modes) {
      const context = contextFor(mode);
      const brief = createScriptedEngine(context).brief(context);
      expect(brief.position.length).toBeGreaterThan(0);
      expect(brief.loadSteps.at(-1)).toBe("Ready");
      expect(brief.sources.length).toBeGreaterThan(0);
      expect(brief.why.length).toBeGreaterThan(0);
      expect(brief.composeTarget).toBeGreaterThan(0);
    }
  });

  it("mentions email ONLY where a client email exists", async () => {
    const ids = (mode: WorkroomMode) =>
      createScriptedEngine(contextFor(mode)).brief(contextFor(mode)).sources.map((s) => s.id);
    expect(ids("modify")).toContain("email");
    // A room with no email never mentions one (the design spec's entry rule).
    expect(ids("renew")).not.toContain("email");
    expect(ids("create")).not.toContain("email");
  });

  it("suggests the next move until the storyline is spent, then stops", async () => {
    const context = contextFor("modify");
    const engine = createScriptedEngine(context);
    const script = scriptFor("modify", "package");
    for (const beat of script.beats) {
      expect(engine.suggest()).toBe(beat.pill);
      await engine.parseIntent(beat.say, context);
    }
    expect(engine.suggest()).toBeNull();
  });

  it("gives an honest refusal rather than a fabricated chip", async () => {
    const context = contextFor("modify");
    const engine = createScriptedEngine(context);
    const script = scriptFor("modify", "package");
    await engine.parseIntent(script.beats[0].say, context);
    const result = await engine.parseIntent(script.beats[1].say, context);
    expect(result.kind).toBe("refusal");
    if (result.kind !== "refusal") return;
    expect(result.refusal.reason).toContain("HW1003");
    expect(result.refusal.detail.length).toBeGreaterThan(0);
  });

  it("never parses a line it did not understand", async () => {
    const context = contextFor("modify");
    const engine = createScriptedEngine(context);
    const result = await engine.parseIntent("what is the weather in Kokomo", context);
    expect(result.kind).toBe("unparsed");
    if (result.kind !== "unparsed") return;
    expect(result.reply).toContain("honest refusal");
  });

  it("stages ONE plan over every confirmed delta, and stages nothing that proves a write", async () => {
    for (const mode of modes) {
      const context = contextFor(mode);
      const { engine, confirmed } = await runToEnd(context);
      const staged = await engine.stagePlan(confirmed, context);
      expect(staged.stagingId).toBeTruthy();
      expect(staged.planHash).toBeTruthy();
      expect(staged.decisionToken).toBeTruthy();
      // Every delta gets a write and the verification that proves it landed.
      expect(staged.plan.steps.filter((s) => s.type === "write")).toHaveLength(confirmed.length);
      expect(staged.plan.steps.filter((s) => s.type === "verification")).toHaveLength(confirmed.length);
      // A33.5.3 — a staged plan carrying a record id means something already
      // wrote. The shell's plans are held to the same fence as the org's.
      expect(assertNoRecordIds(staged.plan)).toEqual([]);
    }
  });

  it("carries every org caveat into the plan's warnings, before the gesture", async () => {
    const context = contextFor("modify");
    const { engine, confirmed } = await runToEnd(context);
    const staged = await engine.stagePlan(confirmed, context);
    expect(staged.plan.warnings.some((w) => w.includes("Not Annual"))).toBe(true);
    expect(staged.plan.warnings.some((w) => w.includes("override"))).toBe(true);
  });

  it("gives a different hash to a different set of deltas", async () => {
    const context = contextFor("modify");
    const { engine, confirmed } = await runToEnd(context);
    const whole = await engine.stagePlan(confirmed, context);
    const part = await engine.stagePlan(confirmed.slice(0, 2), context);
    expect(part.planHash).not.toBe(whole.planHash);
  });

  it("files every entry with the id and the re-query that proves it", async () => {
    for (const mode of modes) {
      const context = contextFor(mode);
      const { engine, confirmed } = await runToEnd(context);
      const staged = await engine.stagePlan(confirmed, context);
      const result = await engine.execute({
        stagingId: staged.stagingId,
        planHash: staged.planHash,
        decisionToken: staged.decisionToken!,
        approverUserId: context.approver,
      });
      expect(result.filed).toHaveLength(confirmed.length);
      for (const f of result.filed) expect(f.verification).toContain("Re-queried");
      expect(result.tokenNote).toContain("single use");
      expect(result.tokenNote).toContain(context.approver);
      expect(result.reply?.body.length).toBeGreaterThan(0);
    }
  });

  it("burns the token, and refuses a confirmation that belongs to another plan", async () => {
    const context = contextFor("modify");
    const { engine, confirmed } = await runToEnd(context);
    const staged = await engine.stagePlan(confirmed, context);
    const approval = {
      stagingId: staged.stagingId,
      planHash: staged.planHash,
      decisionToken: staged.decisionToken!,
      approverUserId: context.approver,
    };
    await engine.execute(approval);
    await expect(engine.execute(approval)).rejects.toThrow(/already been used/);
    await expect(engine.execute({ ...approval, planHash: "changed" })).rejects.toThrow(/no longer applies/);
  });

  it("RENEW hands into the approval process rather than booking", async () => {
    const context = contextFor("renew");
    const { engine, confirmed } = await runToEnd(context);
    const staged = await engine.stagePlan(confirmed, context);
    const result = await engine.execute({
      stagingId: staged.stagingId,
      planHash: staged.planHash,
      decisionToken: staged.decisionToken!,
      approverUserId: context.approver,
    });
    expect(result.handoff).toContain("Submit for Approval");
    expect(vocabularyFor(context).steps[3]).toBe("Submit");
  });

  it("MODIFY and CREATE file, and say so in their fourth step", () => {
    expect(vocabularyFor(contextFor("modify")).steps[3]).toBe("Approve");
    expect(vocabularyFor(contextFor("create")).steps[3]).toBe("File");
  });

  it("CREATE opens two doors: one from a package, one from an account", async () => {
    const fromPackage = contextFor("create", "a5Fbb000000IHFJEA4");
    const fromAccount = contextFor("create", null);
    expect(fromPackage.door).toBe("package");
    expect(fromAccount.door).toBe("account");

    const pinned = createScriptedEngine(fromPackage).brief(fromPackage);
    const blank = createScriptedEngine(fromAccount).brief(fromAccount);
    // Pre-pinned: the package is on the table with its members on it.
    expect(pinned.showsMembers).toBe(true);
    expect(pinned.baselineMembers).toBe(7);
    // From an account there is no package yet, and the room does not pretend.
    expect(blank.showsMembers).toBe(false);
    expect(blank.baselineMembers).toBe(0);
    expect(blank.baselineCommittedMM).toBe(0);
  });

  it("modify and renew are package-anchored whatever they are handed", () => {
    expect(doorFor("modify", null)).toBe("package");
    expect(doorFor("renew", null)).toBe("package");
  });
});
