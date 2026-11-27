// Run after scripts/build.ps1. Exercise the worker shipped with the desktop app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { utils, write, read } from "../build/home/node_modules/xlsx/xlsx.mjs";

const exe = resolve("dist/ExcelUtils/HeaderMerge.exe");
const dir = mkdtempSync(resolve("build/header-merge-test-"));
function worker(mode, request) {
  const child = spawnSync(exe,[mode],{ input:JSON.stringify(request),encoding:"utf8",windowsHide:true });
  if (child.error) throw child.error;
  return { code:child.status, message:JSON.parse(child.stdout.trim().split("\n").at(-1)) };
}
function book(name, tabs, epoch = false) {
  const wb = utils.book_new();
  for (const [tab, sheet] of tabs) utils.book_append_sheet(wb,sheet,tab);
  wb.Workbook = {WBProps:{date1904:epoch}};
  const path = join(dir,name+".xlsx");
  writeFileSync(path,write(wb,{type:"buffer",bookSST:true}));
  return path;
}
const source = (path, sheet, header=1) => ({path,sheet,header,first:header+1,end:1048576});

test("align shuffled columns across workbooks and tabs, preserve money, dates and cached values", () => {
  const one = utils.aoa_to_sheet([[" 流水号 ","金额","日期"],["0001",1.23,46000]]);
  one.C2.z = "yyyy-mm-dd"; one.B2.z = "#,##0.00";
  const two = utils.aoa_to_sheet([["说明"],["日期","流水号","金额"],[46001,"0002",0],[],[46002,"0003",-7]]);
  two.A3.z = two.A5.z = "yyyy-mm-dd"; two.C3.f = "1-1";
  const three = utils.aoa_to_sheet([["金额","日期","流水号"],[-1.25,46003-1462,"0004"]]);
  three.B2.z = "yyyy-mm-dd"; three.A2.z = "0.000";
  const a = book("一", [["甲",one],["乙",two]]), b = book("二", [["丙",three]],true);
  const catalog = worker("catalog",{paths:[a,b]});
  assert.deepEqual(catalog.message.books.map(x=>x.sheets.map(s=>s.name)),[["甲","乙"],["丙"]]);
  const [firstSheet, secondSheet] = catalog.message.books[0].sheets;
  assert.deepEqual(firstSheet.preview.columns, ["流水号","金额","日期"]);
  assert.deepEqual(firstSheet.preview.rows[0].values, ["0001","1.23","2025-12-09"]);
  assert.equal(secondSheet.preview.header, 2);
  assert.deepEqual(secondSheet.preview.columns, ["日期","流水号","金额"]);
  const adjusted = worker("preview", {sources:[{...source(a, "乙", 2), first:5, end:5}]});
  assert.equal(adjusted.message.type,"preview");
  assert.deepEqual(adjusted.message.books[0].sheets[0].preview.rows, [{number:5, values:["2025-12-11","0003","-7"]}]);
  const output = join(dir,"已合并.xlsx");
  const r = worker("merge",{sources:[source(a,"甲"),source(a,"乙",2),source(b,"丙")],output});
  assert.equal(r.code,0,JSON.stringify(r.message));
  assert.equal(r.message.rows,4);
  const sheet = read(readFileSync(output),{type:"buffer",cellNF:true}).Sheets["合并结果"];
  const values = Array.from({length:5}, (_,r) => [0,1,2].map(c => sheet[utils.encode_cell({r,c})].v));
  assert.deepEqual(values,[
    ["流水号","金额","日期"],["0001",1.23,46000],["0002",0,46001],["0003",-7,46002],["0004",-1.25,46003],
  ]);
  assert.equal(sheet.B3.f,undefined);
  assert.equal(sheet.B5.z,"0.000");
  assert.equal(sheet.C5.z,"yyyy-mm-dd");
});

test("preview a manually selected deep header from the registered saved snapshot", () => {
  const sheet = utils.aoa_to_sheet([["摘要"]]);
  utils.sheet_add_aoa(sheet,[["发票号", "金额"],["00000042", 92]], {origin: "A105"});
  const snapshot = book("副本", [["账簿",sheet]]);
  const path = join(dir, "在编辑器中打开.xlsx");
  const r = worker("preview", {sources:[source(path, "账簿", 105)], readPaths:{[path]:snapshot}});
  assert.equal(r.code, 0);
  const original = r.message.books[0];
  assert.equal(original.path, path);
  assert.equal(original.snapshot, true);
  assert.deepEqual(original.sheets[0].preview.rows, [{number:106, values:["00000042", "92"]}]);
});

test("report incompatible and ambiguous headers and discard partial output", () => {
  const tabs = [
    ["首表",[["编号","金额"],["0001",2]]], ["缺列",[["编号","税款"]]],
    ["重名",[["编号"," 编号 "]]], ["无列头",[["编号","金额"],["0002",3,4]]],
  ].map(([name,rows])=>[name,utils.aoa_to_sheet(rows)]);
  const formula = utils.aoa_to_sheet([["编号","金额"],["0003",1]]);
  formula.B2 = {t:"n",f:"1+1"};
  tabs.push(["缺公式值",formula]);
  const path = book("异常",tabs);
  for (const [tab,pattern] of [["缺列",/缺少「金额」.*多出「税款」/],["重名",/重复列名/],
    ["无列头",/第 2 行第 3 列/],["缺公式值",/B2 缺少公式缓存/]]) {
    const output = join(dir,tab+".xlsx");
    const r = worker("merge",{sources:[source(path,"首表"),source(path,tab)],output});
    assert.equal(r.code,1);
    assert.match(r.message.error,pattern);
    assert.equal(existsSync(output),false);
  }
});
