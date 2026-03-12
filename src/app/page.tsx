"use client";

import { DashboardSection } from "../features/dashboard/DashboardSection";
import { BatchSection } from "../features/batch/BatchSection";
import { CleaningSection } from "../features/cleaning/CleaningSection";
import { FinanceSection } from "../features/finance/FinanceSection";
import { PrintSection } from "../features/print/PrintSection";
import { WorkbookSection } from "../features/workbook/WorkbookSection";
import { useWorkbenchContext } from "../features/workbench/WorkbenchContext";

export default function Page() {
  const workbench = useWorkbenchContext();

  return (
    <>
      {workbench.activeView === "dashboard" ? <DashboardSection workbench={workbench} /> : null}
      {workbench.activeView === "workbook" ? <WorkbookSection workbench={workbench} /> : null}
      {workbench.activeView === "cleaning" ? <CleaningSection workbench={workbench} /> : null}
      {workbench.activeView === "batch" ? <BatchSection workbench={workbench} /> : null}
      {workbench.activeView === "finance" ? <FinanceSection workbench={workbench} /> : null}
      {workbench.activeView === "print" ? <PrintSection workbench={workbench} /> : null}
    </>
  );
}
