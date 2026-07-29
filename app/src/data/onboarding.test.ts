import { describe, expect, it } from "vitest";
import type { C360Data } from "./contract";
import {
  ATTESTATION_REASON,
  buildOnboardingRows,
  canComplete,
  completionBlockers,
  daysInStage,
  documentCounts,
  findOnboardingCase,
  isInOnboarding,
  onboardingCases,
  worstScreening,
  type OnboardingCase,
} from "./onboarding";
import live from "../../../artifact/live-data.json";
import sample from "../../../artifact/sample-data.json";

/* =============================================================================
   EVERY ONBOARDING CASE, EVERY INVARIANT, IN EVERY STAGED FILE.

   Same rule as the borrower matrix: a surface that is honest for one case and
   wrong for another is a failed round item. The invariants below are derived
   from the doctrine, not from one case's shape — most of all the one that says
   NOTHING in this artifact can complete a case.
   ============================================================================= */

const FILES: Array<[string, C360Data]> = [
  ["live-data.json", live as unknown as C360Data],
  ["sample-data.json", sample as unknown as C360Data],
];

const everyCase: Array<[string, OnboardingCase]> = FILES.flatMap(([file, data]) =>
  onboardingCases(data).map((c) => [file, c] as [string, OnboardingCase]),
);

describe("onboarding seed", () => {
  it("stages three cases in every file", () => {
    for (const [file, data] of FILES) {
      expect(onboardingCases(data).length, file).toBe(3);
    }
  });

  it("stages the three named cases at three different stages", () => {
    for (const [file, data] of FILES) {
      const cases = onboardingCases(data);
      expect(cases.map((c) => c.name).sort(), file).toEqual([
        "Atlas Packaging Corp",
        "Caldwell Systems LLC",
        "Meridian Tooling GmbH",
      ]);
      expect(new Set(cases.map((c) => c.stage)).size, file).toBe(3);
    }
  });

  it("tolerates a file with no onboarding block", () => {
    expect(onboardingCases({} as C360Data)).toEqual([]);
    expect(findOnboardingCase({} as C360Data, "001x")).toBeNull();
    expect(buildOnboardingRows(undefined)).toEqual([]);
  });
});

describe("every onboarding case is honestly labelled", () => {
  for (const [file, c] of everyCase) {
    it(`${c.name} (${file}): is sample-only`, () => {
      expect(c._sample_only).toBe(true);
    });

    it(`${c.name} (${file}): every screening row is labelled Simulated (demo)`, () => {
      for (const s of c.screenings ?? []) {
        expect(s.simulated, `${s.screeningId} simulated flag`).toBe(true);
        expect(s.provider, `${s.screeningId} provider`).toBe("Simulated (demo)");
      }
    });

    it(`${c.name} (${file}): carries no clearance, so it cannot complete`, () => {
      expect(c.clearance.present).toBe(false);
      expect(canComplete(c)).toBe(false);
      expect(completionBlockers(c)).toContain("Awaiting human KYC clearance attestation");
    });

    it(`${c.name} (${file}): is in onboarding and has a lookup key`, () => {
      expect(isInOnboarding(c)).toBe(true);
      expect(c.lookupKey.length).toBeGreaterThan(0);
    });

    it(`${c.name} (${file}): a verified document names its verifier and time`, () => {
      for (const d of c.documents ?? []) {
        if (d.status === "Verified") {
          expect(d.verifiedBy, `${d.documentId} verifiedBy`).toBeTruthy();
          expect(d.verifiedOn, `${d.documentId} verifiedOn`).toBeTruthy();
        } else {
          expect(d.verifiedBy, `${d.documentId} must not claim a verifier`).toBeNull();
        }
      }
    });

    it(`${c.name} (${file}): every typed party edge carries its reciprocal role`, () => {
      for (const p of c.parties ?? []) {
        expect(p.role.length, `${p.partyId} role`).toBeGreaterThan(0);
        expect(p.reciprocalRole.length, `${p.partyId} reciprocal`).toBeGreaterThan(0);
      }
    });

    it(`${c.name} (${file}): a screening that names a blocking item points at a real one`, () => {
      const ids = new Set((c.blockingItems ?? []).map((b) => b.itemId));
      for (const s of c.screenings ?? []) {
        if (s.blockingItemId) expect(ids.has(s.blockingItemId), `${s.screeningId} → ${s.blockingItemId}`).toBe(true);
      }
    });
  }
});

