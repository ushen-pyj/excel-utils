import { BatchRule, CleanResult, LoanRequest, MetricEntry, NpvRequest, IrrRequest, StatusTone } from "./types";

export const actionButton =
  "inline-flex items-center justify-center rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/70 disabled:cursor-not-allowed disabled:opacity-50";

export const ghostButton =
  "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-slate-100 transition hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50";

export const inputClass =
  "field-surface w-full rounded-2xl px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-amber-300/60 focus:bg-white/10";

export const cardClass = "glass-panel rounded-[28px] border border-white/10";

export function columnOptions(columns: string[]): Array<{ value: string; label: string }> {
  if (columns.length === 0) return [{ value: "0", label: "等待数据" }];
  return columns.map((column, index) => ({ value: String(index), label: column }));
}

export function baseTableInput(raw: string, delimiterValue: string, hasHeader: boolean) {
  return { raw, delimiter: effectiveDelimiter(delimiterValue), hasHeader };
}

export function effectiveDelimiter(value: string): string {
  return value === "tab" ? "\t" : value;
}

export function inferredTableFromTextarea(raw: string, delimiterValue: string, hasHeader: boolean): CleanResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;
  const delimiter = effectiveDelimiter(delimiterValue);
  const rows = lines.map((line) => line.split(delimiter));
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  const columns = hasHeader ? normalized[0] : Array.from({ length: width }, (_, index) => `列${index + 1}`);
  return { columns, rows: hasHeader ? normalized.slice(1) : normalized, summary: [], csv: "" };
}

export function normalizeColumnIndex(value: string, total: number): string {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue >= total) return "0";
  return String(numberValue);
}

export function describeRule(rule: BatchRule): string {
  if (rule.ruleType === "fill-empty") return `fill-empty (${rule.fillValue || "空字符串"})`;
  if (rule.ruleType === "format-number") return `format-number (${rule.decimals} 位小数)`;
  return rule.ruleType;
}

export function loanRequest(principal: string, rate: string, years: string, payments: string): LoanRequest {
  return { principal: Number(principal), annualRatePct: Number(rate), years: Number(years), paymentsPerYear: Number(payments) };
}

export function npvRequest(rate: string, initialInvestment: string, cashFlows: string): NpvRequest {
  return { ratePct: Number(rate), initialInvestment: Number(initialInvestment), cashFlows: parseNumberList(cashFlows) };
}

export function irrRequest(cashFlows: string, guess: string): IrrRequest {
  return { cashFlows: parseNumberList(cashFlows), guessPct: Number(guess) };
}

export function parseNumberList(input: string): number[] {
  return input.split(",").map((item) => Number(item.trim())).filter((item) => !Number.isNaN(item));
}

export function tableToText(columns: string[], rows: string[][]): string {
  return [columns.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");
}

export function currency(value: number): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);
}

export function signatureFor(raw: string, delimiter: string, hasHeader: boolean): string {
  return JSON.stringify({ raw, delimiter, hasHeader });
}

export function selectedSheetName(sheetName: string): string {
  const base = sheetName || "CleanedData";
  return base.slice(0, 31) || "CleanedData";
}

export function statusToneClass(tone: StatusTone): string {
  if (tone === "success") return "text-emerald-300";
  if (tone === "warning") return "text-amber-200";
  if (tone === "error") return "text-rose-300";
  return "text-slate-200";
}

export function metricEntries(entries: MetricEntry[]): MetricEntry[] {
  return entries;
}