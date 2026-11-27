import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CFB, read, utils, write } from "../build/home/node_modules/xlsx/xlsx.mjs";

const exe = resolve(process.env.EXCEL_UTILS_RESEARCH_EXE || "dist/ExcelUtils/ResearchTools.exe");
const dir = mkdtempSync(resolve("build/research-test-"));
function call(mode, params) {
  const child = spawnSync(exe,["research-" + mode],{input:JSON.stringify(params),encoding:"utf8",windowsHide:true});
  if (child.error) throw child.error;
  return JSON.parse(child.stdout.trim().split("\n").at(-1));
}
function book(name,rows,format) {
  const book = utils.book_new(), sheet = utils.aoa_to_sheet(rows);
  format?.(sheet);
  utils.book_append_sheet(book,sheet,"流水");
  const path = join(dir,name + ".xlsx");
  writeFileSync(path,write(book,{type:"buffer",bookSST:true}));
  return path;
}
function values(bytes) {
  const wb = read(bytes,{type:"buffer"});
  return utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null});
}
const source = (path,header=1) => ({path,sheet:"流水",header,first:header+1,end:1048576});

test("catalog identifies a title above a shared-string header and honors changed row ranges", () => {
  const path = book("拆分预览",[["支出汇总"],["部门","金额"],["采购",5],["客服",6]]);
  const tab = call("catalog",{paths:[path]}).books[0].sheets[0];
  assert.equal(tab.header,2);
  assert.deepEqual(tab.columns.map(x => x.name),["部门","金额"]);
  assert.deepEqual(tab.samples,[["采购","5"],["客服","6"]]);
  const request = {sources:[{...source(path,2),first:4}]};
  assert.deepEqual(call("preview",request).books[0].sheets[0].samples,[["客服","6"]]);
});

test("split writes separate workbooks, handles filename collisions and untitled groups, and reconciles counts and amounts", () => {
  const path = book("按部门",[["部门","金额","内部备注","单据号"],
    ["A/B",5,"仅本组","0001"],["A:B",10,"另一组","0002"],["A/B",-1.25,"保密","0003"],[null,0,"待分配","0004"]]);
  const request = {sources:[{...source(path),group:0,columns:[0,1,3],amount:1}]};
  const preview = call("split-preview",request);
  assert.equal(preview.type,"preview");
  assert.deepEqual(preview.samples,[["A/B","A_B.xlsx","2","3.75"],["A:B","A_B (2).xlsx","1","10.00"],["（未填写）","未填写.xlsx","1","0.00"]]);
  const output = join(dir,"全部.zip"), saved = call("split",{...request,output});
  assert.equal(saved.type,"done",saved.error);
  const zip = CFB.read(readFileSync(output),{type:"buffer"});
  const workbooks = zip.FileIndex.filter(x => x.type === 2 && x.name.endsWith(".xlsx"));
  assert.equal(workbooks.length,4);
  const data = workbooks.map(f => values(f.content));
  assert.ok(data.some(rows => rows[0][0] === "分组" && rows.length === 4));
  assert.deepEqual(data.find(rows => rows[1]?.[0] === "A/B" && rows[0][0] === "部门"),[
    ["部门","金额","单据号"],["A/B",5,"0001"],["A/B",-1.25,"0003"]]);
  assert.equal(data.flat(2).includes("内部备注"),false);
  assert.match(call("split-preview",{sources:[{...request.sources[0],expected:{"0":"新列名"}}]}).error,/列已变化/);
});

test("invoice report identifies historical, current and missing IDs while suppressing claim lines and separate invoice codes", () => {
  const current = book("本期",[["票号","单号","代码"],["001","A",""],["001","A",""],["002","B","X"],
    ["003","C","Y"],["003","D","Y"],[null,"E",""],["004","F","Y"],["005","G","Z"]]);
  const history = book("历史",[["发票代码","发票号码","报销单号"],["X","002","H"],["X","004","J"],["","005","K"],["","不要列入","L"]]);
  const sources = [{...source(current),invoice:0,claim:1,code:2},{...source(history),invoice:1,claim:2,code:0,history:true}];
  const output = join(dir,"查重结果.xlsx");
  const preview = call("invoices-preview",{sources}), saved = call("invoices",{sources,output});
  assert.equal(saved.type,"done",saved.error);
  assert.equal(saved.rows,7);
  assert.deepEqual(preview.samples,saved.samples);
  const rows = values(readFileSync(output));
  assert.equal(rows.filter(r => r[0] === "历史台账已有").length,2);
  assert.equal(rows.filter(r => r[0] === "本期重复待核").length,2);
  assert.equal(rows.filter(r => r[0] === "同号，代码不全待核").length,2);
  assert.deepEqual(rows.find(r => r[0] === "缺少发票号码").slice(-3),["本期.xlsx","流水",7]);
  assert.equal(rows.some(r => r[1] === "001" || r[1] === "004"),false);
});

test("numeric identifiers preserve explicit zero masks and unsafe long numeric IDs are reported with location", () => {
  const path = book("格式化票号",[["发票号","报销单"],[12,"A"],["000012","B"]],s => {s.A2.z = "000000";});
  const msg = call("invoices-preview",{sources:[{...source(path),invoice:0,claim:1}]});
  assert.equal(msg.rows,2);
  assert.deepEqual(msg.samples.map(r => r[1]),["000012","000012"]);
  const bad = book("超长数字",[["发票号","报销单"],[1234567890123456,"A"]]);
  assert.match(call("invoices-preview",{sources:[{...source(bad),invoice:0}]}).error,/第 2 行.*精度/);
});

test("skip labeled total rows by default in both tools while preserving genuine blank groups", () => {
  const path = book("带合计的费用",[["单据号","部门","金额","发票号"],["BX1","财务",30,"0001"],
    ["BX2",null,-2,"0002"],[" 小计： ",null,28,null],["合计",null,28,null]]);
  const s = {...source(path),group:1,amount:2,columns:[0,1,2],invoice:3};
  const split = call("split-preview",{sources:[s]});
  assert.match(split.summary,/2 行明细.*28.00.*1 行归入未填写组.*已跳过 2 行/);
  assert.equal(split.samples.length,2);
  assert.match(call("split-preview",{sources:[{...s,skipTotals:false}]}).summary,/4 行明细.*84.00/);
  assert.match(call("invoices-preview",{sources:[s]}).summary,/本期 2 行.*0 行缺少票号.*已跳过 2 行/);
  assert.match(call("invoices-preview",{sources:[{...s,skipTotals:false}]}).summary,/本期 4 行.*2 行缺少票号/);
});
