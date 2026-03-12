"use client";

import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { WorkbenchContextProvider } from "./WorkbenchContext";
import { ThemeMode, WorkbenchShell } from "./WorkbenchShell";
import { persistThemeMode, readThemeMode } from "./themeStore";
import { useExcelWorkbench } from "./useExcelWorkbench";

export function WorkbenchRoot({ children }: { children: ReactNode }) {
  const workbench = useExcelWorkbench();
  const [themeMode, setThemeMode] = useState<ThemeMode>("default");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const savedTheme = await readThemeMode();
      if (!cancelled && savedTheme) {
        setThemeMode(savedTheme);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const themeAlgorithm = useMemo(() => {
    if (themeMode === "dark") return antdTheme.darkAlgorithm;
    if (themeMode === "compact") return antdTheme.compactAlgorithm;
    if (themeMode === "dark-compact") return [antdTheme.darkAlgorithm, antdTheme.compactAlgorithm];
    return antdTheme.defaultAlgorithm;
  }, [themeMode]);

  const isDark = themeMode === "dark" || themeMode === "dark-compact";

  function handleThemeModeChange(mode: ThemeMode) {
    setThemeMode(mode);
    void persistThemeMode(mode);
  }

  return (
    <ConfigProvider theme={{ algorithm: themeAlgorithm }}>
      <AntApp>
        <WorkbenchContextProvider value={workbench}>
          <WorkbenchShell
            activeView={workbench.activeView}
            onNavigate={workbench.setActiveView}
            workbookInfo={workbench.workbookInfo}
            onOpenWorkbook={workbench.openWorkbook}
            onOpenRecentWorkbook={workbench.openRecentWorkbook}
            recentWorkbooks={workbench.recentWorkbooks}
            stats={workbench.stats}
            themeMode={themeMode}
            onThemeModeChange={handleThemeModeChange}
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
