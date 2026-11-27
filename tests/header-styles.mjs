import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CFB, read, utils, write } from "../build/home/node_modules/xlsx/xlsx.mjs";
import { configureSheet, readBook, run, writeResult } from "../build/home/src/finance/workbooks.mjs";

const dir = mkdtempSync(resolve("build/header-style-test-"));
const rgb = cell => cell.s.fgColor.rgb;
function fixture(name, headers, colors) {
  const wb = utils.book_new();
  utils.book_append_sheet(wb,utils.aoa_to_sheet([["标题"],headers,["甲",2,3]]),"明细");
  const zip = CFB.read(write(wb,{type:"buffer"}),{type:"buffer"});
  function edit(path, transform) {
    const file = CFB.find(zip,path);
    CFB.utils.cfb_add(zip,path,Buffer.from(transform(file.content.toString())));
  }
  edit("/xl/styles.xml", data => data.replace(/<fills .*?<\/fills>/, fills =>
    fills.replace('count="2"','count="5"').replace("</fills>",colors.map(c =>
      '<fill><patternFill patternType="solid"><fgColor rgb="FF'+c+'"/></patternFill></fill>').join("")+"</fills>"))
    .replace(/<cellXfs .*?<\/cellXfs>/, xfs => xfs.replace('count="1"','count="4"').replace("</cellXfs>",
      colors.map((_,i) => '<xf numFmtId="0" fontId="0" borderId="0" fillId="'+(2+i)+'" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>').join("")+"</cellXfs>")));
  edit("/xl/worksheets/sheet1.xml", sheet => sheet.replace(/<c r="([ABC])2"/g,
    (tag,col) => tag+' s="'+(col.charCodeAt(0)-64)+'"'));
  const path = join(dir,name+".xlsx");
  writeFileSync(path,CFB.write(zip,{fileType:"zip",type:"buffer"}));
  return path;
}
function sheet(bytes) {
  const wb = read(bytes,{type:"buffer",cellStyles:true});
  return wb.Sheets[wb.SheetNames[0]];
}
function worker(exe,mode,sources,file) {
  const output = join(dir,file);
  const r = spawnSync(resolve("dist/ExcelUtils",exe),[mode],{windowsHide:true,encoding:"utf8",input:JSON.stringify({sources,output})});
  assert.equal(r.status,0,r.stdout || r.stderr);
  return readFileSync(output);
}
const colors = ["477D71","D6A500","793A8E"];
const first = fixture("原始",["部门","1月","2月"],colors);
const second = fixture("续表",["2月","部门","1月"],["556677","778899","AABBCC"]);
const source = path => ({path,sheet:"明细",header:2,first:3,end:3});
function finance(path) {
  const sheets = readBook(readFileSync(path));
  return {...source(path),name:path,sheets,...configureSheet(sheets[0],2)};
}
const headerColors = (tab,n) => Array.from({length:n},(_,i) => rgb(tab[utils.encode_col(i)+"1"]));
const generatedColor = "30557A";

test("same-header merge keeps each first-source fill after reordering the next source", () => {
  const tab = sheet(worker("HeaderMerge.exe","merge",[source(first),source(second)],"合并.xlsx"));
  assert.deepEqual(headerColors(tab,3),colors);
});
test("split retains the selected source styles in export order and styles the manifest", () => {
  const bytes = worker("ResearchTools.exe","research-split",[{...source(first),group:0,columns:[2,0]}],"拆分.zip");
  const zip = CFB.read(bytes,{type:"buffer"});
  const files = zip.FileIndex.filter(x => x.name.endsWith(".xlsx"));
  assert.equal(files.length,2);
  for (const file of files) {
    const tab = sheet(file.content);
    assert.deepEqual(headerColors(tab,2), tab.A1.v === "分组" ? ["30557A","30557A"] : [colors[2],colors[0]]);
  }
});
test("merge follows aliases, preserves new columns from later books, and styles generated fields", () => {
  const a = finance(first), b = finance(second);
  b.aliases[1] = "新增";
  const bytes = Buffer.from(writeResult("合并",run("merge",[a,b])),"base64");
  const zip = CFB.read(bytes,{type:"buffer"});
  assert.equal(new Set(zip.FullPaths).size,zip.FullPaths.length);
  assert.deepEqual(headerColors(sheet(bytes),7),[...colors,"778899","30557A","30557A","30557A"]);
});
test("unpivot keeps the identifying column style, and summary headers have a report style", () => {
  const input = finance(first);
  const exportMode = (mode,s) => sheet(Buffer.from(writeResult(mode,run(mode,[s])),"base64"));
  assert.deepEqual(headerColors(exportMode("unpivot",input),4),[colors[0],"30557A","30557A","30557A"]);
  assert.deepEqual(headerColors(exportMode("summary",{...input,group:"0",amount:"1"}),3),Array(3).fill("30557A"));
});

test("reconciliation, aging, budget variance and invoice reports style every generated header", () => {
  function input(name, rows) {
    const wb = utils.book_new();
    utils.book_append_sheet(wb,utils.aoa_to_sheet(rows),"明细");
    const path = join(dir,name+".xlsx");
    writeFileSync(path,write(wb,{type:"buffer"}));
    const sheets = readBook(readFileSync(path));
    return {name,path,sheets,...configureSheet(sheets[0])};
  }
  const invoice = input("账单",[["单据号","客户","单据日期","到期日","金额"],["007","甲","2026-10-01","2026-10-15",5]]);
  const payment = input("回款",[["单据号","核销日期","金额"],["007","2026-10-20",2]]);
  const budget = input("预算",[["期间","项目","金额"],["2026-10","甲",5]]);
  const actual = input("实际",[["期间","项目","金额"],["2026-10","甲",4]]);
  for (const [mode,inputs] of [["compare",[invoice,payment]],["aging",[invoice,payment]],["variance",[budget,actual]]]) {
    const r = run(mode,inputs,{cutoff:"2026-10-31"});
    const tab = sheet(Buffer.from(writeResult(mode,r),"base64"));
    assert.deepEqual(headerColors(tab,r.headers.length),Array(r.headers.length).fill(generatedColor));
  }
  const report = sheet(worker("ResearchTools.exe","research-invoices",[
    {path:invoice.path,sheet:invoice.sheet,header:1,first:2,end:2,invoice:0}
  ],"复核.xlsx"));
  assert.deepEqual(headerColors(report,8),Array(8).fill(generatedColor));
});
