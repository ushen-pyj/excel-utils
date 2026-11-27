import { read, write, utils, SSF } from "xlsx";
import { SaxesParser } from "saxes";
import { display } from "./toolModes.mjs";
import { analyze } from "./ledgerReports.mjs";
import { sourceHeaderStyles, styleResult } from "./headerStyles.mjs";
export { modes, display } from "./toolModes.mjs";
export const letter = utils.encode_col;
const populated = c => c && (c.f || c.F || (c.v != null && c.v !== ""));
const moneyFormat = '#,##0.00;[Red](#,##0.00);0.00';

// SheetJS supplies zero for some numeric formulas without a cached value.
// Inspect the XML for the actual cache and the workbook-local style references.
function inspectSheet(book, sheetIndex, rows, candidates) {
  const main = book.Directory.workbooks[0];
  const base = new URL(main, "https://xlsx.local/");
  const part = url => {
    const bytes = book.files[decodeURIComponent(url.pathname.slice(1))]?.content;
    if (!bytes) throw Error("无法读取公式缓存，请重新保存工作簿。");
    return new TextDecoder().decode(bytes);
  };
  const relations = new SaxesParser({ xmlns: true });
  let target;
  relations.on("opentag", node => {
    if (node.local === "Relationship" && node.attributes.Id?.value === book.Workbook.Sheets[sheetIndex].id)
      target = node.attributes.Target?.value;
  });
  relations.write(part(new URL("_rels/" + main.split("/").pop() + ".rels", base))).close();
  if (!target) throw Error("找不到公式所在的工作表。");
  const parser = new SaxesParser({ xmlns: true });
  let cell, inValue = false, cached = false;
  const columnStyles = [];
  let rowStyle, row = 0, col = -1;
  parser.on("opentag", node => {
    const attr = node.attributes;
    if (node.local === "col" && attr.style) {
      for (let i = Math.max(0,Number(attr.min.value)-1); i < Math.min(16384,Number(attr.max.value)); i++)
        columnStyles[i] = Number(attr.style.value);
    }
    if (node.local === "row") { row = Number(attr.r?.value ?? row+1); col = -1; rowStyle = attr.s?.value; }
    if (node.local === "c") {
      const address = attr.r?.value;
      col = address ? utils.decode_cell(address).c : col+1;
      const id = Number(attr.s?.value ?? rowStyle ?? columnStyles[col] ?? 0);
      const value = rows.get(row)?.[col];
      if (id && value) value.styleId = id;
      cell = candidates.get(address); cached = false;
    }
    if (node.local === "v") inValue = true;
  });
  const checkValue = value => { if (inValue && value.length) cached = true; };
  parser.on("text", checkValue);
  parser.on("cdata", checkValue);
  parser.on("closetag", node => {
    if (node.local === "v") inValue = false;
    if (node.local === "c" && cell) { if (!cached) cell.missing = true; cell = undefined; }
  });
  parser.write(part(new URL(target, base))).close();
}

