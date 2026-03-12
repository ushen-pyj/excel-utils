"use client";

import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import { ReactNode, useMemo, useState } from "react";
import { WorkbenchContextProvider } from "./WorkbenchContext";
import { ThemeMode, WorkbenchShell } from "./WorkbenchShell";
import { useExcelWorkbench } from "./useExcelWorkbench";

export function WorkbenchRoot({ children }: { children: ReactNode }) {
  const workbench = useExcelWorkbench();
  const [themeMode, setThemeMode] = useState<ThemeMode>("default");

  const themeAlgorithm = useMemo(() => {
    if (themeMode === "dark") return antdTheme.darkAlgorithm;
    if (themeMode === "compact") return antdTheme.compactAlgorithm;
    if (themeMode === "dark-compact") return [antdTheme.darkAlgorithm, antdTheme.compactAlgorithm];
    return antdTheme.defaultAlgorithm;
  }, [themeMode]);

  const isDark = themeMode === "dark" || themeMode === "dark-compact";

  return (
    <ConfigProvider theme={{ algorithm: themeAlgorithm }}>
      <AntApp>
        <WorkbenchContextProvider value={workbench}>
          <WorkbenchShell
            activeView={workbench.activeView}
            onNavigate={workbench.setActiveView}
            workbookInfo={workbench.workbookInfo}
            onOpenWorkbook={workbench.openWorkbook}
            stats={workbench.stats}
            themeMode={themeMode}
            onThemeModeChange={setThemeMode}
            isDark={isDark}
            status={workbench.status}
            isOpenWorkbookPending={workbench.isPending("openWorkbook")}
          >
            {children}
          </WorkbenchShell>
        </WorkbenchContextProvider>
      </AntApp>
    </ConfigProvider>
  );
}
