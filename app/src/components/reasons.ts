import type { ReasonCode } from "../data/contract";

export interface ReasonMeta {
  label: string;
  short: string;
  bg: string;
  fg: string;
}

/** Chip metadata per reason code. Colors are CSS-var references only. */
export const REASON_META: Record<ReasonCode, ReasonMeta> = {
  CLIENT_REQUEST: {
    label: "Client request waiting",
    short: "Request",
    bg: "var(--chip-client-request-bg)",
    fg: "var(--chip-client-request-fg)",
  },
  COVENANT_BREACH: {
    label: "Covenant breach",
    short: "Breach",
    bg: "var(--chip-covenant-breach-bg)",
    fg: "var(--chip-covenant-breach-fg)",
  },
  COVENANT_DUE: {
    label: "Covenant test due",
    short: "Test due",
    bg: "var(--chip-covenant-due-bg)",
    fg: "var(--chip-covenant-due-fg)",
  },
  MATURITY_NEAR: {
    label: "Maturity near",
    short: "Maturity",
    bg: "var(--chip-maturity-near-bg)",
    fg: "var(--chip-maturity-near-fg)",
  },
  MODIFICATION_CLUSTER: {
    label: "Modification cluster",
    short: "Mod cluster",
    bg: "var(--chip-modification-cluster-bg)",
    fg: "var(--chip-modification-cluster-fg)",
  },
  GUARANTOR_SIGNAL: {
    label: "Guarantor signal",
    short: "Guarantor",
    bg: "var(--chip-guarantor-signal-bg)",
    fg: "var(--chip-guarantor-signal-fg)",
  },
  RECENTLY_MODIFIED: {
    label: "Recently modified",
    short: "Modified",
    bg: "var(--chip-recently-modified-bg)",
    fg: "var(--chip-recently-modified-fg)",
  },
};
