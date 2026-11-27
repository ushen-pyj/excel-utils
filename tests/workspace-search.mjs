import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { utils, write } from "../build/home/node_modules/xlsx/xlsx.mjs";

test("workspace index supports literal and regex search and tracks workbook changes", () => {
  const run = mkdtempSync(resolve("build/search-test-"));
  const root = join(run, "工作区"), nested = join(root, "明细"), cache = join(run, "cache");
  mkdirSync(nested, { recursive: true });
  const source = join(nested, "季度.xlsx");
  function workbook(path, text) {
    const book = utils.book_new();
    utils.book_append_sheet(book, utils.aoa_to_sheet([["首页"], ["  AB-12\tab-34\nAB-56  "]]), "概览");
    const values = Array.from({length: 105}, (_, i) => [i, text]);
    const sheet = utils.aoa_to_sheet(values);
    sheet.C5 = {t:"n", v:42, f:"SUM(40,2)"};
    sheet.D5 = {t:"n", v:0.25, z:"0%"};
    sheet["!ref"] = "A1:D105";
    utils.book_append_sheet(book, sheet, "成本'表");
    book.Workbook = {Sheets:[{Hidden:0}, {Hidden:1}]};
    writeFileSync(path, write(book, {type:"buffer", bookSST:true}));
  }
  function search(query, offset, regex) {
    return spawnSync(resolve("dist/ExcelUtils/WorkspaceIndex.exe"), [], {
      input:JSON.stringify({root, cache, query, offset, regex}), encoding:"utf8", windowsHide:true, timeout:10000
    });
  }
  function query(query = "", offset = 0, regex) {
    const job = search(query, offset, regex);
    assert.equal(job.status, 0, job.stderr + job.stdout);
    const result = JSON.parse(job.stdout.trim().split("\n").at(-1));
    assert.equal(result.type, "result");
    return result;
  }
  const text = "长".repeat(200) + "预算AbC";
  workbook(source, text);
  workbook(join(root, "~$锁.xlsx"), text);
  assert.equal(query().indexed, 1);
  const result = query("预算abc");
  assert.equal(result.indexed, 0);
  assert.equal(result.total, 105);
  assert.equal(result.matchedFiles, 1);
  assert.equal(result.groupCounts[source], 105);
  assert.equal(result.hits.length, 100);
  assert.equal(result.hits[0].address, "B1");
  assert.equal(result.hits[0].sheet, "成本'表");
  assert.equal(result.hits[0].hidden, true);
  assert.ok(result.hits[0].snippet.includes("预算AbC"));
  const tail = query("预算", 100);
  assert.equal(tail.hits.at(-1).address, "B105");
  assert.equal(tail.groupCounts[source], 105);
  assert.equal(query("sum(").hits[0].address, "C5");
  assert.equal(query("25%").hits[0].address, "D5");

  const pattern = "预算[a-z]{3}$";
  assert.equal(query(pattern).total, 0);
  const regexPage = query(pattern, 100, true);
  assert.equal(regexPage.indexed, 0);
  assert.equal(regexPage.total, 105);
  assert.equal(regexPage.groupCounts[source], 105);
  assert.equal(regexPage.hits[0].address, "B101");
  const regexHit = regexPage.hits[0];
  assert.deepEqual(regexHit.matches, [{start:31, length:5}]);
  assert.equal(regexHit.snippet.slice(31, 36), "预算AbC");
  assert.equal(query("(?-i:预算abc)$", 0, true).total, 0);
  assert.equal(query("^=sum\\(", 0, true).hits[0].address, "C5");
  assert.equal(query("^0\\.25$", 0, true).hits[0].address, "D5");
  assert.equal(query("^  AB-12\\t", 0, true).hits[0].address, "A2");
  assert.equal(query("^$", 0, true).total, 0);
  assert.deepEqual(query("(?=AB-12)", 0, true).hits[0].matches, []);
  const multiple = query("\\bab-\\d{2}\\b", 0, true).hits[0];
  assert.deepEqual(multiple.matches.map(({start, length}) => multiple.snippet.slice(start, start + length)),
    ["AB-12", "ab-34", "AB-56"]);

  for (const [pattern, message] of [["[", /正则表达式无效/], ["^(长+)+$", /正则表达式匹配超时/]]) {
    const job = search(pattern, 0, true);
    assert.equal(job.status, 1, job.error ?? job.stderr);
    const reply = JSON.parse(job.stdout.trim().split("\n").at(-1));
    assert.equal(reply.type, "error");
    assert.match(reply.message, message);
  }

  workbook(source, "已替换");
  assert.equal(query("预算").total, 0);
  const renamed = join(root, "改名.xlsx");
  renameSync(source, renamed);
  assert.equal(query("替换").hits[0].path, renamed);
  writeFileSync(join(root, "损坏.xlsx"), "invalid");
  assert.equal(query("替换").skipped, 1);
  rmSync(renamed);
  assert.equal(query("替换").total, 0);
});