export function readBook(bytes) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw Error("请选择可直接打开的 .xlsx 工作簿。");
  const book = read(bytes, { type: "array", cellNF: true, cellHTML: false, sheetStubs: true, bookFiles: true });
  const headerStyle = sourceHeaderStyles(book);
  return book.SheetNames.map((name, index) => {
    const rows = new Map(), ambiguous = new Map();
    for (const [address, original] of Object.entries(book.Sheets[name])) {
      if (address.startsWith("!") || !populated(original)) continue;
      const { r, c } = utils.decode_cell(address);
      if (!rows.has(r + 1)) rows.set(r + 1, []);
      const cell = { t: original.t, v: original.v, z: original.z, w: original.w };
      if (original.f || original.F) {
        cell.missing = original.t === "z" || original.v == null;
        if (original.v === 0 || original.v === "") ambiguous.set(address, cell);
      }
      // Result workbooks use the 1900 epoch. Keep the displayed date when combining Mac workbooks.
      if (book.Workbook?.WBProps?.date1904 && cell.t === "n" && SSF.is_date(cell.z ?? "General") &&
          /[yd]/i.test(cell.z.replace(/"[^"]*"|\\./g, ""))) cell.v += 1462;
      rows.get(r + 1)[c] = cell;
    }
    inspectSheet(book, index, rows, ambiguous);
    return { name, headerStyle, rows: [...rows].sort(([a], [b]) => a - b) };
  });
}

export function columnsAt(sheet, row) {
  const cells = sheet.rows.find(([n]) => n === Number(row))?.[1] ?? [];
  const columns = [];
  cells.forEach((cell, index) => {
    const name = display(cell).trim();
    if (name) columns.push({ index, name, letter: letter(index) });
  });
  return columns;
}

export function unnamedColumns(rows, columns, first, end) {
  const named = new Set(columns.map(c => c.index));
  const missing = new Map();
  let prefix = 0;
  while (named.has(prefix)) ++prefix;
  for (const [n, cells] of rows) {
    if (n > end) break;
    if (n < first || cells.length <= prefix) continue;
    cells.forEach((cell, index) => {
      if (!named.has(index) && !missing.has(index) && (populated(cell) || cell?.missing))
        missing.set(index, {index, letter:letter(index), example:display(cell), row:n});
    });
  }
  return [...missing.values()].sort((a, b) => a.index - b.index);
}

export function configureSheet(sheet, header) {
  const rows = sheet.rows;
  const firstTableRow = rows.find(([, cells]) => cells.filter(c => c.t === "s").length >= 2);
  const start = header ?? firstTableRow?.[0] ?? rows[0]?.[0] ?? 1;
  let end = rows.at(-1)?.[0] ?? start;
  for (let i = rows.length - 1; i > 0; --i) {
    if (!/^(合计|总计|小计)$/.test(display(rows[i][1].find(Boolean)).trim())) break;
    end = rows[i - 1][0];
  }
  const columns = columnsAt(sheet, start);
  const guess = pattern => String(columns.find(c => pattern.test(c.name))?.index ?? "");
  return {
    sheet: sheet.name, header: start, first: Number(start) + 1, end, unnamedAliases:{}, aliases: Object.fromEntries(columns.map(c => [c.index, c.name])),
    group: guess(/部门|成本中心|科目|类别|分类|项目/), amount: guess(/金额|实付|实收/),
    key: guess(/单号|编号|单据号|参考号|流水号|凭证号|发票号/),
    party: guess(/往来单位|客户|供应商|单位名称/),
    date: guess(/核销日期|单据日期|入账日期|收款日期|开票日期|发生日期|^日期$/),
    due: guess(/到期/), period: guess(/期间|月份|年月/),
    spread: columns.filter(c => /^(?:(?:19|20)\d{2}[-年/.])?(?:0?[1-9]|1[0-2])月?$/.test(c.name)).map(c => String(c.index)),
  };
}

export function readSource(s, mode) {
  const sheet = s.sheets.find(x => x.name === s.sheet);
  const header = Number(s.header), first = Number(s.first), end = Number(s.end);
  const columns = columnsAt(sheet, header);
  const headerCells = sheet.rows.find(([n]) => n === header)?.[1];
  for (const c of columns) c.style = sheet.headerStyle?.(headerCells[c.index].styleId ?? 0) ?? {};
  if (!columns.length && mode !== "merge") throw Error(s.name + " · " + s.sheet + " 的表头行没有列名。");
  if (!Number.isInteger(first) || first <= header || !Number.isInteger(end) || end < first || end > 1048576)
    throw Error(s.name + " 的明细范围无效，请检查表头之后的起止行。");
  const rows = sheet.rows.filter(([n]) => n >= first && n <= end);
  if (!rows.length) throw Error(s.name + " · " + s.sheet + " 所选范围没有明细。");
  return { ...s, columns, rows };
}

function valueAt(s, n, cells, index) {
  const cell = cells[index];
  if (cell?.missing || cell?.t === "e") {
    throw Error(s.name + " · " + s.sheet + "!" + letter(Number(index)) + n +
      (cell.missing ? " 缺少公式结果，请重新计算并保存来源工作簿。" : " 含有 Excel 错误值 " + display(cell) + "。"));
  }
  return cell;
}

function readCents(cell) {
  let raw = cell?.v;
  if (cell?.t === "n" && !SSF.is_date(cell.z ?? "General") && !cell.z?.includes("%")) raw = Number(raw.toPrecision(15)).toString();
  else if (cell?.t !== "s") return null;
  let str = raw.trim();
  if (/^\(.+\)$/.test(str)) str = "-" + str.slice(1, -1);
  const match = /^([+-]?)[¥￥]?((?:\d{1,3}(?:,\d{3})+|\d+))(?:\.(\d{1,2})0*)?$/.exec(str);
  if (!match) return null;
  const cents = BigInt(match[2].replaceAll(",", "")) * 100n + BigInt((match[3] || "").padEnd(2, "0"));
  return match[1] === "-" ? -cents : cents;
}

function monetary(cents) {
  if (cents > 999999999999999n || cents < -999999999999999n) throw Error("金额超出 Excel 可精确保存到分的范围。");
  const v = Number(cents) / 100;
  return { t: "n", v, z: moneyFormat, w: SSF.format(moneyFormat, v) };
}

function records(s, field) {
  for (const key of [field, "amount"]) {
    if (!s.columns.some(c => String(c.index) === String(s[key]))) throw Error(s.name + " 缺少" +
      ({group:"分组列", key:"核对键", amount:"金额列"})[key] + "，请在来源设置中选择。");
  }
  if (s[field] === s.amount) throw Error(s.name + " 的金额列与分组列或核对键须分别选择。");
  return s.rows.map(([n, cells]) => {
    const key = display(valueAt(s, n, cells, s[field])).trim();
    const cents = readCents(valueAt(s, n, cells, s.amount));
    if (cents === null) throw Error(s.name + " · " + s.sheet + "!" + letter(Number(s.amount)) + n +
      " 需要以元记录、精确到分的金额。请检查金额列和明细末行。");
    return { key, cents, n, source: s.label + " · " + s.sheet + "!" + n };
  });
}

function merge(sources) {
  const names = new Set(), mappings = [], styles = new Map();
  for (const s of sources) {
    const map = new Map();
    const unnamed = unnamedColumns(s.rows, s.columns, Number(s.first), Number(s.end));
    for (const c of unnamed) {
      if (!Object.hasOwn(s.unnamedAliases ?? {}, c.index))
        throw Error(s.name + " · " + s.sheet + "!" + c.letter + s.header + " 缺少表头，请填写输出列名或勾选跳过。");
    }
    [...s.columns, ...unnamed].sort((a,b) => a.index - b.index).forEach(c => {
      const target = (c.name ? s.aliases : s.unnamedAliases)[c.index]?.trim();
      if (!target) return;
      if (map.has(target)) throw Error(s.name + " 有两列映射到「" + target + "」，请分别命名或留空跳过。");
      map.set(target, c.index);
      names.add(target);
      if (!styles.has(target)) styles.set(target,c.style);
    });
    if (!map.size) throw Error(s.name + " 至少需要一个输出列名。");
    mappings.push(map);
  }
  const headers = [...names];
  for (let name of ["来源工作簿", "来源工作表", "来源行号"]) {
    while (headers.includes(name)) name += "（来源）";
    headers.push(name);
  }
  const rows = [];
  sources.forEach((s, i) => {
    for (const [n, cells] of s.rows) {
      const output = [...names].map(name => valueAt(s, n, cells, mappings[i].get(name)));
      rows.push([...output, s.label, s.sheet, n]);
    }
  });
  return { headers, headerStyles:headers.map(h => styles.get(h)), rows, summary: "已合并 " + sources.length + " 个来源，共 " + rows.length + " 行明细" };
}

function summarize(sources) {
  const groups = new Map();
  let count = 0, total = 0n;
  for (const s of sources) for (const r of records(s, "group")) {
    if (!r.key) throw Error(r.source + " 的分组值为空，请检查分组列和范围。");
    const g = groups.get(r.key) ?? { count: 0, sum: 0n };
    g.count++;
    g.sum += r.cents;
    groups.set(r.key, g);
    count++;
    total += r.cents;
  }
  const sum = monetary(total);
  const rows = [...groups].map(([name, g]) => [name, g.count, monetary(g.sum)]);
  rows.push(["合计", count, sum]);
  return { headers: ["分组", "笔数", "金额合计（元）"], rows,
    summary: count + " 笔明细，" + groups.size + " 组，合计 " + display(sum) + " 元" };
}

function compare(sources, options = {}) {
  const byKey = new Map(), rows = [], counts = new Map();
  function append(status, key, left, right) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
    rows.push([status, key, left && monetary(left.cents), right && monetary(right.cents),
      left && right ? monetary(left.cents - right.cents) : undefined, left?.source, right?.source]);
  }
  sources.forEach((s, side) => {
    for (const row of records(s, "key")) {
      if (!row.key) {
        append("缺少核对键", "", side === 0 ? row : null, side === 1 ? row : null);
        continue;
      }
      if (!byKey.has(row.key)) byKey.set(row.key, [[], []]);
      byKey.get(row.key)[side].push(row);
    }
  });
  for (const [key, [left, right]] of byKey) {
    if (left.length > 1 || right.length > 1) {
      if (options.groupPayments && left.length && right.length && (left.length === 1 || right.length === 1)) {
        const leftTotal = left.reduce((total, row) => total + row.cents, 0n);
        const rightTotal = right.reduce((total, row) => total + row.cents, 0n);
        const status = leftTotal === rightTotal ? "组合金额相符（待核）" : "组合金额差异";
        const detail = (group, side) => group.forEach(r => append("组合明细", key, side === 0 ? r : null, side === 1 ? r : null));
        append(status, key, {cents:leftTotal}, {cents:rightTotal});
        detail(left, 0); detail(right, 1);
        continue;
      }
      left.forEach(row => append("重复待核", key, row, null));
      right.forEach(row => append("重复待核", key, null, row));
    } else {
      const a = left[0], b = right[0];
      const status = !a ? "仅右表" : !b ? "仅左表" : a.cents === b.cents ? "相符" : "金额差异";
      append(status, key, a, b);
    }
  }
  return { headers: ["核对状态", "核对键", "左表金额", "右表金额", "差额（左−右）", "左表来源", "右表来源"], rows,
    chart: {title:"核对结果分布", items:[...counts].filter(([label]) => label !== "组合明细").map(([name, value]) => ({name,value,text:value + " 行"}))},
    summary: [...counts].map(([k, n]) => k + " " + n + " 行").join(" · ") };
}

