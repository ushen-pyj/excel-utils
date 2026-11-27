// Run after scripts/build.ps1 to exercise the staged module and its locked XLSX library.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configureSheet, readBook, run, writeResult } from "../build/home/src/finance/workbooks.mjs";
import { applyTemplate, makeTemplate } from "../build/home/src/finance/columnTemplates.mjs";
import { utils, write } from "../build/home/node_modules/xlsx/xlsx.mjs";

function source(name, matrix) {
  const rows = matrix.map((row, i) => [i + 1, row.map(v => ({ t: typeof v === "number" ? "n" : "s", v }))]);
  const tab = { name: "明细", rows };
  return { name, path: name, sheets: [tab], ...configureSheet(tab) };
}

test("align different headers and preserve identifiers in the exported workbook", () => {
  const a = source("一.xlsx", [["三月明细"], ["编号", "净额"], ["0007", -1], ["合计", -1]]);
  const b = source("二.xlsx", [["实付", "参考号"], [2, "0008"]]);
  b.aliases = { 0: "净额", 1: "编号" };
  const merged = run("merge", [a, b]);
  const [saved] = readBook(Buffer.from(writeResult("合并", merged), "base64"));
  assert.deepEqual(saved.rows.map(([, cells]) => cells.map(c => c.v)), [
    ["编号", "净额", "来源工作簿", "来源工作表", "来源行号"],
    ["0007", -1, "一.xlsx", "明细", 3], ["0008", 2, "二.xlsx", "明细", 2],
  ]);
  assert.throws(() => run("merge", [a, a]), /范围重叠/);
  assert.throws(() => run("merge", [{ ...a, aliases: { 0: "编号", 1: "编号" } }]), /两列映射/);
});

test("count zero, parse signed amounts and reject invalid amounts at their source address", () => {
  const s = source("费用.xlsx", [["部门", "金额"], ["甲", "￥1,001.10"], ["甲", "(1.05)"], ["甲", 0], ["乙", -0.05]]);
  const result = run("summary", [s]);
  assert.deepEqual(result.rows.map(([key, n, c]) => [key, n, c.v]), [
    ["甲", 3, 1000.05], ["乙", 1, -0.05], ["合计", 4, 1000],
  ]);
  for (const bad of ["", "1,00", "1.001", "待确认"]) {
    const invalid = source("费用.xlsx", [["部门", "金额"], ["甲", bad]]);
    assert.throws(() => run("summary", [invalid]), /费用.xlsx · 明细!B2/);
  }
});

test("merge requires a decision for unnamed populated columns anywhere in the selected range", () => {
  const s = source("费用.xlsx", [["部门", "", "金额"], ["甲", "", 100], ["乙", "合同-42", 30]]);
  assert.throws(() => run("merge", [s]), /明细!B1/);
  assert.equal(run("merge", [{...s, end:2}]).headers.includes("合同号"), false);
  const named = run("merge", [{...s, unnamedAliases:{1:"合同号"}}]);
  const [out] = readBook(Buffer.from(writeResult("明细", named), "base64"));
  assert.deepEqual(out.rows[0][1].slice(0,3).map(c => c.v), ["部门","合同号","金额"]);
  assert.equal(out.rows[2][1][1].v, "合同-42");
  const skipped = run("merge", [{...s, unnamedAliases:{1:""}}]);
  assert.deepEqual(skipped.headers.slice(0,3), ["部门","金额","来源工作簿"]);
});

test("comparison status samples include differences beyond row 20 and export retains all rows", async () => {
  let reply;
  const worker = {postMessage(message) { reply = message; }};
  globalThis.self = worker;
  try {
    await import("../build/home/src/finance/financeWorker.mjs");
    function request(action, payload) {
      worker.onmessage({data:{id:1, action, ...payload}});
      assert.equal(reply.error, undefined);
      return reply.value;
    }
    const sources = ["左.xlsx", "右.xlsx"].map((path, side) => {
      const rows = Array.from({length:21}, (_, i) => [String(i+1), side && i === 20 ? 90 : 100]);
      const book = utils.book_new();
      utils.book_append_sheet(book, utils.aoa_to_sheet([["编号","金额"], ...rows]), "明细");
      const [sheet] = request("read", {path,bytes:write(book,{type:"buffer",bookType:"xlsx"})});
      return {path, name:path, ...sheet.config};
    });
    const preview = request("run", {mode:"compare", sources});
    assert.equal(preview.rows.length, 20);
    const diff = preview.groups.find(g => g.status === "金额差异");
    assert.equal(diff.count, 1);
    assert.deepEqual(diff.rows[0].slice(1,5), ["21","100.00","90.00","10.00"]);
    const [out] = readBook(Buffer.from(request("export", {title:"核对结果"}), "base64"));
    assert.equal(out.rows.length, 22);
    const swapped = request("run", {mode:"compare", sources:sources.reverse()});
    assert.equal(swapped.groups.find(g => g.status === "金额差异").rows[0][4], "(10.00)");
  } finally { delete globalThis.self; }
});

test("do not pair duplicate or empty keys, include both sides and the signed difference", () => {
  const left = source("台账.xlsx", [["编号", "金额"], ["001", 10.1], ["002", 5], ["002", 5], ["003", 0], ["", 1]]);
  const right = source("流水.xlsx", [["编号", "金额"], ["001", 10.11], ["002", 10], ["004", -2]]);
  const result = run("compare", [left, right]);
  const by = label => result.rows.filter(row => row[0] === label);
  assert.equal(by("重复待核").length, 3);
  assert.equal(by("金额差异")[0][4].v, -0.01);
  assert.equal(by("仅左表")[0][1], "003");
  assert.equal(by("仅右表")[0][1], "004");
  assert.equal(by("缺少核对键")[0][5], "台账.xlsx · 明细!6");
});

