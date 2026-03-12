"use client";

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import { baseTableInput, columnOptions, currency, describeRule, effectiveDelimiter, inferredTableFromTextarea, irrRequest, loanRequest, normalizeColumnIndex, npvRequest, selectedSheetName, signatureFor, tableToText } from "../shared/utils";
import { BatchProcessResult, BatchRule, CleanResult, ExportResult, IrrResult, LoanResult, MetricEntry, NpvResult, PrintResult, RuleChainItem, StatusTone, ViewKey, WorkbookInfo } from "../shared/types";

export function useExcelWorkbench() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [status, setStatus] = useState<{ message: string; tone: StatusTone }>({ message: "准备就绪，可以先打开工作簿或直接粘贴表格数据。", tone: "info" });
  const [tableRaw, setTableRaw] = useState("姓名\t部门\t地区\n张三 \t销售\t华东\n张三\t销售\t华东\n李四\t财务\t");
  const [tableDelimiter, setTableDelimiter] = useState("tab");
  const [hasHeader, setHasHeader] = useState(true);
  const [sheetLimit, setSheetLimit] = useState("200");
  const [workbookInfo, setWorkbookInfo] = useState<WorkbookInfo | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [currentTable, setCurrentTable] = useState<CleanResult | null>(null);
  const [financeResult, setFinanceResult] = useState<CleanResult | null>(null);
  const [printResult, setPrintResult] = useState<PrintResult | null>(null);
  const [latestCsv, setLatestCsv] = useState("");
  const [syncedSignature, setSyncedSignature] = useState("");
  const [ruleType, setRuleType] = useState("trim");
  const [ruleFill, setRuleFill] = useState("N/A");
  const [ruleDecimals, setRuleDecimals] = useState("2");
  const [ruleColumnIndex, setRuleColumnIndex] = useState("0");
  const [dedupeColumnIndex, setDedupeColumnIndex] = useState("__all__");
  const [splitColumnIndex, setSplitColumnIndex] = useState("0");
  const [splitDelimiter, setSplitDelimiter] = useState("-");
  const [mergeDelimiter, setMergeDelimiter] = useState("-");
  const [mergeName, setMergeName] = useState("合并结果");
  const [mergeSelection, setMergeSelection] = useState<number[]>([]);
  const [ruleChain, setRuleChain] = useState<RuleChainItem[]>([]);
  const [batchFiles, setBatchFiles] = useState<string[]>([]);
  const [batchOutputDir, setBatchOutputDir] = useState("");
  const [batchResult, setBatchResult] = useState<BatchProcessResult | null>(null);
  const [loanPrincipal, setLoanPrincipal] = useState("500000");
  const [loanRate, setLoanRate] = useState("3.2");
  const [loanYears, setLoanYears] = useState("20");
  const [loanPayments, setLoanPayments] = useState("12");
  const [loanMetrics, setLoanMetrics] = useState<MetricEntry[]>([]);
  const [npvRate, setNpvRate] = useState("8");
  const [npvInvestment, setNpvInvestment] = useState("100000");
  const [npvCashflows, setNpvCashflows] = useState("30000,32000,36000,38000,42000");
  const [npvMetrics, setNpvMetrics] = useState<MetricEntry[]>([]);
  const [irrCashflows, setIrrCashflows] = useState("-100000,30000,32000,36000,38000,42000");
  const [irrGuess, setIrrGuess] = useState("10");
  const [irrMetrics, setIrrMetrics] = useState<MetricEntry[]>([]);
  const [printTitle, setPrintTitle] = useState("Excel 工具箱打印预览");

  const sourceTable = currentTable ?? inferredTableFromTextarea(tableRaw, tableDelimiter, hasHeader);
  const columns = sourceTable?.columns ?? [];
  const selectedColumnName = columns.length > 0 ? columns[Number(ruleColumnIndex || "0")] ?? columns[0] ?? "" : "";
  const effectiveRules = useMemo<BatchRule[]>(() => ruleChain.length > 0 ? ruleChain.map(({ id: _id, ...rule }) => rule) : [{ ruleType, fillValue: ruleFill, decimals: Number(ruleDecimals) }], [ruleChain, ruleType, ruleFill, ruleDecimals]);

  const stats = [
    { label: "工作表", value: workbookInfo?.sheets.length ? `${workbookInfo.sheets.length}` : "--" },
    { label: "规则链", value: `${effectiveRules.length} 步` },
    { label: "批量文件", value: `${batchFiles.length} 个` },
    { label: "当前列", value: selectedColumnName || "未绑定" }
  ];

  const dashboardCards = [
    { key: "workbook" as ViewKey, title: "工作簿导入", desc: "连接本地 Excel / CSV，切换工作表并拉到清洗流程。", metric: workbookInfo?.fileName ?? "尚未导入" },
    { key: "cleaning" as ViewKey, title: "数据清洗", desc: "围绕列规则搭建稳定的数据清洗工作流。", metric: currentTable ? `${currentTable.rows.length} 行数据已载入` : "等待载入数据" },
    { key: "batch" as ViewKey, title: "批量处理", desc: "把当前规则链应用到多文件，统一输出格式。", metric: batchResult ? `最近处理 ${batchResult.processed} 个文件` : "尚未运行" },
    { key: "finance" as ViewKey, title: "财务建模", desc: "快速生成摊还表、敏感性分析与投资指标。", metric: financeResult ? `${financeResult.rows.length} 行分析结果` : "等待生成结果" }
  ];

  function setAppStatus(message: string, tone: StatusTone = "info") {
    setStatus({ message, tone });
  }

  function syncControlsFromResult(result: CleanResult) {
    const nextColumns = result.columns;
    if (nextColumns.length === 0) {
      setRuleColumnIndex("0");
      setDedupeColumnIndex("__all__");
      setSplitColumnIndex("0");
      setMergeSelection([]);
      return;
    }
    setRuleColumnIndex((prev) => normalizeColumnIndex(prev, nextColumns.length));
    setDedupeColumnIndex((prev) => (prev === "__all__" ? "__all__" : normalizeColumnIndex(prev, nextColumns.length)));
    setSplitColumnIndex((prev) => normalizeColumnIndex(prev, nextColumns.length));
    setMergeSelection((prev) => {
      const safe = prev.filter((value) => value >= 0 && value < nextColumns.length);
      return safe.length > 0 ? safe : nextColumns.slice(0, Math.min(2, nextColumns.length)).map((_, index) => index);
    });
  }

  function applyCleanResult(result: CleanResult, syncTextarea: boolean) {
    setCurrentTable(result);
    setLatestCsv(result.csv);
    if (syncTextarea) {
      const nextRaw = tableToText(result.columns, result.rows);
      setTableRaw(nextRaw);
      setSyncedSignature(signatureFor(nextRaw, "\t", true));
    } else {
      setSyncedSignature(signatureFor(tableRaw, effectiveDelimiter(tableDelimiter), hasHeader));
    }
    syncControlsFromResult(result);
  }

  async function ensureCurrentTable(): Promise<CleanResult> {
    const signature = signatureFor(tableRaw, effectiveDelimiter(tableDelimiter), hasHeader);
    if (!currentTable || syncedSignature !== signature) {
      const result = await invoke<CleanResult>("preview_input_table", { input: baseTableInput(tableRaw, tableDelimiter, hasHeader) });
      setCurrentTable(result);
      setLatestCsv(result.csv);
      setSyncedSignature(signature);
      syncControlsFromResult(result);
      return result;
    }
    return currentTable;
  }

  function handleError(error: unknown) {
    setAppStatus(error instanceof Error ? error.message : String(error), "error");
  }

  async function openWorkbook() {
    try {
      const selected = await open({ multiple: false, directory: false, filters: [{ name: "Spreadsheet", extensions: ["xlsx", "xlsm", "xls", "csv"] }] });
      if (!selected || Array.isArray(selected)) return;
      const info = await invoke<WorkbookInfo>("inspect_workbook", { path: selected });
      setWorkbookInfo(info);
      setSelectedSheet(info.sheets[0]?.name ?? "");
      setActiveView("workbook");
      setAppStatus(`已打开 ${info.fileName}，现在可以载入工作表。`, "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function loadSheet() {
    try {
      if (!workbookInfo) return setAppStatus("请先打开工作簿。", "warning");
      const result = await invoke<CleanResult>("load_sheet_table", { path: workbookInfo.path, sheetName: selectedSheet, hasHeader, limit: Number(sheetLimit) });
      applyCleanResult(result, true);
      setActiveView("cleaning");
      setAppStatus(`已载入工作表 ${selectedSheet}。`, "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function refreshPreview() {
    try {
      const result = await invoke<CleanResult>("preview_input_table", { input: baseTableInput(tableRaw, tableDelimiter, hasHeader) });
      applyCleanResult(result, false);
      setAppStatus("已根据当前文本刷新预览。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function runColumnRule() {
    try {
      const result = await invokeRule(baseTableInput(tableRaw, tableDelimiter, hasHeader), Number(ruleColumnIndex), { ruleType, fillValue: ruleFill, decimals: Number(ruleDecimals) });
      applyCleanResult(result, true);
      setAppStatus("列规则已应用。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function runRuleChain() {
    try {
      const result = await invokeRuleChain(baseTableInput(tableRaw, tableDelimiter, hasHeader), Number(ruleColumnIndex), effectiveRules);
      applyCleanResult(result, true);
      setAppStatus(`规则链已应用，共 ${effectiveRules.length} 步。`, "success");
    } catch (error) {
      handleError(error);
    }
  }

  function addRuleToChain() {
    setRuleChain((prev) => [...prev, { id: crypto.randomUUID(), ruleType, fillValue: ruleFill, decimals: Number(ruleDecimals) }]);
    setAppStatus(`已加入规则链：${describeRule({ ruleType, fillValue: ruleFill, decimals: Number(ruleDecimals) })}。`, "success");
  }

  async function dedupeRows() {
    try {
      const columnIndex = dedupeColumnIndex === "__all__" ? null : Number(dedupeColumnIndex);
      const result = await invoke<CleanResult>("dedupe_rows", { input: baseTableInput(tableRaw, tableDelimiter, hasHeader), columnIndex });
      applyCleanResult(result, true);
      setAppStatus("重复值处理完成。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function splitColumn() {
    try {
      const result = await invoke<CleanResult>("split_column", { input: baseTableInput(tableRaw, tableDelimiter, hasHeader), columnIndex: Number(splitColumnIndex), splitBy: splitDelimiter });
      applyCleanResult(result, true);
      setAppStatus("分列完成。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function mergeColumns() {
    try {
      const result = await invoke<CleanResult>("merge_columns", { input: baseTableInput(tableRaw, tableDelimiter, hasHeader), columnIndices: mergeSelection, joinWith: mergeDelimiter, newColumnName: mergeName });
      applyCleanResult(result, true);
      setAppStatus("合并列完成。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function copyCsv() {
    if (!latestCsv) return setAppStatus("当前没有可复制的结果。", "warning");
    await navigator.clipboard.writeText(latestCsv);
    setAppStatus("已复制 CSV 到剪贴板。", "success");
  }

  async function exportCurrentTable(format: "xlsx" | "csv") {
    try {
      const table = await ensureCurrentTable();
      const chosen = await save({ defaultPath: format === "xlsx" ? "excel-utils-output.xlsx" : "excel-utils-output.csv", filters: [{ name: format.toUpperCase(), extensions: [format] }] });
      if (!chosen) return;
      const result = await invoke<ExportResult>("export_table", { path: chosen, format, sheetName: selectedSheetName(selectedSheet), columns: table.columns, rows: table.rows });
      setAppStatus(`已导出到 ${result.path}。`, "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function pickBatchFiles() {
    try {
      const selected = await open({ multiple: true, directory: false, filters: [{ name: "Spreadsheet", extensions: ["xlsx", "xlsm", "xls", "csv"] }] });
      if (!selected || !Array.isArray(selected)) return;
      setBatchFiles(selected);
      setAppStatus(`已选择 ${selected.length} 个批量文件。`, "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function pickBatchOutputDir() {
    try {
      const selected = await open({ multiple: false, directory: true });
      if (!selected || Array.isArray(selected)) return;
      setBatchOutputDir(selected);
      setAppStatus("已选择批量输出目录。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function runBatch() {
    try {
      if (batchFiles.length === 0) return setAppStatus("请先选择批量文件。", "warning");
      if (!batchOutputDir) return setAppStatus("请先选择输出目录。", "warning");
      if (!selectedColumnName) return setAppStatus("请先载入数据，让系统知道要匹配的列名。", "warning");
      const result = await invoke<BatchProcessResult>("batch_apply_column_rule", { paths: batchFiles, outputDir: batchOutputDir, columnName: selectedColumnName, rules: effectiveRules, hasHeader });
      setBatchResult(result);
      setActiveView("batch");
      setAppStatus(`批量处理完成，成功 ${result.processed} 个，失败 ${result.failed} 个。`, result.failed > 0 ? "warning" : "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function calculateLoan() {
    try {
      const result = await invoke<LoanResult>("loan_payment", { request: loanRequest(loanPrincipal, loanRate, loanYears, loanPayments) });
      setLoanMetrics([["每期还款", currency(result.payment)], ["总还款", currency(result.totalPayment)], ["总利息", currency(result.totalInterest)]]);
      setAppStatus("月供计算完成。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function generateSchedule() {
    try {
      const result = await invoke<CleanResult>("loan_amortization_schedule", { request: loanRequest(loanPrincipal, loanRate, loanYears, loanPayments) });
      setFinanceResult(result);
      setActiveView("finance");
      setAppStatus("已生成贷款摊还表。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function calculateNpv() {
    try {
      const result = await invoke<NpvResult>("net_present_value", { request: npvRequest(npvRate, npvInvestment, npvCashflows) });
      setNpvMetrics([["NPV", currency(result.npv)]]);
      setAppStatus("净现值计算完成。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function generateSensitivity() {
    try {
      const result = await invoke<CleanResult>("npv_sensitivity_table", npvRequest(npvRate, npvInvestment, npvCashflows));
      setFinanceResult(result);
      setActiveView("finance");
      setAppStatus("已生成净现值敏感性分析表。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function calculateIrr() {
    try {
      const result = await invoke<IrrResult>("internal_rate_of_return", { request: irrRequest(irrCashflows, irrGuess) });
      setIrrMetrics([["IRR", `${result.irrPct.toFixed(2)}%`], ["迭代次数", String(result.iterations)]]);
      setAppStatus("IRR 计算完成。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  function useFinanceTable() {
    if (!financeResult) return setAppStatus("请先生成财务结果表。", "warning");
    applyCleanResult(financeResult, true);
    setActiveView("cleaning");
    setAppStatus("财务结果表已载入清洗区。", "success");
  }

  async function previewPrint() {
    try {
      const result = await invoke<PrintResult>("build_printable_report", { input: baseTableInput(tableRaw, tableDelimiter, hasHeader), title: printTitle });
      setPrintResult(result);
      setActiveView("print");
      setAppStatus("打印预览已生成。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function printNow() {
    try {
      const result = await invoke<PrintResult>("build_printable_report", { input: baseTableInput(tableRaw, tableDelimiter, hasHeader), title: printTitle });
      setPrintResult(result);
      window.print();
      setAppStatus("已发送打印请求。", "success");
    } catch (error) {
      handleError(error);
    }
  }

  function toggleMergeColumn(index: number) {
    setMergeSelection((prev) => prev.includes(index) ? prev.filter((value) => value !== index) : [...prev, index].sort((a, b) => a - b));
  }

  function updateRuleChain(action: "clear" | "remove" | "up" | "down", id?: string) {
    setRuleChain((prev) => {
      if (action === "clear") return [];
      if (!id) return prev;
      if (action === "remove") return prev.filter((item) => item.id !== id);
      const index = prev.findIndex((item) => item.id === id);
      if (index < 0) return prev;
      const targetIndex = action === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  return {
    activeView, setActiveView, status,
    tableRaw, setTableRaw, tableDelimiter, setTableDelimiter, hasHeader, setHasHeader, sheetLimit, setSheetLimit,
    workbookInfo, selectedSheet, setSelectedSheet, currentTable, financeResult, printResult,
    latestCsv, ruleType, setRuleType, ruleFill, setRuleFill, ruleDecimals, setRuleDecimals,
    ruleColumnIndex, setRuleColumnIndex, dedupeColumnIndex, setDedupeColumnIndex, splitColumnIndex, setSplitColumnIndex,
    splitDelimiter, setSplitDelimiter, mergeDelimiter, setMergeDelimiter, mergeName, setMergeName,
    mergeSelection, ruleChain, batchFiles, batchOutputDir, batchResult,
    loanPrincipal, setLoanPrincipal, loanRate, setLoanRate, loanYears, setLoanYears, loanPayments, setLoanPayments, loanMetrics,
    npvRate, setNpvRate, npvInvestment, setNpvInvestment, npvCashflows, setNpvCashflows, npvMetrics,
    irrCashflows, setIrrCashflows, irrGuess, setIrrGuess, irrMetrics,
    printTitle, setPrintTitle, columns, sourceTable, selectedColumnName, effectiveRules, stats, dashboardCards,
    openWorkbook, loadSheet, refreshPreview, runColumnRule, runRuleChain, addRuleToChain, dedupeRows, splitColumn, mergeColumns,
    copyCsv, exportCurrentTable, pickBatchFiles, pickBatchOutputDir, runBatch, calculateLoan, generateSchedule, calculateNpv,
    generateSensitivity, calculateIrr, useFinanceTable, previewPrint, printNow, toggleMergeColumn, updateRuleChain
  };
}

async function invokeRule(input: { raw: string; delimiter: string; hasHeader: boolean }, columnIndex: number, rule: BatchRule): Promise<CleanResult> {
  if (rule.ruleType === "trim") return invoke<CleanResult>("trim_cells", { input, columnIndex });
  if (rule.ruleType === "uppercase" || rule.ruleType === "lowercase") return invoke<CleanResult>("change_case", { input, columnIndex, mode: rule.ruleType });
  if (rule.ruleType === "fill-empty") return invoke<CleanResult>("fill_empty_cells", { input, columnIndex, fillValue: rule.fillValue });
  return invoke<CleanResult>("format_numeric_column", { input, columnIndex, decimals: rule.decimals });
}

async function invokeRuleChain(input: { raw: string; delimiter: string; hasHeader: boolean }, columnIndex: number, rules: BatchRule[]): Promise<CleanResult> {
  let currentInput = input;
  let lastResult: CleanResult | null = null;
  for (const rule of rules) {
    lastResult = await invokeRule(currentInput, columnIndex, rule);
    currentInput = { raw: tableToText(lastResult.columns, lastResult.rows), delimiter: "\t", hasHeader: true };
  }
  if (!lastResult) throw new Error("请先配置至少一个规则");
  return { ...lastResult, summary: [`规则链已执行 ${rules.length} 步`, ...rules.map((rule, index) => `${index + 1}. ${describeRule(rule)}`), ...lastResult.summary] };
}