import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, ModificationEntry } from "./contract";
import { deriveReasonsForBundle, deriveWorklist } from "./worklist";

const GEN = "2026-07-02T09:15:00Z";

/** YYYY-MM-DD that is `offset` whole UTC days from GEN (negative = past). */
function day(offset: number): string {
  const base = Date.UTC(2026, 6, 2); // 2026-07-02
  const d = new Date(base + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** A bundle with nothing wrong: covenant far out, maturity far out, no signals. */
function cleanBundle(accountId = "001CLEAN"): BorrowerBundle {
  return {
    snapshot: { accountId, name: "Clean Co." },
    covenants: {
      covenants: [
        { covenantType: "DSC", lastEvaluationStatus: "Compliant", breached: false, nextEvaluationDate: day(200) },
      ],
    },
    exposure: { facilities: [{ loanId: "L1", maturityDate: day(900) }] },
    signals: {
      modifications: [],
      modificationClusterFlag: false,
      renewals: [],
      maturityWatch: [],
      guarantorSignals: [],
    },
  };
}

function mods(...offsets: number[]): ModificationEntry[] {
  return offsets.map((o) => ({ date: day(o) }));
}

describe("deriveReasonsForBundle — clean + each code", () => {
  it("fires nothing on a clean bundle", () => {
    expect(deriveReasonsForBundle(cleanBundle(), GEN)).toEqual([]);
  });

  it("COVENANT_BREACH on breached=true", () => {
    const b = cleanBundle();
    b.covenants!.covenants![0].breached = true;
    expect(deriveReasonsForBundle(b, GEN)).toContain("COVENANT_BREACH");
  });

  it("COVENANT_BREACH on a non-compliant status string", () => {
    const b = cleanBundle();
    b.covenants!.covenants![0].lastEvaluationStatus = "Non-Compliant";
    expect(deriveReasonsForBundle(b, GEN)).toContain("COVENANT_BREACH");
  });

  /* An administrative Exception is a reason of its own. nCino forces that
     status on an elapsed Due Date whether or not anything was measured, so
     calling it a breach would put most of the book on the queue as credit
     deterioration (domain/covenantStatus.ts). */
  it("COVENANT_EXCEPTION, not COVENANT_BREACH, on an Exception with nothing measured", () => {
    const b = cleanBundle();
    b.covenants!.covenants![0] = { covenantType: "Term Covenants", lastEvaluationStatus: "Exception" };
    const r = deriveReasonsForBundle(b, GEN);
    expect(r).toContain("COVENANT_EXCEPTION");
    expect(r).not.toContain("COVENANT_BREACH");
  });

  it("COVENANT_BREACH once the Exception carries a measured value that misses", () => {
    const b = cleanBundle();
    b.covenants!.covenants![0] = {
      covenantType: "Debt Service Coverage Ratio",
      actualValue: 1.1,
      thresholdValue: 1.25,
      lastEvaluationStatus: "Exception",
    };
    const r = deriveReasonsForBundle(b, GEN);
    expect(r).toContain("COVENANT_BREACH");
    expect(r).not.toContain("COVENANT_EXCEPTION");
  });

  it("never flags a Waived covenant, even one past its threshold", () => {
    const b = cleanBundle();
    b.covenants!.covenants![0] = {
      covenantType: "Debt Service Coverage Ratio",
      actualValue: 1.1,
      thresholdValue: 1.25,
      lastEvaluationStatus: "Waived",
      nextEvaluationDate: day(200),
    };
    expect(deriveReasonsForBundle(b, GEN)).toEqual([]);
  });

  it("ranks an Exception below a breach and above a test due", () => {
    const b = cleanBundle();
    b.covenants!.covenants = [
      { covenantType: "A", breached: true },
      { covenantType: "B", lastEvaluationStatus: "Exception" },
      { covenantType: "C", lastEvaluationStatus: "Compliant", nextEvaluationDate: day(3) },
    ];
    expect(deriveReasonsForBundle(b, GEN)).toEqual(["COVENANT_BREACH", "COVENANT_EXCEPTION", "COVENANT_DUE"]);
  });

  it("breach beats due (no COVENANT_DUE emitted alongside a breach on same cov)", () => {
    const b = cleanBundle();
    b.covenants!.covenants![0].breached = true;
    b.covenants!.covenants![0].nextEvaluationDate = day(1);
    const r = deriveReasonsForBundle(b, GEN);
    expect(r).toContain("COVENANT_BREACH");
    expect(r).not.toContain("COVENANT_DUE");
  });

  it("GUARANTOR_SIGNAL when present", () => {
    const b = cleanBundle();
    b.signals!.guarantorSignals = [{ guarantorName: "Holdco", riskStatus: "Distressed" }];
    expect(deriveReasonsForBundle(b, GEN)).toContain("GUARANTOR_SIGNAL");
  });

  it("orders most-severe first", () => {
    const b = cleanBundle();
    b.covenants!.covenants![0].breached = true;
    b.signals!.modifications = mods(-5);
    expect(deriveReasonsForBundle(b, GEN)[0]).toBe("COVENANT_BREACH");
  });
});

describe("COVENANT_DUE boundary (<=45d inclusive, incl. overdue)", () => {
  const at = (offset: number) => {
    const b = cleanBundle();
    b.covenants!.covenants![0].nextEvaluationDate = day(offset);
    return deriveReasonsForBundle(b, GEN);
  };
  it("fires at exactly 45d", () => expect(at(45)).toContain("COVENANT_DUE"));
  it("does not fire at 46d", () => expect(at(46)).not.toContain("COVENANT_DUE"));
  it("fires when overdue (negative)", () => expect(at(-2)).toContain("COVENANT_DUE"));
});

describe("MATURITY_NEAR boundary (<=270d inclusive)", () => {
  const at = (offset: number) => {
    const b = cleanBundle();
    b.exposure!.facilities![0].maturityDate = day(offset);
    return deriveReasonsForBundle(b, GEN);
  };
  it("fires at exactly 270d", () => expect(at(270)).toContain("MATURITY_NEAR"));
  it("does not fire at 271d", () => expect(at(271)).not.toContain("MATURITY_NEAR"));
});

describe("RECENTLY_MODIFIED boundary (<=30d age inclusive)", () => {
  const at = (offset: number) => {
    const b = cleanBundle();
    b.signals!.modifications = mods(offset);
    return deriveReasonsForBundle(b, GEN);
  };
  it("fires at exactly 30d old", () => expect(at(-30)).toContain("RECENTLY_MODIFIED"));
  it("does not fire at 31d old", () => expect(at(-31)).not.toContain("RECENTLY_MODIFIED"));
});

describe("MODIFICATION_CLUSTER boundary (>=3 within 180d)", () => {
  const withMods = (...offsets: number[]) => {
    const b = cleanBundle();
    b.signals!.modifications = mods(...offsets);
    return deriveReasonsForBundle(b, GEN);
  };
  it("fires with exactly 3 inside 180d", () => expect(withMods(-10, -60, -179)).toContain("MODIFICATION_CLUSTER"));
  it("does not fire with only 2 inside 180d", () => expect(withMods(-10, -60)).not.toContain("MODIFICATION_CLUSTER"));
  it("counts the boundary day (age 180 included)", () => expect(withMods(-180, -60, -10)).toContain("MODIFICATION_CLUSTER"));
  it("excludes a mod older than 180d from the cluster count", () =>
    expect(withMods(-181, -60, -10)).not.toContain("MODIFICATION_CLUSTER"));
});

describe("F1 — missing/unparseable dates never fabricate a reason", () => {
  it("fires nothing when the covenant next-test date is absent", () => {
    const b = cleanBundle();
    delete b.covenants!.covenants![0].nextEvaluationDate;
    expect(deriveReasonsForBundle(b, GEN)).not.toContain("COVENANT_DUE");
  });

  it("fires nothing when the covenant next-test date is malformed", () => {
    const b = cleanBundle();
    b.covenants!.covenants![0].nextEvaluationDate = "not-a-date";
    expect(deriveReasonsForBundle(b, GEN)).not.toContain("COVENANT_DUE");
  });

  it("fires nothing when a facility maturity date is absent or malformed", () => {
    const b = cleanBundle();
    b.exposure!.facilities![0].maturityDate = undefined;
    expect(deriveReasonsForBundle(b, GEN)).not.toContain("MATURITY_NEAR");
    b.exposure!.facilities![0].maturityDate = "13/45/2026";
    expect(deriveReasonsForBundle(b, GEN)).not.toContain("MATURITY_NEAR");
  });

  it("does not fabricate reasons from portfolio signals with null dates", () => {
    const data = {
      meta: { anchorAccountId: "A", generatedAt: GEN },
      portfolio: {
        accounts: [{ accountId: "A", name: "A", tce: 1 }],
        signals: {
          covenantsDueSoon: [{ accountId: "A" }],
          maturitiesSoon: [{ accountId: "A", maturityDate: "nonsense" }],
        },
      },
      borrower: cleanBundle("A"),
      borrowers: { A: cleanBundle("A") },
    } as unknown as C360Data;
    expect(deriveWorklist(data).accountIds).toEqual([]);
  });
});

describe("F5 — an invalid clock disables time-based derivation", () => {
  it("emits no time reasons when generatedAt is missing or unparseable", () => {
    const due = cleanBundle("A");
    due.covenants!.covenants![0].nextEvaluationDate = day(1);
    for (const generatedAt of ["", "not-a-date"]) {
      const data = {
        meta: { anchorAccountId: "A", generatedAt },
        portfolio: { accounts: [{ accountId: "A", name: "A", tce: 1 }] },
        borrower: due,
        borrowers: { A: due },
      } as unknown as C360Data;
      expect(deriveWorklist(data).accountIds).toEqual([]);
    }
  });
});

describe("F6 — facility status + maturity lower bound", () => {
  it("ignores maturities on explicitly closed facilities", () => {
    const b = cleanBundle();
    b.exposure!.facilities = [{ loanId: "L1", maturityDate: day(30), status: "Closed" }];
    b.signals!.maturityWatch = [];
    expect(deriveReasonsForBundle(b, GEN)).not.toContain("MATURITY_NEAR");
  });

  it("counts a facility with no status as active", () => {
    const b = cleanBundle();
    b.exposure!.facilities = [{ loanId: "L1", maturityDate: day(30) }];
    expect(deriveReasonsForBundle(b, GEN)).toContain("MATURITY_NEAR");
  });

  it("counts an explicitly Active facility", () => {
    const b = cleanBundle();
    b.exposure!.facilities = [{ loanId: "L1", maturityDate: day(30), status: "Active" }];
    expect(deriveReasonsForBundle(b, GEN)).toContain("MATURITY_NEAR");
  });

  it("does NOT fire for a maturity already in the past", () => {
    const b = cleanBundle();
    b.exposure!.facilities = [{ loanId: "L1", maturityDate: day(-5) }];
    b.signals!.maturityWatch = [];
    expect(deriveReasonsForBundle(b, GEN)).not.toContain("MATURITY_NEAR");
  });

  it("still fires on the boundary day 0 (matures today)", () => {
    const b = cleanBundle();
    b.exposure!.facilities = [{ loanId: "L1", maturityDate: day(0) }];
    expect(deriveReasonsForBundle(b, GEN)).toContain("MATURITY_NEAR");
  });
});

describe("R3.2 — maturityWatch is a FALLBACK ONLY", () => {
  it("ignores a stale watch entry when active facility maturity data exists", () => {
    const b = cleanBundle();
    // Facility says 500d out (outside the 270d window); stale watch says 10d.
    b.exposure!.facilities = [{ loanId: "L1", maturityDate: day(500) }];
    b.signals!.maturityWatch = [{ loanId: "L1", maturityDate: day(10), daysUntilMaturity: 10 }];
    expect(deriveReasonsForBundle(b, GEN)).not.toContain("MATURITY_NEAR");
  });

  it("still fires from facilities when they are inside the window", () => {
    const b = cleanBundle();
    b.exposure!.facilities = [{ loanId: "L1", maturityDate: day(100) }];
    b.signals!.maturityWatch = [{ loanId: "L1", maturityDate: day(900) }];
    expect(deriveReasonsForBundle(b, GEN)).toContain("MATURITY_NEAR");
  });

  it("uses maturityWatch when there is no usable facility maturity at all", () => {
    const b = cleanBundle();
    b.exposure!.facilities = [];
    b.signals!.maturityWatch = [{ loanId: "L1", maturityDate: day(30) }];
    expect(deriveReasonsForBundle(b, GEN)).toContain("MATURITY_NEAR");
  });

  it("falls back to maturityWatch when facility dates are unparseable", () => {
    const b = cleanBundle();
    b.exposure!.facilities = [{ loanId: "L1", maturityDate: "garbage" }];
    b.signals!.maturityWatch = [{ loanId: "L1", maturityDate: day(30) }];
    expect(deriveReasonsForBundle(b, GEN)).toContain("MATURITY_NEAR");
  });

  it("does NOT fall back when the only facility is CLOSED (no active data)", () => {
    const b = cleanBundle();
    b.exposure!.facilities = [{ loanId: "L1", maturityDate: day(30), status: "Closed" }];
    b.signals!.maturityWatch = [{ loanId: "L1", maturityDate: day(30) }];
    // No ACTIVE facility data ⇒ watch is consulted ⇒ fires.
    expect(deriveReasonsForBundle(b, GEN)).toContain("MATURITY_NEAR");
  });
});

describe("R3.3 — server reasons are validated at consumption", () => {
  const withServerReasons = (reasons: unknown) => {
    const due = cleanBundle("001A");
    due.covenants!.covenants![0].nextEvaluationDate = day(5);
    return {
      meta: { anchorAccountId: "001A", generatedAt: GEN },
      portfolio: { accounts: [{ accountId: "001A", name: "A", tce: 1 }] },
      borrower: due,
      borrowers: { "001A": due },
      worklist: { accountIds: ["001A"], reasons },
    } as unknown as C360Data;
  };

  it("treats a null entry as absent and derives instead of crashing", () => {
    const wl = deriveWorklist(withServerReasons({ "001A": null }));
    expect(wl.reasons["001A"]).toContain("COVENANT_DUE");
  });

  it("filters unknown code strings out of a server entry", () => {
    const wl = deriveWorklist(withServerReasons({ "001A": ["COVENANT_BREACH", "NOT_A_REAL_CODE", 42] }));
    expect(wl.reasons["001A"]).toEqual(["COVENANT_BREACH"]);
  });

  it("treats a non-array entry (string/object) as absent", () => {
    expect(deriveWorklist(withServerReasons({ "001A": "COVENANT_BREACH" })).reasons["001A"]).toContain("COVENANT_DUE");
    expect(deriveWorklist(withServerReasons({ "001A": { a: 1 } })).reasons["001A"]).toContain("COVENANT_DUE");
  });

  it("ignores a non-object reasons map entirely", () => {
    for (const bad of [null, "nope", 7, ["COVENANT_BREACH"]]) {
      expect(deriveWorklist(withServerReasons(bad)).reasons["001A"]).toContain("COVENANT_DUE");
    }
  });

  it("keeps an all-unknown entry as a valid empty (reviewed, no reasons)", () => {
    expect(deriveWorklist(withServerReasons({ "001A": ["BOGUS"] })).reasons["001A"]).toEqual([]);
  });
});

describe("F3 — A9 per-account server precedence", () => {
  const base = (worklist: unknown) => {
    const breached = cleanBundle("001SRV");
    breached.covenants!.covenants![0].breached = true;
    const due = cleanBundle("001DER");
    due.covenants!.covenants![0].nextEvaluationDate = day(5);
    return {
      meta: { anchorAccountId: "001DER", generatedAt: GEN },
      portfolio: {
        accounts: [
          { accountId: "001SRV", name: "S", tce: 2 },
          { accountId: "001DER", name: "D", tce: 1 },
        ],
      },
      borrower: due,
      borrowers: { "001SRV": breached, "001DER": due },
      worklist,
    } as unknown as C360Data;
  };

  it("uses the server entry when one exists for that id", () => {
    const wl = deriveWorklist(base({ accountIds: ["001SRV", "001DER"], reasons: { "001SRV": ["GUARANTOR_SIGNAL"] } }));
    // server entry replaces derivation (which would have said COVENANT_BREACH)
    expect(wl.reasons["001SRV"]).toEqual(["GUARANTOR_SIGNAL"]);
  });

  it("derives for ids with NO own server entry", () => {
    const wl = deriveWorklist(base({ accountIds: ["001SRV", "001DER"], reasons: { "001SRV": ["GUARANTOR_SIGNAL"] } }));
    expect(wl.reasons["001DER"]).toContain("COVENANT_DUE");
  });

  it("honors an explicit empty array as 'reviewed, no reasons'", () => {
    const wl = deriveWorklist(base({ accountIds: ["001SRV", "001DER"], reasons: { "001SRV": [] } }));
    expect(wl.reasons["001SRV"]).toEqual([]);
    expect(wl.accountIds).toContain("001SRV"); // still listed by the server
  });
});

describe("F4 — no ghost rows", () => {
  it("drops derived ids absent from portfolio.accounts and borrowers", () => {
    const data = {
      meta: { anchorAccountId: "001REAL", generatedAt: GEN },
      portfolio: {
        accounts: [{ accountId: "001REAL", name: "R", tce: 1 }],
        signals: { covenantsDueSoon: [{ accountId: "001GHOST", nextEvaluationDate: day(3) }] },
      },
      borrower: cleanBundle("001REAL"),
      borrowers: { "001REAL": cleanBundle("001REAL") },
    } as unknown as C360Data;
    const wl = deriveWorklist(data);
    expect(wl.accountIds).not.toContain("001GHOST");
    expect(wl.reasons["001GHOST"]).toBeUndefined();
  });

  it("drops server accountIds that reference unknown accounts", () => {
    const data = {
      meta: { anchorAccountId: "001REAL", generatedAt: GEN },
      portfolio: { accounts: [{ accountId: "001REAL", name: "R", tce: 1 }] },
      borrower: cleanBundle("001REAL"),
      borrowers: { "001REAL": cleanBundle("001REAL") },
      worklist: { accountIds: ["001REAL", "001GHOST"], reasons: {} },
    } as unknown as C360Data;
    expect(deriveWorklist(data).accountIds).toEqual(["001REAL"]);
  });
});

describe("deriveWorklist", () => {
  it("returns a server-provided row set (ids filtered to known accounts)", () => {
    const data = {
      meta: { anchorAccountId: "A", generatedAt: GEN },
      portfolio: { accounts: [{ accountId: "A", name: "A", tce: 1 }] },
      borrower: cleanBundle("A"),
      borrowers: { A: cleanBundle("A") },
      worklist: { accountIds: ["A"], reasons: { A: ["COVENANT_BREACH"] } },
    } as unknown as C360Data;
    expect(deriveWorklist(data)).toEqual({ accountIds: ["A"], reasons: { A: ["COVENANT_BREACH"] } });
  });

  it("derives from bundles + portfolio signals and ranks by severity", () => {
    const breached = cleanBundle("001BREACH");
    breached.covenants!.covenants![0].breached = true;
    const due = cleanBundle("001DUE");
    due.covenants!.covenants![0].nextEvaluationDate = day(10);

    const data = {
      meta: { anchorAccountId: "001DUE", generatedAt: GEN },
      portfolio: {
        accounts: [
          { accountId: "001BREACH", name: "B", tce: 5_000_000 },
          { accountId: "001DUE", name: "D", tce: 9_000_000 },
          { accountId: "001MAT", name: "M", tce: 1_000_000 },
        ],
        signals: { maturitiesSoon: [{ accountId: "001MAT", maturityDate: day(40) }] },
      },
      borrower: due,
      borrowers: { "001BREACH": breached, "001DUE": due },
    } as unknown as C360Data;

    const wl = deriveWorklist(data);
    expect(wl.accountIds[0]).toBe("001BREACH");
    expect(wl.reasons["001MAT"]).toEqual(["MATURITY_NEAR"]);
    expect(wl.reasons["001DUE"]).toContain("COVENANT_DUE");
  });

  it("omits accounts with no reasons", () => {
    const data = {
      meta: { anchorAccountId: "001CLEAN", generatedAt: GEN },
      portfolio: { accounts: [{ accountId: "001CLEAN", name: "C", tce: 1 }] },
      borrower: cleanBundle("001CLEAN"),
      borrowers: { "001CLEAN": cleanBundle("001CLEAN") },
    } as unknown as C360Data;
    expect(deriveWorklist(data).accountIds).toEqual([]);
  });
});
