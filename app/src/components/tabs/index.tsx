import type { ReactElement } from "react";
import type { BorrowerBundle } from "../../data/contract";
import type { AccountTab } from "../../state/appState";
import { ActivityTab } from "./ActivityTab";
import { ExposureTab } from "./ExposureTab";
import { CovenantsTab } from "./CovenantsTab";
import { GraphTab } from "./GraphTab";
import { OpportunitiesTab } from "./OpportunitiesTab";
import { SignalsTab } from "./SignalsTab";
import { FinancialsTab } from "./FinancialsTab";

const TABS: Record<AccountTab, (props: { bundle: BorrowerBundle }) => ReactElement> = {
  activity: ActivityTab,
  exposure: ExposureTab,
  covenants: CovenantsTab,
  graph: GraphTab,
  opportunities: OpportunitiesTab,
  signals: SignalsTab,
  financials: FinancialsTab,
};

export function TabContent({ tab, bundle }: { tab: AccountTab; bundle: BorrowerBundle }) {
  const Component = TABS[tab];
  return <Component bundle={bundle} />;
}
