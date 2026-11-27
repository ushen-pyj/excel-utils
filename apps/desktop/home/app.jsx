import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { A, HashRouter, useLocation } from "@solidjs/router";
import Open from "./routes/open";
import { RecentList } from "./routes/home/components/RecentList";
import { FileDropZone } from "./routes/home/components/FileDropZone";
import { t } from "./services/l10n";
import { clearRecents, listRecents, onRecentsChanged, parseRecent, pinRecent, removeRecent } from "./sdk";
import { onNativeMessage } from "./sdk/events";
import { command } from "./sdk/bridge";
import FinanceTools from "./finance/FinanceTools";
import { SourceFolderProvider } from "./finance/SourcePicker";
import "./styles/main.css";
import "./styles/layout.css";
import "./styles/components/home.css";
import "./shell/Sidebar.styles.css";
import "./workspace.css";

function applyWebTheme(theme) {
  if (!theme) return;
  const dark = !!theme.dark;
  document.body.classList.toggle("theme-dark", dark);
  document.body.classList.toggle("theme-type-dark", dark);
  document.body.classList.toggle("theme-white", !dark);
  document.body.classList.toggle("theme-type-light", !dark);

  const root = document.documentElement.style;
  if (theme.accent) {
    root.setProperty("--el-accent", theme.accent);
    root.setProperty("--el-accent-hover", theme.accentHover || theme.accent);
    root.setProperty("--el-accent-pressed", theme.accentPressed || theme.accent);
    root.setProperty("--el-accent-soft", theme.accentSoft || (dark ? "rgba(34,197,94,0.18)" : "#e7f5ed"));
    root.setProperty("--el-accent-soft-hover", theme.accentSoftHover || (dark ? "rgba(34,197,94,0.28)" : "#d8f0e2"));
    root.setProperty("--el-accent-border", theme.accentBorder || (dark ? "rgba(34,197,94,0.45)" : "#b7dfc8"));
    root.setProperty("--el-accent-text", theme.accentText || theme.accent);
    if (theme.accentRgb) root.setProperty("--el-accent-rgb", theme.accentRgb);
  }
}

function NavIcon(props) {
  return (
    <div class="icon-inner-box" aria-hidden="true">
      <svg class="icon nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        {props.name === "home" && <>
          <path d="M3.75 10.5 12 3.75l8.25 6.75" />
          <path d="M6 9.25V19a1.25 1.25 0 0 0 1.25 1.25h3.5v-5.5h2.5v5.5h3.5A1.25 1.25 0 0 0 18 19V9.25" />
        </>}
        {props.name === "open" && <>
          <path d="M3.5 6.5A1.75 1.75 0 0 1 5.25 4.75h4.1l1.85 2h7.55A1.75 1.75 0 0 1 20.5 8.5v9.25a1.75 1.75 0 0 1-1.75 1.75H5.25A1.75 1.75 0 0 1 3.5 17.75z" />
          <path d="M3.5 9.5h17" />
        </>}
        {props.name === "workspace" && <>
          <rect x="3.5" y="4" width="17" height="16" rx="1.75" />
          <path d="M9.25 4v16" />
          <path d="M9.25 11.5H20.5" />
        </>}
        {props.name === "tools" && <>
          <rect x="3.5" y="3.5" width="7.25" height="7.25" rx="1.5" />
          <rect x="13.25" y="3.5" width="7.25" height="7.25" rx="1.5" />
          <rect x="3.5" y="13.25" width="7.25" height="7.25" rx="1.5" />
          <path d="M16.875 13.5v6.75" />
          <path d="M13.5 16.875h6.75" />
        </>}
        {props.name === "settings" && <>
          <circle cx="12" cy="12" r="3.1" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </>}
      </svg>
    </div>
  );
}

