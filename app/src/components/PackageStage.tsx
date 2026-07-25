import type { Snapshot } from "../data/contract";

/* A33.3.7 — stage authority.

   1. The credit lifecycle is the nCino LOAN stage ladder. That is what a banker
      means by "where is this deal", and it is what every tracker, confirm
      summary and terminal state references.
   2. On the package, the authority is the MANAGED `LLC_BI__Stage__c`. The local
      `cm_Credit_Stage__c` is not adopted as an authority and no component reads
      it as one. Package stage is display-only.
   3. A disagreement between the two is a DATA-QUALITY FINDING, not a modelling
      decision. We report it. We do not model around it, and we never silently
      pick whichever field looks tidier. */

/** The authoritative package stage: the managed field when the assembler
 *  supplies it, else `primaryStage`, which IS the package stage Customer360
 *  returns today. The local `cm_Credit_Stage__c` is never a fallback. */
export function authoritativePackageStage(snapshot: Snapshot | undefined): string | null {
  return snapshot?.packageStage ?? snapshot?.primaryStage ?? null;
}

export function packageStageDq(snapshot: Snapshot | undefined): string | null {
  const managed = authoritativePackageStage(snapshot);
  const local = snapshot?.localCreditStage;
  if (!managed || !local) return null;
  if (managed === local) return null;
  return `The local credit stage reads ${local} while the managed package stage reads ${managed}. The managed field is authoritative; this disagreement is a data-quality finding on the record.`;
}

export function PackageStageChip({ snapshot }: { snapshot: Snapshot | undefined }) {
  // Display-only, and always from the MANAGED field.
  const managed = authoritativePackageStage(snapshot);
  if (!managed) return null;
  const dq = packageStageDq(snapshot);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-semibold"
        style={{ background: "var(--wash-2)", color: "var(--ink-body)" }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Package</span>
        <span className="h-2.5 w-px" style={{ background: "var(--border-strong)" }} />
        {managed}
      </span>
      {dq && (
        <span
          className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
          style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
          title={dq}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.6L1 14h14z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 6.4v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11.4" r=".85" fill="currentColor" />
          </svg>
          Data quality
        </span>
      )}
    </span>
  );
}
