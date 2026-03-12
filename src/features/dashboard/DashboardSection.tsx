import { DashboardView } from "../../components/ui";
import { cardClass } from "../shared/utils";
import { useExcelWorkbench } from "../workbench/useExcelWorkbench";

export function DashboardSection({ workbench }: { workbench: ReturnType<typeof useExcelWorkbench> }) {
  return <DashboardView cardClass={cardClass} dashboardCards={workbench.dashboardCards} onNavigate={workbench.setActiveView} onOpenWorkbook={workbench.openWorkbook} onRefreshPreview={workbench.refreshPreview} currentTable={workbench.currentTable} financeResult={workbench.financeResult} batchResult={workbench.batchResult} />;
}