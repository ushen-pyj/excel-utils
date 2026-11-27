import { columnsAt, configureSheet, display, readBook, run, unnamedColumns, writeResult } from "./workbooks.mjs";

// Keep full workbooks and computed results off the UI thread. Only table samples cross back.
const books = new Map();
let result;

function resultChart(mode, report) {
  if (mode !== "summary" && mode !== "variance") return report.chart;
  const summary = mode === "summary", items = [];
  const count = report.rows.length - (summary ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const row = report.rows[i], amount = row[summary ? 2 : 4];
    if (items.length === 5 && Math.abs(amount.v) <= Math.abs(items[4].value)) continue;
    items.push({name: summary ? row[0] : row[0] + " · " + row[1], value:amount.v, text:display(amount)});
    items.sort((a,b) => Math.abs(b.value) - Math.abs(a.value));
    if (items.length > 5) items.pop();
  }
  return {title:summary ? "分组金额 · 按绝对值显示前五项（元）" : "预算差额 · 按绝对值显示前五项（元）", items};
}

function sample(sheet, header, first, end) {
  const columns = columnsAt(sheet, header);
  let lo = 0, hi = sheet.rows.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sheet.rows[mid][0] < Number(first)) lo = mid + 1;
    else hi = mid;
  }
  const rows = [];
  for (const [row, cells] of sheet.rows.slice(lo, lo + 4)) {
    if (row > Number(end)) break;
    rows.push([row, ...columns.map(c => display(cells[c.index]))]);
  }
  return {columns, rows, unnamed:unnamedColumns(sheet.rows, columns, Number(first), Number(end))};
}

function previewRow(row) {
  return Array.from(row, cell => cell && typeof cell === "object" ? display(cell) : cell ?? "");
}

function statusPreviews(rows) {
  const groups = new Map();
  for (const row of rows) {
    const status = row[0];
    if (!groups.has(status)) groups.set(status, {status, count:0, rows:[]});
    const group = groups.get(status);
    group.count++;
    if (group.rows.length < 20) group.rows.push(previewRow(row));
  }
  return [...groups.values()];
}

function handle(m) {
  if (m.action === "read") {
    const sheets = readBook(m.bytes);
    if (!sheets.length) throw Error("工作簿中没有工作表。");
    books.set(m.path, sheets);
    return sheets.map(s => {
      const config = configureSheet(s);
      return {name: s.name, config, view: sample(s, config.header, config.first, config.end)};
    });
  }
  if (m.action === "remove") { books.delete(m.path); return; }
  if (m.action === "clear") { result = undefined; return; }
  if (m.action === "sample") {
    const sheet = books.get(m.path)?.find(s => s.name === m.sheet);
    if (!sheet) throw Error("来源已移除，请重新添加工作簿。");
    const view = sample(sheet, m.header, m.first, m.end);
    return {view, config: m.reconfigure ? configureSheet(sheet, m.header) : undefined};
  }
  if (m.action === "run") {
    result = undefined;
    const sources = m.sources.map(s => ({...s, sheets: books.get(s.path)}));
    result = run(m.mode, sources, m.options);
    return {headers: result.headers, summary: result.summary, chart: resultChart(m.mode, result), count: result.rows.length,
      rows: result.rows.slice(0, 20).map(previewRow),
      groups: m.mode === "compare" ? statusPreviews(result.rows) : undefined};
  }
  if (m.action === "export" && result) return writeResult(m.title, result);
  throw Error("请重新生成结果预览。");
}

self.onmessage = ({data}) => {
  try { self.postMessage({id: data.id, value: handle(data)}); }
  catch (e) { self.postMessage({id: data.id, error: e.message || String(e)}); }
};
