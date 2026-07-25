import type { Snapshot } from "../data/contract";
import { useApp } from "../state/appState";

/* A33.3.6 — every terminal state offers the deep link, pointing at the PRODUCT
   PACKAGE, because the package is the deal container and the anchor for
   commercial credit actions.

   The host is NEVER hardcoded and never reconstructed from an org id or a
   guessed my.salesforce.com address. When `meta.instanceUrl` is absent the link
   renders as a DISABLED CHIP with the record id as selectable text, so a banker
   can still carry the id across by hand. */

export function packageDeepLink(instanceUrl: string | undefined, productPackageId: string | undefined): string | null {
  if (!instanceUrl || !productPackageId) return null;
  const base = instanceUrl.replace(/\/+$/, "");
  return `${base}/lightning/r/LLC_BI__Product_Package__c/${productPackageId}/view`;
}

export function OpenInNcino({ snapshot }: { snapshot: Snapshot | undefined }) {
  const { data } = useApp();
  const id = snapshot?.productPackageId;
  const href = packageDeepLink(data.meta?.instanceUrl, id);

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="c360-press c360-accent-btn inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-semibold"
      >
        Open in nCino
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3h7v7M13 3L7 9M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[8px] border border-border px-3 py-1.5 text-[11px] font-semibold text-ink-faint"
        aria-disabled="true"
        title="The org address is not available in this view"
      >
        Open in nCino
      </span>
      {id && (
        <span className="select-all font-mono text-[10.5px] text-ink-muted" title="Package record id">
          {id}
        </span>
      )}
    </span>
  );
}
