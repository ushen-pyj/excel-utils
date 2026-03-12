export type TableInput = {
  raw: string;
  delimiter: string;
  hasHeader: boolean;
};

export type CleanResult = {
  columns: string[];
  rows: string[][];
  summary: string[];
  csv: string;
};

export type LoanRequest = {
  principal: number;
  annualRatePct: number;
  years: number;
  paymentsPerYear: number;
};

export type LoanResult = {
  payment: number;
  totalPayment: number;
  totalInterest: number;
};

export type NpvRequest = {
  ratePct: number;
  initialInvestment: number;
  cashFlows: number[];
};

export type NpvResult = {
  npv: number;
};

export type IrrRequest = {
  cashFlows: number[];
  guessPct: number;
};

export type IrrResult = {
  irrPct: number;
  iterations: number;
};

export type PrintResult = {
  title: string;
  summary: string[];
  columns: string[];
  rows: string[][];
  generatedAt: string;
};

export type WorkbookSheet = {
  name: string;
  rowCount: number;
  columnCount: number;
};

export type WorkbookInfo = {
  path: string;
  fileName: string;
  kind: string;
  sheets: WorkbookSheet[];
};

export type ExportResult = {
  path: string;
  format: string;
  rowCount: number;
  columnCount: number;
};

export type BatchRule = {
  ruleType: string;
  fillValue: string;
  decimals: number;
};

export type RuleChainItem = BatchRule & {
  id: string;
};

export type BatchFileResult = {
  inputPath: string;
  outputPath: string;
  format: string;
  rowCount: number;
  status: string;
  message: string;
};

export type BatchProcessResult = {
  processed: number;
  failed: number;
  results: BatchFileResult[];
};

export type StatusTone = "info" | "success" | "warning" | "error";
export type ViewKey = "dashboard" | "workbook" | "cleaning" | "batch" | "finance" | "print";
export type MetricEntry = [string, string];

export type NavItem = {
  key: ViewKey;
  label: string;
  eyebrow: string;
  desc: string;
};