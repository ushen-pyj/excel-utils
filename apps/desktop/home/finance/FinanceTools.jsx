import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { command } from "../sdk/bridge";
import { onNativeMessage } from "../sdk/events";
import { modes, analysisModes } from "./toolModes.mjs";
import { createFinanceWorker } from "./workerClient";
import { DataPreview, SavedOutput, ResultChart, TaskProgress } from "./ToolFeedback";
import SourceCard from "./SourceCard";
import SourcePicker from "./SourcePicker";
import HeaderMerge from "./HeaderMerge";
import ResearchTools, { researchModes } from "./ResearchTools";
import "./finance.css";

const headerMode = {id:"header", title:"同表头合并", description:"按列名追加多张工作表，预览合并列序和明细后导出。"};
const allModes = [...modes, headerMode, ...researchModes, ...analysisModes];
const groups = [
  ["整理明细", ["merge","header","split","unpivot"]],
  ["核对与检查", ["compare","invoices"]],
  ["统计分析", ["summary","aging","variance"]],
];
const menuTools = groups.flatMap(([, ids]) => ids.map(id => ({
  id, title: allModes.find(tool => tool.id === id).title
})));
const fileName = path => path.split(/[\\/]/).pop();
const today = new Date();
const localDate = [today.getFullYear(), String(today.getMonth()+1).padStart(2,"0"), String(today.getDate()).padStart(2,"0")].join("-");

