"use client";

import { ReactNode, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { statusToneClass } from "../shared/utils";
import { navItems } from "./constants";
import { StatusTone, ViewKey } from "../shared/types";

function WindowControls() {
  const [isTauriWindow, setIsTauriWindow] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    const appWindow = getCurrentWindow();
    setIsTauriWindow(true);

    let unlisten: (() => void) | undefined;

    void appWindow.isMaximized().then(setIsMaximized).catch(() => undefined);
    void appWindow.onResized(async () => {
      try {
        setIsMaximized(await appWindow.isMaximized());
      } catch {
        // Ignore window state sync issues outside Tauri.
      }
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => undefined);

    return () => {
      unlisten?.();
    };
  }, []);

  if (!isTauriWindow) {
    return null;
  }

  const appWindow = getCurrentWindow();

  return (
    <div className="flex items-center gap-2" data-tauri-drag-region>
      <button
        type="button"
        aria-label="最小化窗口"
        className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
        onClick={() => void appWindow.minimize()}
      >
        <span className="h-px w-3 bg-current" />
      </button>
      <button
        type="button"
        aria-label={isMaximized ? "还原窗口" : "最大化窗口"}
        className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
        onClick={() => void appWindow.toggleMaximize()}
      >
        <span className="relative block h-3.5 w-3.5">
          <span className={`absolute inset-0 border border-current ${isMaximized ? "translate-x-[-2px] translate-y-[2px]" : ""}`} />
          {isMaximized ? <span className="absolute inset-0 translate-x-[2px] translate-y-[-2px] border border-current bg-transparent" /> : null}
        </span>
      </button>
      <button
        type="button"
        aria-label="关闭窗口"
        className="grid h-9 w-9 place-items-center rounded-xl border border-rose-400/25 bg-rose-400/10 text-rose-200 transition hover:border-rose-300/45 hover:bg-rose-400/18 hover:text-white"
        onClick={() => void appWindow.close()}
      >
        <span className="relative block h-3.5 w-3.5">
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45 bg-current" />
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 -rotate-45 bg-current" />
        </span>
      </button>
    </div>
  );
}

export function WorkbenchShell({ activeView, onNavigate, status, stats, children }: { activeView: ViewKey; onNavigate: (key: ViewKey) => void; status: { message: string; tone: StatusTone }; stats: Array<{ label: string; value: string }>; children: ReactNode; }) {
  const navMeta = navItems.find((item) => item.key === activeView) ?? navItems[0];

  return (
    <main className="panel-grid h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(30,64,175,0.18),transparent_22%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(7,18,38,0.94))] text-slate-50">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="border-b border-white/10 bg-slate-950/65 px-3 py-2 backdrop-blur-2xl md:px-4" data-tauri-drag-region>
          <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4" data-tauri-drag-region>
            <div className="flex min-w-0 items-center gap-3" data-tauri-drag-region>
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-sm font-bold text-amber-200 shadow-[0_0_24px_rgba(245,158,11,0.12)]">X</div>
              <div className="min-w-0" data-tauri-drag-region>
                <p className="truncate text-sm font-semibold text-slate-100">Excel Utils</p>
                <p className="truncate text-xs text-slate-400">{navMeta.label} · 桌面工作台</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400 xl:flex" data-tauri-drag-region>
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(134,239,172,0.7)]" />
              Tauri Desktop
            </div>
            <WindowControls />
          </div>
        </header>

        <div className="mx-auto grid h-full min-h-0 w-full max-w-[1800px] overflow-hidden px-3 py-3 md:px-4 md:py-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/55 shadow-[0_20px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl lg:rounded-r-none lg:border-r-0">
            <div className="border-b border-white/10 px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
              <div className="flex items-center justify-between gap-4 lg:block">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-amber-200/85">Excel Workspace</p>
                  <h1 className="mt-2 text-xl font-semibold text-white sm:text-2xl">Excel 工具箱</h1>
                </div>
                <div className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 sm:inline-flex">桌面工作台</div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <nav className="scrollbar-thin flex gap-2 overflow-x-auto px-3 py-3 sm:px-4 lg:grid lg:gap-1.5 lg:overflow-y-auto lg:overflow-x-hidden lg:px-3 lg:py-4">
                {navItems.map((item) => {
                  const active = item.key === activeView;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onNavigate(item.key)}
                      className={`min-w-[152px] rounded-2xl border px-4 py-3 text-left transition lg:min-w-0 ${
                        active
                          ? "border-amber-300/45 bg-amber-300/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "border-transparent bg-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{item.eyebrow}</span>
                        {active ? <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.85)]" /> : null}
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-inherit sm:text-[15px]">{item.label}</p>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="border-t border-white/10 px-4 py-4 sm:px-5 lg:px-6">
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">状态中心</p>
                <p className={`mt-2 text-sm leading-6 ${statusToneClass(status.tone)}`}>{status.message}</p>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,18,40,0.9),rgba(8,15,28,0.58))] shadow-[0_20px_80px_rgba(2,6,23,0.35)] backdrop-blur-xl lg:rounded-l-none">
            <header className="animate-fade-up border-b border-white/10 px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
              <div className="rounded-[26px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-amber-200/90">
                      <span className="h-2 w-2 rounded-full bg-amber-300" />
                      {navMeta.eyebrow}
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold text-white sm:text-3xl">{navMeta.label}</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{navMeta.desc}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    {stats.map((item) => (
                      <div
                        key={item.label}
                        className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-300"
                      >
                        <p className="truncate text-[11px] uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                        <p className="mt-2 truncate text-base font-semibold text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-5 lg:px-6 lg:pb-6">
              <div className="scrollbar-thin h-full overflow-y-auto pt-4 pr-1 animate-fade-in">{children}</div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}