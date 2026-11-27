import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { command } from "../sdk/bridge";
import SourcePicker from "./SourcePicker";
import { onNativeMessage } from "../sdk/events";
import { DataPreview, SavedOutput, TaskProgress } from "./ToolFeedback";
import "./research-tools.css";

export const researchModes = [
  { id: "split", title: "按列拆表", description: "按部门或客户生成独立工作簿和拆分清单" },
  { id: "invoices", title: "发票查重", description: "比对本期与历史报销台账，定位重复票号" },
];
const lastRow = 1048576;
const filename = path => path.split(/[\\/]/).pop();
const fields = {
  group: ["拆分列", /成本中心|部门|客户|类别|分类/],
  amount: ["核对金额列", /金额|实付|实收/],
  invoice: ["发票号码列", /发票号|发票编号|票号|invoice\s*(no|number)/i],
  claim: ["报销单号列", /报销单号|报销编号|报销单据|申请单号/],
  code: ["发票代码列", /发票代码|票据代码/],
};
function configure(tab) {
  const result = {sheet:tab.name, header:tab.header, first:tab.header + 1, end:"",
    columns:tab.columns.map(c => c.index), tab, verified:true};
  for (const [key,[,re]] of Object.entries(fields)) {
    result[key] = tab.columns.find(c => re.test(c.name))?.index ?? null;
  }
  return result;
}
function range(s) { return { header:Number(s.header), first:Number(s.first), end:s.end === "" ? lastRow : Number(s.end) }; }
function valid(s) {
  const {header,first,end} = range(s);
  return [header,first,end].every(Number.isInteger) && header > 0 && first > header && end >= first && end <= lastRow;
}
function sourceRequest(s) {
  return {path:s.path,sheet:s.sheet,...range(s),group:s.group,amount:s.amount,columns:s.columns,
    invoice:s.invoice,claim:s.claim,code:s.code,history:s.history,skipTotals:s.skipTotals,
    expected:Object.fromEntries(s.tab.columns.map(c => [c.index,c.name]))};
}
const templateKey = mode => "excel-utils.finance." + mode + ".templates.v1";
function getTemplates(mode) {
  try { return Object.entries(JSON.parse(localStorage.getItem(templateKey(mode)) || "{}")); } catch { return []; }
}
function ResearchWorkspace(props) {
  const split = props.mode === "split";
  const fieldNames = split ? ["group","amount"] : ["invoice","code","claim"];
  const [sources,setSources] = createSignal([]);
  const [phase,setPhase] = createSignal("");
  const [progress,setProgress] = createSignal("");
  const [error,setError] = createSignal("");
  const [result,setResult] = createSignal(null);
  const [saved,setSaved] = createSignal("");
  const [templates,setTemplates] = createSignal(getTemplates(props.mode));
  const [notice,setNotice] = createSignal("");
  let nextId = 0, previewId, feedback;
  function busy(name) { setPhase(name); props.onBusy?.(!!name); }
  function reset() { setError(""); setSaved(""); setResult(null); setNotice(""); }
  function find(id) { return sources().find(s => s.id === id); }
  function patch(id,values) { reset(); setSources(list => list.map(s => s.id === id ? {...s,...values} : s)); }
  function start(action,data) { setError(""); setProgress(""); busy(action); command("research:" + action,data); }
  function pick(directory) { start("pick",{single:split,directory}); }
  function readRange(id,values) {
    patch(id,{...values,verified:false});
    const s = find(id);
    if (!valid(s)) { setError("表头行必须在明细之前，起止行须在工作表范围内。"); return; }
    previewId = id;
    start("preview",{sources:[sourceRequest(s)]});
  }
  function newSource(book,tab,history) {
    return {id:++nextId, path:book.path, sheets:book.sheets,snapshot:book.snapshot,history,skipTotals:true,template:"",...configure(tab)};
  }
  function addBooks(books) {
    reset();
    let list = split ? [] : [...sources()];
    for (const book of books) {
      const tabs = book.sheets;
      if (!tabs.length) { setError(filename(book.path) + " 没有可读取的工作表。"); continue; }
      const chosen = tabs.find(t => !t.hidden && t.columns.length) ?? tabs[0];
      const previous = list.filter(s => s.path.toLowerCase() === book.path.toLowerCase());
      if (previous.length) {
        list = list.map(s => previous.includes(s) ? newSource(book,tabs.find(t => t.name === s.sheet) ?? chosen,s.history) : s);
      } else {
        const label = filename(book.path) + " " + chosen.name;
        const history = /历史|已报销/.test(label) ? true : /本期|本月|待查/.test(label) ? false : list.some(s => !s.history);
        list.push(newSource(book,chosen,!split && history));
      }
    }
    setSources(list);
  }
  function updateRange(msg) {
    const s = find(previewId);
    if (!s) return;
    const tab = msg.books.find(b => b.path === s.path)?.sheets.find(t => t.name === s.sheet);
    if (!tab?.columns.length) { setError("指定的表头行没有列名，请调整行号。"); return; }
    const sameColumns = JSON.stringify(s.tab.columns) === JSON.stringify(tab.columns);
    patch(s.id,{...(sameColumns ? {tab} : configure(tab)),...range(s),end:s.end,verified:true});
  }
  onCleanup(onNativeMessage((name,raw) => {
    if (!phase() || (name !== "research:progress" && name !== "research:result")) return;
    const msg = JSON.parse(raw);
    if (name === "research:progress") {
      setProgress((msg.source || "") + (msg.rows ? " · " + msg.rows.toLocaleString() + " 行" : "")); return;
    }
    const previous = phase(); busy("");
    if (msg.error) { setError(msg.error); return; }
    if (msg.type === "books") { if (previous === "preview") updateRange(msg); else addBooks(msg.books); }
    if (msg.type === "preview" || msg.type === "done") {
      setResult(msg); setSaved(msg.path || "");
      requestAnimationFrame(() => feedback?.scrollIntoView({block:"nearest"}));
    }
    if (msg.type === "cancelled") setNotice("已取消本次处理。");
  }));
  function run(preview) {
    reset();
    start(props.mode + (preview ? "-preview" : ""),{sources:sources().map(sourceRequest)});
  }
  const ready = createMemo(() => sources().length > 0 && sources().every(s =>
    valid(s) && s.verified && (split ? s.group != null && s.columns.length > 0 : s.invoice != null)) &&
    (split || sources().some(s => !s.history)));
  function saveTemplate(s) {
    const name = s.template.trim();
    if (!name) { setError("请先填写模板名。"); return; }
    const lookup = i => s.tab.columns.find(c => c.index === i)?.name;
    const layout = Object.fromEntries(fieldNames.map(key => [key,lookup(s[key]) ?? null]));
    if (split) layout.columns = s.columns.map(lookup);
    layout.skip = Number(s.first) - Number(s.header);
    layout.skipTotals = s.skipTotals;
    const entries = [...templates().filter(([key]) => key !== name),[name,layout]];
    try { localStorage.setItem(templateKey(props.mode),JSON.stringify(Object.fromEntries(entries))); }
    catch { setError("本机无法保存模板，请检查应用存储空间。"); return; }
    setTemplates(entries); setError(""); setNotice("已保存模板「" + name + "」。");
  }
  function applyTemplate(s) {
    const layout = templates().find(([k]) => k === s.template.trim())?.[1];
    if (!layout) { setError("未找到该名称的模板。"); return; }
    try {
      function index(name) {
        if (name == null) return null;
        const matches = s.tab.columns.filter(c => c.name === name);
        if (matches.length !== 1) throw Error("当前表中「" + name + "」缺失或重名，请重新选择对应列。");
        return matches[0].index;
      }
      const selected = Object.fromEntries(fieldNames.map(k => [k,index(layout[k])]));
      if (split) selected.columns = layout.columns.map(index);
      selected.skipTotals = layout.skipTotals !== false;
      const first = Number(s.header) + layout.skip;
      if (first !== Number(s.first)) readRange(s.id,{...selected,first}); else patch(s.id,selected);
    } catch (e) {setError(e.message);}
  }
  const phaseTitle = () => ({pick:"选择工作簿并识别表头",preview:"读取表头和样例",split:"正在拆分并封装工作簿",
    invoices:"正在生成复核清单","split-preview":"正在统计各组明细","invoices-preview":"正在比对发票号码",cancel:"正在取消"})[phase()];
  return <section class="ft-section rt-section">
    <div class="ft-heading"><h2>{split ? "拆分来源" : "本期与历史台账"}</h2>
      <Show when={sources().length}><SourcePicker disabled={!!phase()} onPick={pick}>{split ? "更换工作簿" : "添加工作簿"}</SourcePicker></Show>
    </div>
    <Show when={sources().length} fallback={<div class="ft-empty">
      <strong>{split ? "选择一张需要按组分发的明细表" : "选择本期待查和历史已报销台账"}</strong>
      <p>{split ? "每组生成独立 XLSX，附各组行数和可选金额清单，一次保存为 ZIP。" : "可从一张本期表开始，也可添加多个历史工作簿。票号及代码会保留文本前导零。"}</p>
      <SourcePicker primary disabled={!!phase()} onPick={pick}>选择工作簿</SourcePicker>
    </div>}>
      <fieldset disabled={!!phase()}>
        <For each={sources().map(s => s.id)}>{id => {
          const s = () => find(id);
          const otherTabs = () => s().sheets.filter(t => !sources().some(x => x.path === s().path && x.sheet === t.name));
          const options = () => s().tab.columns;
          return <article class="ft-source rt-source">
            <header><strong title={s().path}>{filename(s().path)}</strong><div class="ft-actions">
              <Show when={s().snapshot}><span>使用选入时已保存的版本</span></Show>
              <Show when={!split && otherTabs().length}><button type="button" onClick={() => {
                reset(); setSources([...sources(),newSource(s(),otherTabs()[0],s().history)]);
              }}>添加同簿工作表</button></Show>
              <button type="button" onClick={() => { reset(); setSources(sources().filter(x => x.id !== id)); }}>移除</button>
            </div></header>
            <div class="ft-fields">
              <Show when={!split}><label>用途<select aria-label="用途" value={s().history ? "history" : "current"}
                onChange={e => patch(id,{history:e.currentTarget.value === "history"})}>
                <option value="current" selected={!s().history}>本期待查</option><option value="history" selected={s().history}>历史已报销</option>
              </select></label></Show>
              <label>工作表<select aria-label="工作表" value={s().sheet} onChange={e => patch(id,configure(s().sheets.find(t => t.name === e.currentTarget.value)))}>
                <For each={s().sheets}>{t => <option value={t.name} selected={s().sheet === t.name}
                  disabled={sources().some(x => x.id !== id && x.path === s().path && x.sheet === t.name)}>{t.name}</option>}</For>
              </select></label>
              <label>表头行<input type="number" min="1" max={lastRow-1} value={s().header} onChange={e => {
                const header = e.currentTarget.value;
                readRange(id,{header,first:Math.max(Number(header)+1,s().first)});
              }} /></label>
              <label>明细起行<input type="number" min={Number(s().header)+1} max={lastRow} value={s().first}
                onChange={e => readRange(id,{first:e.currentTarget.value})} /></label>
              <label>明细末行<input type="number" min={Number(s().first)} max={lastRow} value={s().end} placeholder="至表尾"
                onChange={e => readRange(id,{end:e.currentTarget.value})} /></label>
              <For each={fieldNames}>{key => <label>{fields[key][0]}<select aria-label={fields[key][0]} value={String(s()[key] ?? "")}
                onChange={e => patch(id,{[key]:e.currentTarget.value === "" ? null : Number(e.currentTarget.value)})}>
                <option value="" selected={s()[key] == null}>{key === "invoice" || key === "group" ? "请选择" : "不使用"}</option>
                <For each={options()}>{c => <option value={c.index} selected={s()[key] === c.index}>{c.name}</option>}</For>
              </select></label>}</For>
            </div>
            <label class="rt-skip"><input type="checkbox" checked={s().skipTotals}
              onChange={e => patch(id,{skipTotals:e.currentTarget.checked})} />跳过小计和合计行
              <span>按行首非空单元格中的完整汇总标签识别</span></label>
            <Show when={split}><details class="ft-mapping"><summary>导出字段（{s().columns.length} / {options().length}）</summary>
              <div class="rt-column-list"><For each={options()}>{c => <label><input type="checkbox" checked={s().columns.includes(c.index)}
                onChange={e => patch(id,{columns:e.currentTarget.checked ? [...s().columns,c.index].sort((a,b) => a-b) :
                  s().columns.filter(i => i !== c.index)})} />{c.name}</label>}</For></div>
            </details></Show>
            <details class="ft-mapping"><summary>保存或套用列设置</summary>
              <div class="rt-template"><label>模板名<input type="text" list={"rt-templates-" + props.mode + id} value={s().template}
                placeholder="例如 华东月结" onInput={e => patch(id,{template:e.currentTarget.value})} /></label>
                <datalist id={"rt-templates-" + props.mode + id}><For each={templates()}>{entry => <option value={entry[0]} />}</For></datalist>
                <button type="button" onClick={() => saveTemplate(s())}>保存列设置</button>
                <button type="button" disabled={!templates().some(([k]) => k === s().template.trim())} onClick={() => applyTemplate(s())}>套用模板</button>
              </div>
            </details>
            <Show when={s().verified}><details class="ft-mapping rt-samples" open><summary>来源表头与明细样例</summary>
              <DataPreview headers={options().map(c => c.name)} rows={s().tab.samples} label="来源样例" />
            </details></Show>
            <Show when={!s().verified && !phase()}><p class="ft-error">请调整表头行或明细范围，直至显示样例。</p></Show>
          </article>;
        }}</For>
        <p>{split ? "空分组会单独输出。可设置明细末行排除原表合计行。" :
          "选择报销单号后，同一张来源表里同一报销单的多行费用只算一次。同号异代码分别核查；缺少代码的同号记录会提示复核。"}</p>
        <Show when={!split && sources().length && sources().every(s => s.history)}><p class="ft-error">请将至少一张台账设为本期待查。</p></Show>
        <div class="ft-run"><button type="button" class="ft-primary" disabled={!ready()} onClick={() => run(true)}>预览结果</button>
          <button type="button" disabled={!ready()} onClick={() => run(false)}>{split ? "导出拆分 ZIP" : "导出复核 XLSX"}</button></div>
      </fieldset>
    </Show>
    <Show when={phase()}><TaskProgress label={phaseTitle()} detail={progress()} />
      <Show when={phase() !== "cancel"}><button type="button" onClick={() => {
        busy("cancel"); command("research:cancel");
      }}>取消处理</button></Show>
    </Show>
    <Show when={result()}>{r => <section class="ft-result" ref={feedback}><div class="ft-heading"><h2>{split ? "拆分清单" : "复核清单"}</h2></div>
      <Show when={saved()}><SavedOutput path={saved()}>已保存至</SavedOutput></Show>
      <p role="status">{r().summary} 用时 {(r().milliseconds/1000).toFixed(2)} 秒。</p>
      <DataPreview headers={r().headers} rows={r().samples} label={split ? "拆分清单样例" : "发票复核样例"} />
      <p>{r().samples.length ? "预览最多显示前 20 条。" : "本次没有需要复核的记录。"}</p>
    </section>}</Show>
    <Show when={error()}><p role="alert" class="ft-error">{error()}</p></Show>
    <Show when={notice()}><p role="status">{notice()}</p></Show>
  </section>;
}
export default function ResearchTools(props) {
  return <Show when={researchModes.some(m => m.id === props.mode) && props.mode} keyed>{mode =>
    <ResearchWorkspace mode={mode} onBusy={props.onBusy} />
  }</Show>;
}
