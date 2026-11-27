import { display, fieldsFor } from "./toolModes.mjs";

function utcDay(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

function dateText(cell, SSF, period = false) {
  if (cell?.t === "n" && SSF.is_date(cell.z ?? "")) {
    const d = SSF.parse_date_code(cell.v);
    return d && utcDay(d.y, d.m, d.d);
  }
  const text = display(cell).trim();
  const m = /^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?$/.exec(text);
  if (m) return utcDay(+m[1], +m[2], +m[3]);
  const ym = period && /^(\d{4})[-./年]?(\d{1,2})月?$/.exec(text);
  return ym ? utcDay(+ym[1], +ym[2], 1) : null;
}

function location(s, n) { return s.label + " · " + s.sheet + "!" + n; }

function entries(s, mode, side, api, visit) {
  const fields = fieldsFor(mode, side);
  const indices = new Set(s.columns.map(c => String(c.index)));
  for (const [field, label] of fields) {
    if (!indices.has(String(s[field]))) throw Error(s.name + " 请选择" + label + "。");
  }
  if (new Set(fields.map(([f]) => String(s[f]))).size !== fields.length)
    throw Error(s.name + " 的不同字段使用了同一列，请检查列设置。");
  for (const [n, cells] of s.rows) {
    const data = {};
    for (const [field, label] of fields) {
      const cell = api.valueAt(s, n, cells, s[field]);
      if (field === "amount") data[field] = api.readCents(cell);
      else if (["date", "due", "period"].includes(field))
        data[field] = dateText(cell, api.SSF, field === "period");
      else data[field] = display(cell).trim();
      if (data[field] == null || data[field] === "")
        throw Error(location(s, n) + " 的" + label + "无效，请检查列设置及该行的值。");
    }
    visit(data, n);
  }
}

function aging(sources, options, api) {
  if (sources.length !== 2) throw Error("请选择两个来源，依次为单据和逐笔核销明细。");
  const cutoff = dateText({v: options.cutoff}, api.SSF);
  if (!cutoff) throw Error("请选择有效的账龄截止日。");
  const invoices = new Map(), exceptions = [];
  entries(sources[0], "aging", 0, api, (r, n) => {
    if (r.date > cutoff) return;
    if (invoices.has(r.key)) throw Error(location(sources[0], n) + " 的单据号重复，需先按单据归集。");
    invoices.set(r.key, {...r, paid: 0n, source: location(sources[0], n)});
  });
  entries(sources[1], "aging", 1, api, (r, n) => {
    if (r.date > cutoff) return;
    const inv = invoices.get(r.key);
    if (inv) inv.paid += r.amount;
    else exceptions.push(["核销待认领", r.key, "", "", "", undefined, api.monetary(r.amount), undefined, undefined, location(sources[1], n)]);
  });
  const rows = [], buckets = new Map();
  let total = 0n;
  for (const inv of invoices.values()) {
    const balance = inv.amount - inv.paid;
    if (!balance) continue;
    total += balance;
    const overdue = Math.max(0, (Date.parse(cutoff) - Date.parse(inv.due)) / 86400000);
    const bucket = balance < 0n ? "贷方余额" : !overdue ? "未逾期" : overdue <= 30 ? "1–30 天" :
      overdue <= 60 ? "31–60 天" : overdue <= 90 ? "61–90 天" : "90 天以上";
    buckets.set(bucket,(buckets.get(bucket) ?? 0n) + balance);
    rows.push([bucket, inv.key, inv.party, inv.date, inv.due, api.monetary(inv.amount),
      api.monetary(inv.paid), api.monetary(balance), overdue, inv.source]);
  }
  const count = rows.length;
  for (const row of exceptions) rows.push(row);
  return {headers:["账龄区间","单据号","往来单位","单据日期","到期日","单据金额","截至当日已核销","未结余额","逾期天数","来源"],
    chart: {title:"各账龄区间未结余额（元）", items:["未逾期","1–30 天","31–60 天","61–90 天","90 天以上","贷方余额"]
      .filter(name => buckets.has(name)).map(name => {const sum = api.monetary(buckets.get(name)); return {name,value:sum.v,text:display(sum)};})},
    rows, summary: cutoff + " · " + count + " 笔未结，余额 " + display(api.monetary(total)) + " 元，" + exceptions.length + " 笔核销待认领"};
}

function variance(sources, api) {
  if (sources.length !== 2) throw Error("请选择两个来源，依次为预算明细和实际明细。");
  const groups = new Map();
  sources.forEach((s, side) => entries(s, "variance", side, api, (r) => {
    const period = r.period.slice(0, 7), key = JSON.stringify([period, r.group]);
    if (!groups.has(key)) groups.set(key, {period, name:r.group, amounts:[0n, 0n], counts:[0, 0]});
    const g = groups.get(key);
    g.amounts[side] += r.amount;
    ++g.counts[side];
  }));
  const rows = [];
  for (const {period, name, amounts:[budget, actual], counts} of groups.values()) {
    const delta = actual - budget;
    const ratio = budget === 0n ? undefined : {t:"n", v:Number(delta)/Number(budget), z:"0.00%", w:api.SSF.format("0.00%", Number(delta)/Number(budget))};
    rows.push([period, name, api.monetary(budget), api.monetary(actual), api.monetary(delta), ratio,
      !counts[0] ? "无预算有发生" : !counts[1] ? "无实际记录" : budget === 0n ? "预算合计为零" : "", ...counts]);
  }
  rows.sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1], "zh-CN"));
  return {headers:["期间","项目","预算金额","实际金额","差额（实际−预算）","差异率","说明","预算笔数","实际笔数"], rows,
    summary: rows.length + " 个期间及项目组合，差额按实际减预算计算"};
}

function unpivot(sources, api) {
  if (sources.length !== 1) throw Error("宽表转明细每次处理一张工作表。");
  const [s] = sources;
  const selected = new Set(s.spread);
  const keep = s.columns.filter(c => !selected.has(String(c.index)));
  const spread = s.columns.filter(c => selected.has(String(c.index)));
  if (!spread.length || !keep.length) throw Error("至少选择一列展开，并保留一列标识明细。");
  const headers = keep.map(c => c.name);
  for (const label of ["原列名","值","来源行号"]) {
    let name = label;
    while (headers.includes(name)) name += "（展开）";
    headers.push(name);
  }
  const rows = [], previous = [];
  for (const [n, cells] of s.rows) {
    const values = keep.map((c, i) => {
      const value = api.valueAt(s, n, cells, c.index);
      if (value) previous[i] = value;
      return s.fillDown ? previous[i] : value;
    });
    for (const c of spread) {
      const v = api.valueAt(s, n, cells, c.index);
      if (!v || v.v == null || v.v === "") continue;
      if (rows.length >= 1048575) throw Error("展开结果超过 Excel 单张工作表上限，请缩小明细范围。");
      rows.push([...values, c.name, v, n]);
    }
  }
  return {headers,headerStyles:keep.map(c => c.style),rows,summary:spread.length + " 列已展开，共 " + rows.length.toLocaleString() + " 行明细"};
}

export function analyze(mode, sources, options, api) {
  if (mode === "unpivot") return unpivot(sources, api);
  if (mode === "aging") return aging(sources, options, api);
  if (mode === "variance") return variance(sources, api);
  throw Error("未知的工具。");
}
