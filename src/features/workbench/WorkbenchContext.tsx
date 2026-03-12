"use client";

import { createContext, ReactNode, useContext } from "react";
import { useExcelWorkbench } from "./useExcelWorkbench";

export type ExcelWorkbenchStore = ReturnType<typeof useExcelWorkbench>;

const WorkbenchContext = createContext<ExcelWorkbenchStore | null>(null);

export function WorkbenchContextProvider({ value, children }: { value: ExcelWorkbenchStore; children: ReactNode }) {
  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbenchContext() {
  const context = useContext(WorkbenchContext);
  if (!context) {
    throw new Error("useWorkbenchContext 必须在 WorkbenchContextProvider 内使用");
  }
  return context;
}