export function run(mode, inputs, options = {}) {
  if (!inputs.length) throw Error("请先添加工作簿。");
  if (mode === "compare" && inputs.length !== 2) throw Error("两表对账需要两个来源，按列表顺序分别作为左表和右表。");
  const sources = inputs.map(s => readSource(s, mode));
  sources.forEach((s, i) => {
    s.label = sources.some(o => o.name === s.name && o.path !== s.path) ? s.path : s.name;
    if (sources.slice(0, i).some(o => o.path === s.path && o.sheet === s.sheet &&
      Number(o.first) <= Number(s.end) && Number(s.first) <= Number(o.end))) throw Error("同一工作表的明细范围重叠，请检查来源。");
  });
  const operation = {merge, summary:summarize, compare}[mode];
  const result = operation ? operation(sources, options) :
    analyze(mode, sources, options, {valueAt, readCents, monetary, SSF});
  if (result.rows.length >= 1048576 || result.headers.length > 16384) throw Error("结果超出单张 Excel 工作表的行列上限，请缩小范围。");
  return result;
}

export function writeResult(title, result) {
  const sheet = utils.aoa_to_sheet([result.headers]);
  // Only copy the selected values and formats. Source formulas can refer to other workbooks.
  for (let i = 0; i < result.rows.length; i++) {
    const values = result.rows[i].map(cell => cell && typeof cell === "object"
      ? { t: cell.t, v: cell.v, z: cell.z } : cell ?? undefined);
    utils.sheet_add_aoa(sheet, [values], { origin: { r: i + 1, c: 0 } });
  }
  sheet["!cols"] = result.headers.map((h, i) => ({ wch: Math.min(70, Math.max(14, h.length * 2 + 2,
    ...result.rows.slice(0, 25).map(row => (typeof row[i] === "object" ? display(row[i]) : String(row[i] ?? "")).replace(/[^\x00-\x7f]/g, "ww").length + 2))) }));
  sheet["!autofilter"] = { ref: sheet["!ref"] };
  const wb = utils.book_new();
  utils.book_append_sheet(wb, sheet, title);
  const bytes = write(wb, { type:"array", bookType:"xlsx" });
  return styleResult(bytes, result.headers.map((_,i) => result.headerStyles?.[i]));
}
