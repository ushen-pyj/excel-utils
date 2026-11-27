import { createContext, createMemo, createSignal, For, onCleanup, onMount, Show, useContext } from "solid-js";
import { listRecents, onNativeMessage, onRecentsChanged, parseRecent, parseRecentDirs } from "../sdk";

const FolderContext = createContext();
const storageKey = "financeSourceFolders";

function uniqueFolders(paths) {
  const seen = new Set(), folders = [];
  for (const path of paths) {
    if (typeof path !== "string" || !path) continue;
    const folder = path.replaceAll("/", "\\").replace(/\\+$/, "").replace(/^([A-Za-z]):$/, "$1:\\");
    const key = folder.toLowerCase();
    if (!seen.has(key)) { seen.add(key); folders.push(folder); }
  }
  return folders;
}

function storedFolders() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(saved) ? uniqueFolders(saved) : [];
  } catch { return []; }
}

export function SourceFolderProvider(props) {
  const [opened, setOpened] = createSignal([]);
  const [picked, setPicked] = createSignal(storedFolders());
  const [workspace, setWorkspace] = createSignal("");
  const folders = createMemo(() => uniqueFolders([workspace(), ...opened(), ...picked()]));
  onMount(() => {
    const update = raw => setOpened(parseRecentDirs(parseRecent(raw).filter(f => f.islocal)).map(dir => dir.full));
    onCleanup(onRecentsChanged(update));
    listRecents().then(update).catch(() => {});
    onCleanup(onNativeMessage((name, raw) => {
      if (name === "workspace:tool") setWorkspace(JSON.parse(raw).directory);
      if (name !== "tools:source-folder") return;
      const next = uniqueFolders([JSON.parse(raw).directory, ...picked()]).slice(0,20);
      setPicked(next);
      try { localStorage.setItem(storageKey,JSON.stringify(next)); } catch { /* Keep session history. */ }
    }));
  });
  return <FolderContext.Provider value={folders}>{props.children}</FolderContext.Provider>;
}

export default function SourcePicker(props) {
  const folders = useContext(FolderContext);
  return <div class="ft-source-picker">
    <button type="button" classList={{"ft-primary":props.primary}} disabled={props.disabled}
      onClick={() => props.onPick(folders()[0] ?? "")}>{props.children}</button>
    <Show when={folders().length}>
      <select aria-label="从最近文件夹选择工作簿" disabled={props.disabled} onChange={e => {
        const directory = e.currentTarget.value;
        e.currentTarget.selectedIndex = 0;
        if (directory) props.onPick(directory);
      }}>
        <option value="">最近文件夹</option>
        <For each={folders()}>{path => <option value={path}>{path}</option>}</For>
      </select>
    </Show>
  </div>;
}