test("use independent ranges and columns for two tabs of one workbook", () => {
  const a = source("月结.xlsx", [["参考号", "实付金额"], ["单位", "元"], ["009", 0.1 + 0.2]]);
  const b = source("月结.xlsx", [["银行明细"], ["发生额", "流水号"], [0.3, "009"], [12, "010"]]);
  const bank = { ...b.sheets[0], name: "流水" };
  const sheets = [a.sheets[0], bank];
  const result = run("compare", [{ ...a, sheets, first: 3 }, { ...b, sheets, sheet: "流水", amount: "0", end: 3 }]);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].slice(0, 2), ["相符", "009"]);
  assert.equal(result.rows[0][4].v, 0);
});

test("one-to-many reconciliation requires an explicit settlement key and keeps every source row", () => {
  const left = source("银行", [["单号","金额"],["A",1000],["B",70]]);
  const right = source("台账", [["单号","金额"],["A",600],["A",400],["B",50],["B",15]]);
  const r = run("compare", [left,right], {groupPayments:true});
  assert.equal(r.rows.filter(row => row[0] === "组合明细").length, 6);
  assert.equal(r.rows.find(row => row[0] === "组合金额相符（待核）")[4].v, 0);
  assert.equal(r.rows.find(row => row[0] === "组合金额差异")[4].v, 5);
});

test("unpivot includes zero, keeps blank identifiers unless filled, and preserves source row", () => {
  const s = source("预算", [["项目","1月","2月"],["甲",0,12],["",8,""]]);
  const result = run("unpivot", [s]);
  assert.deepEqual(result.rows.map(r=>[r[0]?.v,r[1],r[2].v,r[3]]), [["甲","1月",0,2],["甲","2月",12,2],["","1月",8,3]]);
  const sparse = s.sheets[0].rows[2][1];
  delete sparse[0];
  assert.equal(run("unpivot", [{ ...s,fillDown:true }]).rows[2][0].v, "甲");
});

test("historical balances include only activity on or before cutoff, with unassigned receipts separate", () => {
  const inv = source("账单", [["单据号","客户","单据日期","到期日","金额"],["0001","客户甲","2026-09-01","2026-10-01",100],["2","客户乙","2026-11-01","2026-11-02",70]]);
  const pay = source("回款", [["单据号","核销日期","金额"],["0001","2026-10-31",40],["0001","2026-11-03",60],["X","2026-10-22",12]]);
  const r = run("aging",[inv,pay],{cutoff:"2026-10-31"});
  assert.deepEqual([r.rows[0][0],r.rows[0][1],r.rows[0][7].v,r.rows[0][8]],["1–30 天","0001",60,30]);
  assert.equal(r.rows[1][0],"核销待认领");
  assert.equal(r.rows.length,2);
  assert.throws(()=>run("aging",[inv,pay],{cutoff:"2026-02-31"}),/截止日/);
});

test("variance consolidates projects and normalizes months before comparing to budget", () => {
  const budget = source("预算", [["期间","项目","金额"],["2026-01","差旅",100],["2026年1月","差旅",50]]);
  const actual = source("实际", [["期间","项目","金额"],["2026/1/14","差旅",180],["202601","通讯",30]]);
  const r = run("variance",[budget,actual]);
  const t = r.rows.find(r => r[1] === "差旅");
  assert.deepEqual([t[0],t[2].v,t[3].v,t[4].v,t[5].w,t[7]],["2026-01",150,180,30,"20.00%",2]);
  assert.equal(r.rows.find(r => r[1] === "通讯")[6],"无预算有发生");
  for (const amounts of [[0], [50, -50]]) {
    const zero = source("预算", [["期间","项目","金额"],...amounts.map(n => ["2026-01","差旅",n])]);
    const row = run("variance", [zero,actual]).rows.find(r => r[1] === "差旅");
    assert.deepEqual([row[5],row[6],row[7]], [undefined,"预算合计为零",amounts.length]);
  }
});

test("column templates rebind by name after reordering and reject missing columns", () => {
  const columns = ["编号","金额"].map((name,index)=>({name,index}));
  const s = {view:{columns}, key:"0", amount:"1"};
  const t = makeTemplate(s,"compare",0);
  const reversed = {view:{columns:[{name:"金额",index:0},{name:"编号",index:2}]}};
  assert.deepEqual(applyTemplate(t,reversed,"compare"), {key:"2",amount:"0"});
  assert.throws(()=>applyTemplate(t,{view:{columns:[]}},"compare"),/编号/);
});

test("worker-side XML validation preserves a formula whose saved numeric result is zero", () => {
  const wb = utils.book_new(), sheet = utils.aoa_to_sheet([["部门","金额"],["甲",0]]);
  sheet.B2.f = "1-1";
  utils.book_append_sheet(wb,sheet,"校验");
  const [tab] = readBook(write(wb,{type:"buffer",bookType:"xlsx"}));
  const zero = tab.rows[1][1][1];
  assert.equal(zero.v,0);
  assert.equal(zero.missing,false);
  sheet.B2 = {t:"n",f:"1-1"};
  const [uncached] = readBook(write(wb,{type:"buffer",bookType:"xlsx"}));
  assert.equal(uncached.rows[1][1][1].missing,true);
});
