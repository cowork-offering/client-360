import type { Snapshot } from "../data/contract";
import { useApp } from "../state/appState";

/* A33.3.6 — every terminal state offers the deep link.
   REFINED after Fabian's live run (2026-07-26): once a record has actually been
   filed, the HERO link opens THAT RECORD. The banker just created something and
   wants to look at it, not at the container it hangs off. The Product Package
   link stays as a secondary "View deal in Salesforce": the package perspective is
   still useful, it is simply no longer the first thing offered.

   The host is NEVER hardcoded and never reconstructed from an org id or a
   guessed my.salesforce.com address. When `meta.instanceUrl` is absent the link
   renders as a DISABLED CHIP with the record id as selectable text, so a banker
   can still carry the id across by hand. */

export function recordDeepLink(
  instanceUrl: string | undefined,
  objectApiName: string | undefined,
  recordId: string | undefined,
): string | null {
  if (!instanceUrl || !objectApiName || !recordId) return null;
  const base = instanceUrl.replace(/\/+$/, "");
  return `${base}/lightning/r/${objectApiName}/${recordId}/view`;
}

export function packageDeepLink(instanceUrl: string | undefined, productPackageId: string | undefined): string | null {
  return recordDeepLink(instanceUrl, "LLC_BI__Product_Package__c", productPackageId);
}

/** The object each write action creates. Used for the deep link and for the
 *  activity entry's reference kind, so both name the same thing. */
export const CREATED_OBJECT: Record<string, { object: string; label: string }> = {
  "collateral-valuation": { object: "LLC_BI__Collateral_Valuation__c", label: "collateral valuation" },
  "create-service-request": { object: "Case", label: "service request" },
  "annual-review": { object: "LLC_BI__Review__c", label: "annual credit review" },
  "risk-rating-review": { object: "LLC_BI__Annual_Review__c", label: "risk rating review" },
  "new-facility-request": { object: "LLC_BI__Loan__c", label: "facility" },
  "covenant-review": { object: "LLC_BI__Covenant_Compliance2__c", label: "covenant assessment" },
  // The modification IS a facility: nCino clones the parent and the clone is
  // the record that was created. The parent is never the created record.
  "loan-modification": { object: "LLC_BI__Loan__c", label: "modification" },
  /* THE INTAKE AUTHORS ON TWO OBJECTS, and the covenant is the one this map
     names because it is the one a banker goes looking for: an asset is found
     through the relationship it now hangs off. The trail's own title says how
     many records were authored, so nothing here stands in for a batch. */
  "relationship-intake": { object: "LLC_BI__Covenant2__c", label: "relationship intake" },
};

/** The record the write just created. Hero on a successful terminal state. */
export function OpenCreatedRecord({
  actionId,
  recordId,
}: {
  actionId: string;
  recordId: string | undefined;
}) {
  const { data } = useApp();
  const target = CREATED_OBJECT[actionId];
  const href = recordDeepLink(data.meta?.instanceUrl, target?.object, recordId);

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        data-deeplink="record"
        className="c360-press c360-accent-btn inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-semibold"
      >
        View in Salesforce
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3h7v7M13 3L7 9M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    );
  }

  // Same fallback doctrine: no org address, no invented host. The id stays
  // selectable so the banker can carry it across by hand.
  return (
    <span className="inline-flex items-center gap-2" data-deeplink="record">
      <span
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[8px] border border-border px-3 py-1.5 text-[11px] font-semibold text-ink-faint"
        aria-disabled="true"
        title="The org address is not available in this view"
      >
        View in Salesforce
      </span>
      {recordId && (
        <span className="select-all font-mono text-[10.5px] text-ink-muted" title={`${target?.label ?? "Record"} id`}>
          {recordId}
        </span>
      )}
    </span>
  );
}

export function OpenInNcino({ snapshot, secondary }: { snapshot: Snapshot | undefined; secondary?: boolean }) {
  const { data } = useApp();
  const id = snapshot?.productPackageId;
  const href = packageDeepLink(data.meta?.instanceUrl, id);
  const label = secondary ? "View deal in Salesforce" : "View in Salesforce";

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        data-deeplink="package"
        className={
          secondary
            ? "c360-press inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[11px] font-semibold text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink"
            : "c360-press c360-accent-btn inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-semibold"
        }
      >
        {label}
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3h7v7M13 3L7 9M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    );
  }

  return (
    <span className="inline-flex items-center gap-2" data-deeplink="package">
      <span
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[8px] border border-border px-3 py-1.5 text-[11px] font-semibold text-ink-faint"
        aria-disabled="true"
        title="The org address is not available in this view"
      >
        {label}
      </span>
      {id && (
        <span className="select-all font-mono text-[10.5px] text-ink-muted" title="Package record id">
          {id}
        </span>
      )}
    </span>
  );
}


/* THE CLIENT'S OWN ACCOUNT RECORD IS NO LONGER A HERO LINK (founder,
   2026-09-01): "the cloud is the door now". The Account record is reached from
   the Salesforce satellite's second tier in the corner, which resolves the same
   `recordDeepLink` under the same no-host-no-link doctrine — one door to the
   org rather than a text affordance in the client's identity line. */

/** The credit package a plan created, when it created one. Secondary to the
 *  facility itself: the banker filed a facility and got a package with it. */
export function OpenCreatedPackage({ packageId }: { packageId: string }) {
  const { data } = useApp();
  const href = recordDeepLink(data.meta?.instanceUrl, "LLC_BI__Product_Package__c", packageId);

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        data-deeplink="created-package"
        className="c360-press inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[11px] font-semibold text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        Open the new package
      </a>
    );
  }

  return (
    <span className="inline-flex items-center gap-2" data-deeplink="created-package">
      <span className="text-[11px] font-semibold text-ink-faint" aria-disabled="true">
        Open the new package
      </span>
      <span className="select-all font-mono text-[10.5px] text-ink-muted" title="Package record id">
        {packageId}
      </span>
    </span>
  );
}
