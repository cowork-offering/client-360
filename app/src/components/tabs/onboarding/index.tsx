import type { ReactElement } from "react";
import type { OnboardingTab } from "../../../state/appState";
import type { OnboardingCase } from "../../../data/onboarding";
import { ProcessTab } from "./ProcessTab";
import { PartiesTab } from "./PartiesTab";
import { DocumentsTab } from "./DocumentsTab";
import { ScreeningTab } from "./ScreeningTab";
import { AttestationTab } from "./AttestationTab";

const TABS: Record<OnboardingTab, (props: { kase: OnboardingCase }) => ReactElement> = {
  process: ProcessTab,
  parties: PartiesTab,
  documents: DocumentsTab,
  screening: ScreeningTab,
  attestation: AttestationTab,
};

export function OnboardingTabContent({ tab, kase }: { tab: OnboardingTab; kase: OnboardingCase }) {
  const Component = TABS[tab] ?? ProcessTab;
  return <Component kase={kase} />;
}
