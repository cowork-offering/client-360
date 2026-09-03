/* =============================================================================
   THE PLUS MENU'S ICON SET.

   ONE FILE, ONE GRAMMAR. 16px box, stroke 1.5, currentColor, round caps and
   joins, no fills. The package carries no icon library (package.json is React,
   react-dom and @tanstack/react-table), so these are drawn here rather than
   pulled in, and they are drawn to the SAME rules the room's own send arrow
   already uses: a hairline path on a small viewBox, inheriting colour.

   NO EMOJI, ANYWHERE. A topic row is a banking surface.
   ============================================================================= */

import type { ReactElement } from "react";

interface IconProps {
  /** Box size in pixels. The panel uses 16 everywhere except the plus itself. */
  size?: number;
}

function frame(size: number, path: ReactElement): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

/** The composer button itself. */
export const IconPlus = ({ size = 14 }: IconProps = {}) => frame(size, <path d="M8 3.2v9.6M3.2 8h9.6" />);

/** Facility Terms: the sliders a banker moves. */
export const IconTerms = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M2.5 4.5h11M2.5 11.5h11" />
      <circle cx="6" cy="4.5" r="1.6" />
      <circle cx="10.5" cy="11.5" r="1.6" />
    </>,
  );

/** Legal Entity: the parties on the deal. */
export const IconEntity = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <circle cx="6" cy="5.5" r="2.2" />
      <path d="M2 13.2c.5-2.1 2.1-3.2 4-3.2s3.5 1.1 4 3.2" />
      <path d="M10.6 3.6a2.2 2.2 0 0 1 0 3.8M11.6 10.3c1.3.4 2.1 1.4 2.4 2.9" />
    </>,
  );

/** Covenant: the test that has to hold. */
export const IconCovenant = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M8 1.9 3 3.6v4.1c0 3 2.1 5.2 5 6.4 2.9-1.2 5-3.4 5-6.4V3.6L8 1.9Z" />
      <path d="M6 7.8 7.5 9.3 10.2 6.2" />
    </>,
  );

/** Collateral: what stands behind the loan. */
export const IconCollateral = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M2.4 6.6 8 2.4l5.6 4.2" />
      <path d="M3.8 7.6v6h8.4v-6" />
      <path d="M6.6 13.6v-3.3h2.8v3.3" />
    </>,
  );

/** Pricing and Payment: the rate and the schedule. */
export const IconPricing = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M12.6 3.4 3.4 12.6" />
      <circle cx="4.9" cy="4.9" r="1.8" />
      <circle cx="11.1" cy="11.1" r="1.8" />
    </>,
  );

/** Fees: the row that bills. */
export const IconFees = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M3.4 2.2v11.6l2-1.2 2 1.2 2-1.2 2 1.2V2.2l-2 1.2-2-1.2-2 1.2-2-1.2Z" />
      <path d="M5.9 6.4h4.2M5.9 9.2h2.8" />
    </>,
  );

/** Exceptions: out of policy, and said out loud. */
export const IconException = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M8 2.4 1.9 13h12.2L8 2.4Z" />
      <path d="M8 6.6v3M8 11.6v.1" />
    </>,
  );

/** Reviews: the governance calendar. */
export const IconReview = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M4.4 2.6h7.2c.6 0 1 .4 1 1v9.8c0 .6-.4 1-1 1H4.4c-.6 0-1-.4-1-1V3.6c0-.6.4-1 1-1Z" />
      <path d="M6.1 1.6h3.8v2.2H6.1z" />
      <path d="M5.9 9.1 7.3 10.5 10.2 7.3" />
    </>,
  );

/** Service: what the client asked us for. */
export const IconService = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M3.4 8a4.6 4.6 0 0 1 9.2 0" />
      <path d="M2.6 8.6h1.6v3.6H3.4a.8.8 0 0 1-.8-.8V8.6ZM13.4 8.6h-1.6v3.6h.8a.8.8 0 0 0 .8-.8V8.6Z" />
      <path d="M11.8 12.2v.5a1.4 1.4 0 0 1-1.4 1.4H8.6" />
    </>,
  );

/** The relationship itself, at the top of level one. */
export const IconRelationship = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <circle cx="8" cy="3.6" r="1.9" />
      <circle cx="3.4" cy="12" r="1.9" />
      <circle cx="12.6" cy="12" r="1.9" />
      <path d="M6.7 5.2 4.6 10.3M9.3 5.2l2.1 5.1M5.3 12h5.4" />
    </>,
  );

/** A facility row at level one. */
export const IconFacility = ({ size = 16 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M2.4 4.2h11.2c.5 0 .9.4.9.9v5.8c0 .5-.4.9-.9.9H2.4c-.5 0-.9-.4-.9-.9V5.1c0-.5.4-.9.9-.9Z" />
      <circle cx="8" cy="8" r="1.7" />
    </>,
  );

/** Forward, into the next level. */
export const IconChevron = ({ size = 14 }: IconProps = {}) => frame(size, <path d="M6.2 3.6 10.6 8l-4.4 4.4" />);

/** Back, one level. */
export const IconBack = ({ size = 14 }: IconProps = {}) =>
  frame(
    size,
    <>
      <path d="M9.8 3.6 5.4 8l4.4 4.4" />
    </>,
  );

/** The filter field. */
export const IconSearch = ({ size = 14 }: IconProps = {}) =>
  frame(
    size,
    <>
      <circle cx="7.1" cy="7.1" r="4.2" />
      <path d="M10.2 10.2 13.4 13.4" />
    </>,
  );
