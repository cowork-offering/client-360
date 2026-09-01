import type { ActionIcon as IconName } from "../actions/registry";

const PATHS: Record<IconName, React.ReactNode> = {
  person: (
    <>
      <circle cx="9" cy="6.2" r="2.9" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.8 15.2c.6-3 2.7-4.6 5.2-4.6s4.6 1.6 5.2 4.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  spread: (
    <>
      <rect x="2.5" y="3" width="13" height="12" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 6.8h13M2.5 10.2h13M6.6 6.8V15" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  memo: (
    <>
      <path d="M10 2H4.5A1.5 1.5 0 003 3.5v11A1.5 1.5 0 004.5 16h9a1.5 1.5 0 001.5-1.5V7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M10 2v5h5M6 10h6M6 12.5h4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  modify: (
    <>
      <path d="M12.4 3.1l2.5 2.5-8 8-3.2.7.7-3.2z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M10.8 4.7l2.5 2.5" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  renew: (
    <>
      <path d="M15 9a6 6 0 11-1.9-4.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M15 2.6V5.6h-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  covenant: (
    <>
      <path d="M9 2.2l5.5 2.4v4.1c0 3.2-2.3 5.8-5.5 6.8-3.2-1-5.5-3.6-5.5-6.8V4.6z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.6 8.9l1.7 1.7 3.1-3.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  collateral: (
    <>
      <path d="M3 7.4L9 3l6 4.4V15H3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7.2 15v-4.2h3.6V15" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  review: (
    <>
      <circle cx="8.2" cy="8.2" r="5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M11.9 11.9L15.5 15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.2 5.6v2.8l1.9 1.1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  rating: (
    <>
      <path d="M2.6 12.6l3.4-3.8 2.6 2.3 3-3.6 2.8 2.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14.4" cy="4.6" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  facility: (
    <>
      <circle cx="9" cy="9" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 5.8v6.4M5.8 9h6.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  service: (
    <>
      <path d="M3 5.4h12M3 9h12M3 12.6h7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  /* THE ORG, AS A SHAPE. A generic cloud silhouette drawn in this file's own
     hand — one closed outline, three lobes over a flat base. It is deliberately
     NOT the Salesforce trademark: the arc's fourth satellite means "the record
     lives over there", and a vendor's registered mark in the corner of a bank's
     cockpit is a licensing question rather than an icon decision. */
  cloud: (
    <>
      <path
        d="M5.4 13.4h7.5a3.05 3.05 0 0 0 .5-6 4.3 4.3 0 0 0-7.9-1.2 3.65 3.65 0 0 0-.1 7.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </>
  ),
  /* The two records the cloud branches to, in the SAME hand. An Account is the
     client's own building; a Product Package is the layered container the
     workroom's type-icon language already draws it as, redrawn at 18. */
  building: (
    <>
      <path d="M3.8 14.6V4.2A1.2 1.2 0 0 1 5 3h3.8a1.2 1.2 0 0 1 1.2 1.2v10.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M10 8.2h3.2a1.2 1.2 0 0 1 1.2 1.2v5.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2.4 14.6h13.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  package: (
    <>
      <path d="M9 2 15.6 5.2 9 8.4 2.4 5.2Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2.4 8.6 9 11.8 15.6 8.6M2.4 11.9 9 15.1 15.6 11.9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function ActionGlyph({ name }: { name: IconName }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="flex-none">
      {PATHS[name]}
    </svg>
  );
}