describe("the three lifecycle points read as designed", () => {
  const data = live as unknown as C360Data;
  const caldwell = findOnboardingCase(data, "001SAMPLE0000CLDW")!;
  const meridian = findOnboardingCase(data, "001SAMPLE0000MRDN")!;
  const atlas = findOnboardingCase(data, "001SAMPLE0000ATLS")!;

  it("Caldwell is fresh from client intake with no screening run", () => {
    expect(caldwell.stage).toBe("CustomerEngagement");
    expect(caldwell.type).toBe("NewCustomer");
    expect(caldwell.intake?.submissionId).toBeTruthy();
    expect(caldwell.intake?.claimedEmail).toContain("@");
    expect(caldwell.screenings ?? []).toHaveLength(0);
    // No screening is NOT a clear.
    expect(worstScreening(caldwell)).toBe("NotRun");
  });

  it("Meridian is mid-flight with one adverse-media hit driving a blocking item", () => {
    expect(meridian.stage).toBe("DueDiligence");
    expect(meridian.type).toBe("KybAndKycOnly");
    expect(meridian.intake).toBeNull();
    const hit = (meridian.screenings ?? []).find((s) => s.result === "Hit");
    expect(hit?.screeningType).toBe("AdverseMedia");
    expect(hit?.findings).toBeTruthy();
    expect(hit?.blockingItemId).toBeTruthy();
    expect(worstScreening(meridian)).toBe("Hit");
    const counts = documentCounts(meridian);
    expect(counts.verified).toBeGreaterThan(0);
    expect(counts.pending).toBeGreaterThan(0);
    // Two owners with percentages plus a guarantor.
    const owners = (meridian.parties ?? []).filter((p) => p.role === "Owner");
    expect(owners).toHaveLength(2);
    expect(owners.reduce((s, p) => s + (p.ownershipPercent ?? 0), 0)).toBe(100);
    expect((meridian.parties ?? []).some((p) => p.role === "Guarantor")).toBe(true);
  });

  it("Atlas is clean and the attestation is its ONLY blocker", () => {
    expect(atlas.stage).toBe("Validation");
    expect(atlas.blockingItems ?? []).toHaveLength(0);
    expect(worstScreening(atlas)).toBe("Clear");
    expect(documentCounts(atlas).pending).toBe(0);
    // The single reason, stated once.
    expect(completionBlockers(atlas)).toEqual(["Awaiting human KYC clearance attestation"]);
    expect(canComplete(atlas)).toBe(false);
    expect(ATTESTATION_REASON).toContain("human KYC clearance attestation");
  });
});

describe("derivations", () => {
  const data = live as unknown as C360Data;
  const generatedAt = data.meta.generatedAt;

  it("days-in-stage counts from the CURRENT stage entry, against generatedAt", () => {
    for (const c of onboardingCases(data)) {
      const days = daysInStage(c, generatedAt);
      expect(days, c.name).not.toBeNull();
      expect(days!, c.name).toBeGreaterThanOrEqual(0);
      expect(days!, c.name).toBeLessThan(400);
    }
  });

  it("worstScreening ranks a hit above a pending above a clear", () => {
    const base = { screeningId: "x", partyName: "p", provider: "Simulated (demo)", screenedOn: null, simulated: true, findings: null };
    const mk = (results: Array<"Clear" | "Hit" | "Pending">) =>
      ({
        clearance: { present: false, clearedBy: null, clearedOn: null, basis: null },
        screenings: results.map((r, i) => ({ ...base, screeningId: `s${i}`, screeningType: "Sanctions" as const, result: r })),
      }) as unknown as OnboardingCase;

    expect(worstScreening(mk(["Clear", "Clear"]))).toBe("Clear");
    expect(worstScreening(mk(["Clear", "Pending"]))).toBe("Pending");
    expect(worstScreening(mk(["Pending", "Hit", "Clear"]))).toBe("Hit");
  });

  it("pipeline rows carry what the L1 zone renders, furthest-along first", () => {
    const rows = buildOnboardingRows(data);
    expect(rows).toHaveLength(3);
    expect(rows[0].stage).toBe("Validation");
    expect(rows[rows.length - 1].stage).toBe("CustomerEngagement");
    for (const r of rows) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.sample).toBe(true);
      expect(r.attested).toBe(false);
      expect(r.targetDeal, r.name).toBeTruthy();
      expect(r.documentsTotal).toBeGreaterThanOrEqual(r.documentsVerified);
    }
    expect(rows.find((r) => r.fromIntake)?.name).toBe("Caldwell Systems LLC");
  });

  it("a completed case leaves the pipeline zone without anything being re-filed", () => {
    const completed = { ...onboardingCases(data)[0], stage: "Complete" as const };
    const patched = {
      ...data,
      onboarding: { cases: [completed, ...onboardingCases(data).slice(1)] },
    } as C360Data;
    expect(isInOnboarding(completed)).toBe(false);
    expect(buildOnboardingRows(patched)).toHaveLength(2);
  });
});
