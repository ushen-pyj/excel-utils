import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { onNativeMessage } from "../sdk/events";
import { command } from "../sdk/bridge";
import SourcePicker from "./SourcePicker";
import { DataPreview, SavedOutput, TaskProgress } from "./ToolFeedback";
import "./header-merge.css";

const lastRow = 1048576;
const filename = path => path.split(/[\\/]/).pop();
const identity = (path, name) => JSON.stringify([path, name]);
function range(s) {
  return {header: Number(s.header), first: Number(s.first), end: s.end === "" ? lastRow : Number(s.end)};
}
function valid(r) {
  return [r.header, r.first, r.end].every(Number.isInteger) && r.header > 0 &&
    r.first > r.header && r.end >= r.first && r.end <= lastRow;
}
function sameRange(a, b) { return a && b && a.header === b.header && a.first === b.first && a.end === b.end; }
function difference(reference, columns) {
  if (!reference) return "";
  const base = new Set(reference), current = new Set(columns);
  const missing = reference.filter(name => !current.has(name));
  const extra = columns.filter(name => !base.has(name));
  return [missing.length && "缺少「" + missing.join("、") + "」", extra.length && "多出「" + extra.join("、") + "」"]
    .filter(Boolean).join("，");
}

export default function HeaderMerge(props) {
  const [books, setBooks] = createStore([]);
  const [phase, setPhase] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [detail, setDetail] = createSignal("");
  const [progress, setProgress] = createSignal();
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal("");
  const [view, setView] = createSignal("");
  let previewTimer, pending = [];
  const selected = createMemo(() => books.flatMap(b => b.sheets.filter(s => s.checked).map(s => ({
    path: b.path, sheet: s.name, ...range(s), key: identity(b.path, s.name), state: s,
  }))));
  const baseline = createMemo(() => {
    const r = selected()[0];
    return r && sameRange(r.state.preview, r) ? r.state.preview.columns : null;
  });
  function issue(r) {
    if (!valid(r)) return "行号无效，请检查表头行和明细范围。";
    if (r.state.failed) return r.state.failed;
    if (!sameRange(r.state.preview, r)) return "";
    return [difference(baseline(), r.state.preview.columns), r.state.preview.error].filter(Boolean).join("。");
  }
  const ready = createMemo(() => selected().length > 0 && selected().every(r => sameRange(r.state.preview, r) && !issue(r)));
  const previewable = createMemo(() => selected().filter(r => sameRange(r.state.preview, r) && !issue(r)));
  const active = createMemo(() => previewable().find(r => r.key === view()));
  const rows = createMemo(() => {
    const ref = baseline() ?? [];
    return (active() ? [active()] : previewable().slice(0, 12)).flatMap(r => {
      const sample = r.state.preview;
      const byName = new Map(sample.columns.map((name, i) => [name, i]));
      return sample.rows.slice(0, active() ? 3 : 1).map(row => ref.map(name => row.values[byName.get(name)] ?? ""));
    });
  });
  const locked = () => !!phase() && phase() !== "preview";
  function busy(value) { setPhase(value); props.onBusy(!!value); }
  function clear() { setError(""); setSaved(""); setStatus(""); setDetail(""); setProgress(undefined); }
  function pick(directory) { clear(); busy("pick"); command("header:pick",{directory}); }
  function locate(path, name) {
    const b = books.findIndex(book => book.path === path);
    const s = b < 0 ? -1 : books[b].sheets.findIndex(tab => tab.name === name);
    return [b, s];
  }
  function queuePreview() {
    clearTimeout(previewTimer);
    if (props.active === false) return;
    previewTimer = setTimeout(() => {
      if (phase() || props.active === false) return;
      pending = selected().filter(r => valid(r) && !r.state.failed && !sameRange(r.state.preview, r))
        .map(({path, sheet, header, first, end}) => ({path, sheet, header, first, end}));
      if (pending.length) { busy("preview"); command("header:preview", {sources: pending}); }
    }, 240);
  }
  createEffect(() => { if (props.active === false) clearTimeout(previewTimer); else queuePreview(); });
  function merge() {
    if (!ready() || phase()) return;
    clear(); busy("save");
    command("header:run", {sources: selected().map(({path, sheet, header, first, end}) => ({path, sheet, header, first, end}))});
  }
  onCleanup(() => clearTimeout(previewTimer));
  onCleanup(onNativeMessage((event, raw) => {
    if (event !== "header:result" && event !== "header:progress") return;
    const msg = JSON.parse(raw);
    if (event === "header:progress") {
      if (phase() === "cancel") return;
      busy("merge");
      setProgress(msg.value);
      setStatus(msg.finalizing ? "正在写完 XLSX 文件" : msg.total ? "正在合并第 " + msg.current + " / " + msg.total + " 张工作表" : "正在合并明细");
      setDetail(msg.source + " · 已写入 " + msg.rows.toLocaleString() + " 行");
      return;
    }
    const previous = phase();
    busy(""); setStatus(""); setDetail(""); setProgress(undefined);
    if (msg.error) {
      if (previous === "preview") {
        for (const r of pending) {
          const [b, s] = locate(r.path, r.sheet);
          if (s >= 0 && sameRange(r, range(books[b].sheets[s]))) setBooks(b, "sheets", s, "failed", msg.error);
        }
      } else setError(msg.error);
    } else if (msg.type === "books") {
      for (const book of msg.books) {
        const index = books.findIndex(b => b.path.toLowerCase() === book.path.toLowerCase());
        const old = index < 0 ? [] : books[index].sheets;
        const sheets = book.sheets.map(s => {
          const prior = old.find(tab => tab.name === s.name);
          return {...s, detected: s.preview.header, checked: prior?.checked ?? !s.hidden, header: prior?.header ?? s.preview.header,
            first: prior?.first ?? s.preview.first, end: prior?.end ?? "", failed: ""};
        });
        setBooks(index < 0 ? books.length : index, {path: book.path, snapshot: book.snapshot, sheets});
      }
    } else if (msg.type === "preview") {
      for (const book of msg.books) for (const tab of book.sheets) {
        const [b, s] = locate(book.path, tab.name);
        if (s >= 0 && sameRange(tab.preview, range(books[b].sheets[s]))) setBooks(b, "sheets", s, {preview: tab.preview, failed: ""});
      }
      for (const r of pending) {
        const [b, s] = locate(r.path, r.sheet);
        if (s >= 0 && sameRange(r, range(books[b].sheets[s])) && !sameRange(r, books[b].sheets[s].preview))
          setBooks(b, "sheets", s, "failed", "来源工作表已变更，请重新添加工作簿。");
      }
    } else if (msg.type === "done") {
      setStatus("已合并 " + msg.rows.toLocaleString() + " 行 · 用时 " + (msg.milliseconds / 1000).toFixed(2) + " 秒");
      setSaved(msg.path);
    } else if (msg.type === "cancelled") setStatus("已取消合并");
    pending = []; queuePreview();
  }));
  function change(b, s, fields) { clear(); setBooks(b, "sheets", s, {...fields, failed: ""}); queuePreview(); }
  return <section class="ft-section ft-batch">
    <Show when={books.length}>
      <div class="hm-preview">
        <div class="ft-heading"><h2>合并表头与明细预览</h2>
          <Show when={previewable().length > 0}><select value={active()?.key ?? ""} aria-label="预览样例来源"
            onChange={e => setView(e.currentTarget.value)}>
            <option value="" selected={!active()}>各来源首行</option>
            <For each={previewable()}>{r => <option value={r.key} selected={active()?.key === r.key}>{filename(r.path)} · {r.sheet}</option>}</For>
          </select></Show>
        </div>
        <Show when={baseline()?.length} fallback={<p>选择有表头的工作表后可查看合并列序和样例。</p>}>
          <p>{baseline().length} 个输出列，沿用「{filename(selected()[0].path)} · {selected()[0].sheet}」的列序。
            {active() ? (active().state.preview.rows.length ? "样例取自源行 " + active().state.preview.rows.map(r => r.number).join("、") + "。" : "") :
              "最多展示 12 张已对齐工作表的首条明细。"}</p>
          <DataPreview headers={baseline()} rows={rows()} label="合并明细预览" empty="当前预览范围内没有可显示的明细。" />
        </Show>
      </div>
      <div class="ft-run">
        <button class="ft-primary" type="button" disabled={!!phase() || !ready()} onClick={merge}>合并并另存为</button>
        <Show when={selected().some(r => issue(r))}><span>请先修正来源工作表中标出的项目。</span></Show>
      </div>
    </Show>
    <Show when={phase()}><TaskProgress label={status() || ({
      pick: "正在选择工作簿并识别表头", preview: "正在更新表头和样例", save: "请选择结果保存位置", cancel: "正在取消合并",
    })[phase()]} detail={detail()} value={phase() === "merge" ? progress() : undefined} /></Show>
    <Show when={phase() === "merge"}><button type="button" onClick={() => { busy("cancel"); setStatus(""); command("header:cancel"); }}>取消合并</button></Show>
    <Show when={!phase() && status()}>
      <Show when={saved()} fallback={<p role="status" class="ft-saved">{status()}</p>}>
        <SavedOutput path={saved()}>{status()}</SavedOutput>
      </Show>
    </Show>
    <Show when={error()}><p role="alert" class="ft-error">{error()}</p></Show>
    <div class="ft-heading hm-sources-heading">
      <h2>来源工作表<Show when={books.length}><span>已选 {selected().length} 张</span></Show></h2>
      <Show when={books.length}><SourcePicker disabled={!!phase()} onPick={pick}>添加工作簿</SourcePicker></Show>
    </div>
    <Show when={books.length} fallback={<div class="ft-empty">
      <strong>选择要合并的工作簿</strong><p>按相同列名对齐明细，支持各张表使用不同的表头行和列序。</p>
      <SourcePicker primary disabled={!!phase()} onPick={pick}>添加工作簿</SourcePicker>
    </div>}>
      <fieldset disabled={locked()}><For each={books}>{(book, bi) =>
        <article class="ft-source hm-source"><header>
          <strong title={book.path}>{filename(book.path)}</strong>
          <Show when={book.snapshot}><span class="hm-hint">读取添加时已保存的版本</span></Show>
          <button class="hm-remove" type="button" aria-label={"移除 " + filename(book.path)}
            onClick={() => { clear(); setBooks(books.filter(b => b.path !== book.path)); queuePreview(); }}>移除</button>
        </header>
        <For each={book.sheets} fallback={<p>此工作簿没有数据工作表。</p>}>{(s, si) => {
          const item = () => selected().find(r => r.key === identity(book.path, s.name));
          const problem = () => item() && issue(item());
          return <div class="hm-sheet">
            <div class="hm-settings">
              <label class="ft-sheet-name"><input type="checkbox" checked={s.checked}
                onChange={e => change(bi(), si(), {checked: e.currentTarget.checked})} />{s.name}{s.hidden ? "（隐藏）" : ""}</label>
              <Show when={s.checked}>
                <label>表头行<input type="number" min="1" max={lastRow - 1} value={s.header} onInput={e => {
                  const header = e.currentTarget.value;
                  change(bi(), si(), Number(s.first) === Number(s.header) + 1 ? {header, first: Number(header) + 1} : {header});
                }} /></label>
                <label>明细起行<input type="number" min={Number(s.header) + 1} max={lastRow} value={s.first}
                  onInput={e => change(bi(), si(), {first: e.currentTarget.value})} /></label>
                <label>明细末行<input type="number" min={Number(s.first)} max={lastRow} value={s.end} placeholder="至表尾"
                  onInput={e => change(bi(), si(), {end: e.currentTarget.value})} /></label>
                <span class="hm-state" classList={{"hm-warn": !!problem()}}>
                  {problem() ? "需检查" : !sameRange(s.preview, range(s)) ? "正在更新" : s.preview.columns.length + " 列"}
                </span>
              </Show>
            </div>
            <Show when={problem()}><p class="hm-issue" role="alert">{problem()}
              <Show when={s.preview?.columns.length && sameRange(s.preview, range(s))}><br/>当前表头为 {s.preview.columns.join("、")}</Show>
              <Show when={Number(s.header) !== s.detected}><button class="hm-restore" type="button" onClick={() =>
                change(bi(), si(), {header: s.detected, first: s.detected + 1, end: Number(s.end) > s.detected ? s.end : ""})}>
                使用识别的第 {s.detected} 行
              </button></Show>
            </p></Show>
          </div>;
        }}</For></article>
      }</For></fieldset>
    </Show>
  </section>;
}