export default function FinanceTools() {
  const [mode, setMode] = createSignal("merge");
  const [sources, setSources] = createSignal([]);
  const [result, setResult] = createSignal(null);
  const [statusFilter, setStatusFilter] = createSignal("");
  const displayed = createMemo(() => result()?.groups?.find(g => g.status === statusFilter()) ?? result());
  const [busy, setBusy] = createSignal("");
  const [detail, setDetail] = createSignal("");
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [headerBusy, setHeaderBusy] = createSignal(false);
  const [researchBusy, setResearchBusy] = createSignal(false);
  const busyMode = createMemo(() => busy() || headerBusy() || researchBusy() ? mode() : "");
  createEffect(() => command("workspace:tool-menu", {tools: menuTools, busyMode: busyMode()}));
  const [groupPayments, setGroupPayments] = createSignal(false);
  const [cutoff, setCutoff] = createSignal(localDate);
  const isResearch = () => researchModes.some(m => m.id === mode());
  const legacy = () => !isResearch() && mode() !== "header";
  const active = createMemo(() => allModes.find(m => m.id === mode()));
  const worker = createFinanceWorker();
  let nextId = 0, feedback;
  onCleanup(() => worker.close());

  function resetPreview() {
    if (result()) worker.request("clear").catch(e => setError(e.message));
    setResult(null); setStatusFilter(""); setError(""); setSaved("");
  }
  function update(id, patch) {
    resetPreview(); setSources(list => list.map(s => s.id === id ? {...s,...patch} : s));
  }
  function makeSource(path, tabs, tab, snapshot = false) {
    return {id:++nextId, path, name:fileName(path), tabs, ...tab.config, view:tab.view, revision:0, snapshot};
  }
  function remove(id) {
    const original = sources().find(s => s.id === id);
    resetPreview(); setSources(list => list.filter(s => s.id !== id));
    if (!sources().some(s => s.path === original.path))
      worker.request("remove", {path:original.path}).catch(e => setError(e.message));
  }
  async function range(id, patch, reconfigure = false) {
    const prev = sources().find(s => s.id === id);
    const revision = prev.revision+1;
    const reheader = reconfigure || prev.reheader;
    update(id, {...patch, revision, loading:true, reheader});
    const {path,sheet,header,first,end} = sources().find(s => s.id === id);
    try {
      const {view, config} = await worker.request("sample", {path,sheet,header,first,end,reconfigure:reheader});
      if (sources().find(s => s.id === id)?.revision !== revision) return;
      setSources(list => list.map(s => s.id === id ? {...s,...config,header,first,end,view,loading:false,reheader:false} : s));
    } catch(e) {
      if (sources().find(s => s.id === id)?.revision !== revision) return;
      update(id,{loading:false}); setError(e.message);
    }
  }
  function changeTab(s, name) {
    const tab = s.tabs.find(t => t.name === name);
    update(s.id,{...tab.config,view:tab.view,revision:s.revision+1,loading:false,reheader:false});
  }
  async function loadPaths(reply) {
    const added = [], errors = [];
    if (reply.error) errors.push(reply.error);
    if (reply.notice) setNotice(reply.notice);
    const paths = reply.paths ?? [];
    for (const [i,path] of paths.entries()) {
      const name = fileName(path);
      if ([...sources(),...added].some(s => s.path.toLowerCase() === path.toLowerCase())) {
        errors.push(name + " 已在来源列表中。"); continue;
      }
      setBusy("正在读取工作簿"); setDetail((i+1) + " / " + paths.length + "　" + name);
      try {
        const readPath = reply.readPaths?.[path] ?? path;
        const url = readPath.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/");
        const file = await new Promise(resolve => window.AscDesktopEditor.loadLocalFile(url, resolve));
        if (!file?.length && !file?.byteLength) throw Error("无法读取文件，请检查该文件的读取权限。");
        const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
        const tabs = await worker.request("read",{path,bytes},[bytes.buffer]);
        const tab = tabs.find(t => t.view.columns.length > 1 && t.view.rows.length) ?? tabs[0];
        added.push(makeSource(path,tabs,tab,!!reply.readPaths?.[path]));
      } catch (e) { errors.push(name + "：" + e.message); }
    }
    if (added.length) { resetPreview(); setSources(list => [...list,...added]); }
    if (errors.length) setError(errors.join("　"));
    setBusy(""); setDetail("");
  }
  onCleanup(onNativeMessage((event,raw) => {
    if (event === "workspace:tool") {
      const id = JSON.parse(raw).mode;
      if (id && id !== mode() && !busy() && !headerBusy() && !researchBusy()) {
        resetPreview();
        setMode(id);
      }
    }
    if (event === "finance:sources") loadPaths(JSON.parse(raw));
    if (event === "finance:exported") {
      const reply = JSON.parse(raw);
      setBusy(""); setDetail(""); setError(reply.error ?? ""); setSaved(reply.path ?? "");
    }
  }));
  function pick(directory) {
    setError(""); setBusy("正在选择工作簿"); setDetail(""); command("finance:pick",{directory});
  }
  async function preview() {
    resetPreview(); setBusy("正在生成" + active().title + "预览"); setDetail("处理 " + sources().length + " 个来源");
    try {
      const inputs = sources().map(({tabs,view,...s}) => s);
      setResult(await worker.request("run",{mode:mode(),sources:inputs,options:{cutoff:cutoff(),groupPayments:groupPayments()}}));
    } catch (e) { setError(e.message); }
    finally {
      setBusy(""); setDetail("");
      if (result()) requestAnimationFrame(() => feedback?.scrollIntoView({block:"nearest"}));
    }
  }
  async function save() {
    setBusy("正在生成结果工作簿"); setDetail(result().count.toLocaleString() + " 行"); setError(""); setSaved("");
    try {
      const title = active().title;
      const data = await worker.request("export",{title});
      setBusy("请选择结果文件的保存位置"); setDetail("");
      command("finance:export",{name:title+".xlsx",sources:sources().map(s => s.path),data});
    } catch(e) { setBusy(""); setDetail(""); setError(e.message); }
  }
  const help = () => ({
    compare:"按顺序添加左表、右表，选择可对应的核对键和同币种金额。",
    aging:"先添加单据，再添加逐笔核销明细。单据号需唯一，两份表使用同一币种及金额方向。",
    variance:"先添加预算明细，再添加实际明细。选择同币种金额，项目名称须对应，期间可用 2026-01 或 Excel 日期。",
    unpivot:"选择一张工作表，勾选要展开的列。其他列随明细保留，空值跳过，零值保留。",
    summary:"分别选择分组列和同币种的金额列，明细范围应排除小计和合计行。",
    merge:"可添加多个工作簿，也可选择同一工作簿的多张表。不同模板中含义相同的列可设为同一输出列名。",
  })[mode()];
  const selectionCount = () => sources().length;
  const paired = () => ["compare", "aging", "variance"].includes(mode());
  const requiredCount = () => paired() ? 2 : mode() === "unpivot" ? 1 : 0;
  const previewIssue = createMemo(() => {
    if (requiredCount() && selectionCount() !== requiredCount())
      return "当前工具需要 " + requiredCount() + " 个来源，已选择 " + selectionCount() + " 个。";
    if (mode() === "merge" && sources().some(s => s.view.unnamed?.some(c => !Object.hasOwn(s.unnamedAliases ?? {}, c.index))))
      return "请为缺少表头的列填写输出名称，或勾选跳过。";
    return "";
  });
  function sourceLabel(s) {
    const duplicate = sources().some(other => other.path !== s.path && other.name === s.name);
    return (duplicate ? s.path : s.name) + " · " + s.sheet;
  }
  function pairDescription() {
    const [first, second] = sources().map(sourceLabel);
    if (mode() === "variance") return "差额 = 实际（" + second + "）− 预算（" + first + "）";
    if (mode() === "compare") return "差额 = 左表（" + first + "）− 右表（" + second + "）";
    return "单据：" + first + "　核销：" + second;
  }
  return <div class="ft-page"><div class="ft-content">
    <h1>财务工具</h1>
    <div class="ft-layout">
      <aside class="ft-navigation" aria-label="财务工具列表"><For each={groups}>{([label,ids]) =>
        <div class="ft-mode-group"><h2>{label}</h2><div class="ft-modes" role="group" aria-label={label}>
          <For each={ids}>{id => {const m = allModes.find(t => t.id === id); return <button type="button" class="ft-mode"
            aria-pressed={mode() === id} disabled={!!busy() || headerBusy() || researchBusy()}
            onClick={() => {if(mode() !== id) {resetPreview(); setMode(id);}}}>{m.title}</button>;}}</For>
        </div></div>
      }</For></aside>
      <div class="ft-workspace"><header class="ft-title"><h2>{active().title}</h2><p>{active().description}</p></header>
        <Show when={legacy()}>
          <Show when={busy()}><TaskProgress label={busy()} detail={detail()}/></Show>
          <Show when={notice() && sources().some(s => s.snapshot)}><p role="status" class="ft-notice">{notice()}</p></Show>
          <fieldset disabled={!!busy()}>
            <section class="ft-section">
              <div class="ft-heading"><h2>来源工作簿 <Show when={selectionCount()}><span class="ft-count">{selectionCount()}</span></Show></h2>
                <Show when={selectionCount()}><SourcePicker onPick={pick}>添加工作簿</SourcePicker></Show></div>
              <Show when={selectionCount()} fallback={<div class="ft-empty">
                <div class="ft-grid-icon" aria-hidden="true"></div><strong>添加第一份工作簿</strong><p>{help()}</p>
                <SourcePicker primary onPick={pick}>添加工作簿</SourcePicker>
              </div>}><p class="ft-hint">{help()}</p></Show>
              <For each={sources().map(s => s.id)}>{(id,index) => {
                const s = () => sources().find(t => t.id === id);
                const used = () => sources().filter(t => t.path === s().path).map(t => t.sheet);
                return <SourceCard source={s()} index={index()} mode={mode()} used={used()}
                  suggestions={[...new Set(sources().filter(t => t.id !== id).flatMap(t => Object.values(t.aliases)).filter(Boolean))]}
                  change={patch => update(id,patch)} range={(patch,reset) => range(id,patch,reset)}
                  changeTab={name => changeTab(s(),name)} remove={() => remove(id)} addSheet={() => {
                    const src = s(), tab = src.tabs.find(t => !used().includes(t.name));
                    if (tab) {resetPreview(); setSources(list => [...list,makeSource(src.path,src.tabs,tab,src.snapshot)]);}
                  }}/>;
              }}</For>
            </section>
            <Show when={selectionCount()}>
              <Show when={mode() === "aging"}><label class="ft-option">账龄截止日<input type="date" value={cutoff()}
                onInput={e => {setCutoff(e.currentTarget.value); resetPreview();}}/></label></Show>
              <Show when={mode() === "compare"}><label class="ft-option ft-check"><input type="checkbox" checked={groupPayments()}
                onChange={e => {setGroupPayments(e.currentTarget.checked); resetPreview();}}/>按同一结算号核对一对多、多对一，列出组合明细供复核</label></Show>
              <Show when={paired() && selectionCount() === 2}>
                <div class="ft-run"><span>{pairDescription()}</span><button type="button" onClick={() => {
                  resetPreview(); setSources(list => [list[1], list[0]]);
                }}>交换两表</button></div>
              </Show>
              <div class="ft-run"><button type="button" class="ft-primary" disabled={!!previewIssue() || sources().some(s => s.loading)}
                onClick={preview}>生成预览</button><span>{previewIssue() || "导出为新的 XLSX 工作簿"}</span></div>
            </Show>
            <Show when={result()}>{r => <section class="ft-result" ref={feedback}>
              <div class="ft-heading"><h2>结果预览</h2><button type="button" class="ft-primary" onClick={save}>导出 XLSX</button></div>
              <Show when={saved()}><SavedOutput path={saved()}>已导出至</SavedOutput></Show>
              <Show when={r().groups} fallback={<><p role="status">{r().summary}</p>
                <Show when={r().chart?.items.length}><ResultChart chart={r().chart}/></Show></>}>
                <div class="ft-status-filters" role="group" aria-label="按核对状态筛选">
                  <button aria-pressed={!statusFilter()} onClick={() => setStatusFilter("")}>全部（{r().count}）</button>
                  <For each={r().groups}>{g => <button aria-pressed={statusFilter() === g.status}
                    onClick={() => setStatusFilter(g.status)}>{g.status}（{g.count}）</button>}</For>
                </div>
              </Show>
              <DataPreview headers={r().headers} rows={displayed().rows} label="结果明细" empty="当前条件下没有结果。"/>
              <Show when={r().groups || r().count > 20}><p role="status">{statusFilter() || "全部结果"}共 {displayed().count} 行，
                显示前 {displayed().rows.length} 行。导出包含全部 {r().count.toLocaleString()} 行。</p></Show>
            </section>}</Show>
          </fieldset>
          <Show when={error()}><p role="alert" class="ft-error">{error()}</p></Show>
        </Show>
        <div hidden={mode() !== "header"}><HeaderMerge active={mode() === "header"} onBusy={setHeaderBusy}/></div>
        <For each={researchModes}>{m => <div hidden={mode() !== m.id}>
          <ResearchTools mode={m.id} onBusy={setResearchBusy}/>
        </div>}</For>
      </div>
    </div>
    <footer class="ft-attribution"><button type="button" onClick={() => command("app:license")}
      title="查看组件来源、修改说明和许可证">基于 ONLYOFFICE</button></footer>
  </div></div>;
}