function ActivityItem(props) {
  return (
    <li class="menu-item">
      <Show when={props.href} fallback={
        <button type="button" class="menu-btn" onClick={props.onClick}>
          <NavIcon name={props.icon} />
          <span class="text">{props.label}</span>
        </button>
      }>
        <A href={props.href} activeClass="selected" end={props.end}>
          <NavIcon name={props.icon} />
          <span class="text">{props.label}</span>
        </A>
      </Show>
    </li>
  );
}

function Home() {
  const [files, setFiles] = createSignal([]);
  const [ready, setReady] = createSignal(false);
  const update = raw => {
    setFiles(parseRecent(raw).filter(file => file.islocal && file.ext.toLowerCase() === ".xlsx")
      .sort((a, b) => a.pinid - b.pinid));
    setReady(true);
  };
  onMount(() => {
    const unsubscribe = onRecentsChanged(update);
    listRecents().then(update).catch(() => setReady(true));
    onCleanup(unsubscribe);
  });
  const togglePin = id => {
    const item = files().find(file => file.fileid === id);
    if (item) {
      pinRecent(id, !item.pinned);
      listRecents().then(update);
    }
  };
  return <div class="home-page">
    <div class="cnt-title"><h1>{t("listRecentFileTitle")}</h1></div>
    <Show when={ready() && !files().length}><section class="file-drop-section"><FileDropZone /></section></Show>
    <section class="file-list-section">
      <RecentList recents={files()} onTogglePin={togglePin}
        onRemove={id => { removeRecent(id); listRecents().then(update); }}
        onClear={() => { clearRecents(); listRecents().then(update); }} />
    </section>
  </div>;
}

function Shell(props) {
  const location = useLocation();
  const [toolDialog, setToolDialog] = createSignal(false);
  onCleanup(onNativeMessage((name, raw) => {
    if (name === "workspace:tool") setToolDialog(true);
    if (name === "workspace:tool-closed") setToolDialog(false);
    if (name === "app:theme") {
      try { applyWebTheme(JSON.parse(raw)); } catch { /* ignore malformed payload */ }
    }
  }));
  onMount(() => {
    document.title = "Excel Utils";
    // Matches the default light theme of Desktop Editors 10 until native theme sync arrives.
    document.body.classList.add("theme-white", "theme-type-light");
    document.getElementById("loading-mask")?.remove();
    command("app:theme-ready", {});
  });
  return <div class="shell" classList={{ "workspace-tool-dialog": toolDialog() }}>
    <div class="col-sidebar">
      <nav class="tool-menu" aria-label="文件">
        <ActivityItem href="/" icon="home" label={t("actHome")} end />
        <ActivityItem href="/open" icon="open" label={t("actOpenLocal")} />
        <ActivityItem onClick={() => command("workspace:show", {})} icon="workspace" label="工作区" />
        <ActivityItem href="/tools" icon="tools" label="工具" />
      </nav>
      <div class="sidebar-footer">
        <button type="button" class="sidebar-settings-btn" onClick={() => command("app:settings", {})}
          title="外观与主题色设置" aria-label="外观设置">
          <NavIcon name="settings" />
          <span class="text">设置</span>
        </button>
      </div>
    </div>
    <main class="col-center">
      <div class="home-panel" classList={{ "panel-active": location.pathname === "/" }}><Home /></div>
      <div class="home-panel tool-panel" classList={{ "panel-active": toolDialog() || location.pathname === "/tools" }}>
        <SourceFolderProvider><FinanceTools /></SourceFolderProvider>
      </div>
      {props.children}
      <Show when={location.pathname !== "/tools"}><button class="source-credit" onClick={() => command("app:license")}
        title="查看组件来源、修改说明和许可证">基于 ONLYOFFICE</button></Show>
    </main>
  </div>;
}

export default function App() {
  return <HashRouter root={Shell}>{[
    { path: "/", component: () => null },
    { path: "/open", component: Open },
    { path: "/tools", component: () => null }
  ]}</HashRouter>;
}
