import type { C360Data, Id, ReasonCode, Worklist } from "./contract";
import { dayDiff } from "./time";
import { isActiveFacility } from "./worklist";

export interface WorklistRow {
  accountId: Id;
  name: string;
  industry: string;
  naicsCode: string | null;
  riskRating: number | null;
  tce: number | null;
  outstanding: number | null;
  reasons: ReasonCode[];
  nextTestDays: number | null;
  nextTestDate: string | null;
  maturityDays: number | null;
  maturityDate: string | null;
  staged: boolean;
  sample: boolean;
}

function earliest(
  dates: Array<string | undefined | null>,
  generatedAt: string,
): { days: number | null; date: string | null } {
  let bestDays = Infinity;
  let bestDate: string | null = null;
  for (const iso of dates) {
    if (!iso) continue;
    const d = dayDiff(iso, generatedAt);
    if (d !== null && d < bestDays) {
      bestDays = d;
      bestDate = iso;
    }
  }
  return bestDate ? { days: bestDays, date: bestDate } : { days: null, date: null };
}

/** Assemble the worklist display rows. Column sources (SPEC §12 A11):
 *  Account→portfolio.accounts.name · Reasons→derived · Rating→riskRating ·
 *  TCE→tce · Next test→earliest covenant nextEvaluationDate vs generatedAt ·
 *  Maturity→earliest facility maturityDate vs generatedAt · Last modified→not
 *  in the data, rendered "—". Pure over its inputs; safe when borrowers absent. */
export function buildWorklistRows(data: C360Data, worklist: Worklist): WorklistRow[] {
  // F5: no fallback chain — generatedAt is the single required clock.
  const generatedAt = data.meta?.generatedAt ?? "";
  const acctMap = new Map(data.portfolio?.accounts?.map((a) => [a.accountId, a]) ?? []);
  const bundles = data.borrowers ?? {};
  const anchorId = data.borrower?.snapshot?.accountId;

  const sigDue = new Map<Id, string>();
  for (const c of data.portfolio?.signals?.covenantsDueSoon ?? []) {
    if (c.accountId && c.nextEvaluationDate && !sigDue.has(c.accountId)) sigDue.set(c.accountId, c.nextEvaluationDate);
  }
  const sigMat = new Map<Id, string>();
  for (const m of data.portfolio?.signals?.maturitiesSoon ?? []) {
    if (m.accountId && m.maturityDate && !sigMat.has(m.accountId)) sigMat.set(m.accountId, m.maturityDate);
  }

  return worklist.accountIds.map((id) => {
    const a = acctMap.get(id);
    const bundle = bundles[id] ?? (id === anchorId ? data.borrower : undefined);
    const grade = a?.riskRating != null ? parseInt(a.riskRating, 10) : NaN;

    const covDates = (bundle?.covenants?.covenants ?? []).map((c) => c.nextEvaluationDate);
    if (sigDue.has(id)) covDates.push(sigDue.get(id));
    const nextTest = earliest(covDates, generatedAt);

    // F6: only ACTIVE facilities contribute the "earliest maturity" figure.
    const matDates = [
      ...(bundle?.exposure?.facilities ?? []).filter(isActiveFacility).map((f) => f.maturityDate),
      ...(bundle?.signals?.maturityWatch ?? []).map((m) => m.maturityDate),
    ];
    if (sigMat.has(id)) matDates.push(sigMat.get(id));
    const maturity = earliest(matDates, generatedAt);

    return {
      accountId: id,
      name: a?.name ?? bundle?.snapshot?.name ?? id,
      industry: a?.industry ?? bundle?.snapshot?.industry ?? "—",
      naicsCode: a?.naicsCode ?? bundle?.snapshot?.naicsCode ?? null,
      riskRating: Number.isNaN(grade) ? null : grade,
      tce: a?.tce ?? bundle?.snapshot?.totalCreditExposure ?? null,
      outstanding: a?.outstanding ?? bundle?.snapshot?.totalOutstanding ?? null,
      reasons: worklist.reasons[id] ?? [],
      nextTestDays: nextTest.days,
      nextTestDate: nextTest.date,
      maturityDays: maturity.days,
      maturityDate: maturity.date,
      staged: !!bundle,
      sample: a?._sample_only === true,
    };
  });
}
