import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import "./styles.css";

type TableInput = {
  raw: string;
  delimiter: string;
  hasHeader: boolean;
};

type CleanResult = {
  columns: string[];
  rows: string[][];
  summary: string[];
  csv: string;
};

type LoanRequest = {
  principal: number;
  annualRatePct: number;
  years: number;
  paymentsPerYear: number;
};

type LoanResult = {
  payment: number;
  totalPayment: number;
  totalInterest: number;
};

type NpvRequest = {
  ratePct: number;
  initialInvestment: number;
  cashFlows: number[];
};

type NpvResult = {
  npv: number;
};

type IrrRequest = {
  cashFlows: number[];
  guessPct: number;
};

type IrrResult = {
  irrPct: number;
  iterations: number;
};

type PrintResult = {
  title: string;
  summary: string[];
  columns: string[];
  rows: string[][];
  generatedAt: string;
};

type WorkbookSheet = {
  name: string;
  rowCount: number;
  columnCount: number;
};

type WorkbookInfo = {
  path: string;
  fileName: string;
  kind: string;
  sheets: WorkbookSheet[];
};

type ExportResult = {
  path: string;
  format: string;
  rowCount: number;
  columnCount: number;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

app.innerHTML = `
  <div class="shell">
    <aside class="hero">
      <p class="eyebrow">Tauri 2 + TypeScript + Rust</p>
      <h1>Excel 工具箱</h1>
      <p class="hero-copy">
        现在支持真实 Excel 文件的打开、预览、清洗和导出。前端负责交互与排版，Rust 负责表格读取、计算与写回。
      </p>
      <div class="hero-stats">
        <div>
          <span>文件工作流</span>
          <strong>导入 / 选表 / 导出</strong>
        </div>
        <div>
          <span>数据清洗</span>
          <strong>去重 / 分列 / 合并</strong>
        </div>
        <div>
          <span>财务建模</span>
          <strong>PMT / NPV / IRR</strong>
        </div>
      </div>
      <div id="status-card" class="status-card">等待打开工作簿或粘贴数据</div>
    </aside>

    <main class="workspace">
      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">00</p>
            <h2>工作簿</h2>
          </div>
          <p>通过 Tauri 2 官方 Dialog 插件选择本地 Excel/CSV 文件，并由 Rust 读取工作表内容。</p>
        </div>

        <div class="file-toolbar">
          <button id="open-workbook-btn" class="action">打开工作簿</button>
          <button id="load-sheet-btn" class="ghost">载入当前工作表</button>
          <button id="refresh-preview-btn" class="ghost">从文本刷新预览</button>
          <button id="export-xlsx-btn" class="ghost">导出 XLSX</button>
          <button id="export-csv-btn" class="ghost">导出 CSV</button>
        </div>

        <div class="file-grid">
          <div class="tool-box compact">
            <h3>文件信息</h3>
            <p id="workbook-path" class="muted">尚未选择文件</p>
            <div id="workbook-meta" class="meta-grid"></div>
          </div>

          <div class="tool-box compact">
            <h3>工作表选择</h3>
            <label class="field">
              <span>工作表</span>
              <select id="sheet-select"></select>
            </label>
            <label class="field">
              <span>预览行数</span>
              <input id="sheet-limit" type="number" min="5" value="200" />
            </label>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">01</p>
            <h2>数据清洗</h2>
          </div>
          <p>粘贴 Excel 复制出来的表格，或者先从工作簿载入，再进行重复值处理、分列与合并。</p>
        </div>

        <label class="field">
          <span>表格内容</span>
          <textarea id="table-raw" rows="9" placeholder="姓名\t部门\t地区&#10;张三\t销售\t华东&#10;张三\t销售\t华东&#10;李四\t财务\t华南"></textarea>
        </label>

        <div class="field-row">
          <label class="field">
            <span>分隔符</span>
            <select id="table-delimiter">
              <option value="tab">Tab</option>
              <option value=",">逗号</option>
              <option value=";">分号</option>
              <option value="|">竖线</option>
            </select>
          </label>
          <label class="checkbox">
            <input id="table-header" type="checkbox" checked />
            <span>首行是表头</span>
          </label>
        </div>

        <div class="tool-grid">
          <div class="tool-box">
            <h3>重复值处理</h3>
            <label class="field">
              <span>目标列索引（从 0 开始，留空表示整行）</span>
              <input id="dedupe-column" type="number" min="0" placeholder="例如 0" />
            </label>
            <button id="dedupe-btn" class="action">执行去重</button>
          </div>

          <div class="tool-box">
            <h3>分列</h3>
            <label class="field">
              <span>目标列索引</span>
              <input id="split-column" type="number" min="0" value="0" />
            </label>
            <label class="field">
              <span>拆分符</span>
              <input id="split-delimiter" type="text" value="-" />
            </label>
            <button id="split-btn" class="action">执行分列</button>
          </div>

          <div class="tool-box">
            <h3>合并列</h3>
            <label class="field">
              <span>列索引（逗号分隔）</span>
              <input id="merge-columns" type="text" value="0,1" />
            </label>
            <label class="field">
              <span>连接符</span>
              <input id="merge-delimiter" type="text" value="-" />
            </label>
            <label class="field">
              <span>新列名称</span>
              <input id="merge-name" type="text" value="合并结果" />
            </label>
            <button id="merge-btn" class="action">执行合并</button>
          </div>
        </div>

        <div class="result-block">
          <div class="result-head">
            <h3>处理结果</h3>
            <button id="copy-csv-btn" class="ghost">复制 CSV</button>
          </div>
          <ul id="clean-summary" class="summary-list"></ul>
          <div id="clean-table" class="table-wrap"></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">02</p>
            <h2>财务建模</h2>
          </div>
          <p>把常见模型计算交给 Rust，前端只负责参数录入和结果展示。</p>
        </div>

        <div class="finance-grid">
          <div class="tool-box">
            <h3>贷款月供 PMT</h3>
            <label class="field"><span>本金</span><input id="loan-principal" type="number" value="500000" /></label>
            <label class="field"><span>年利率 (%)</span><input id="loan-rate" type="number" step="0.01" value="3.2" /></label>
            <label class="field"><span>年限</span><input id="loan-years" type="number" value="20" /></label>
            <label class="field"><span>每年还款次数</span><input id="loan-payments" type="number" value="12" /></label>
            <button id="loan-btn" class="action">计算月供</button>
            <div id="loan-result" class="metric-card"></div>
          </div>

          <div class="tool-box">
            <h3>净现值 NPV</h3>
            <label class="field"><span>贴现率 (%)</span><input id="npv-rate" type="number" step="0.01" value="8" /></label>
            <label class="field"><span>初始投资</span><input id="npv-investment" type="number" value="100000" /></label>
            <label class="field">
              <span>现金流（逗号分隔）</span>
              <input id="npv-cashflows" type="text" value="30000,32000,36000,38000,42000" />
            </label>
            <button id="npv-btn" class="action">计算净现值</button>
            <div id="npv-result" class="metric-card"></div>
          </div>

          <div class="tool-box">
            <h3>内部收益率 IRR</h3>
            <label class="field">
              <span>现金流（第一项通常为负）</span>
              <input id="irr-cashflows" type="text" value="-100000,30000,32000,36000,38000,42000" />
            </label>
            <label class="field"><span>初始猜测 (%)</span><input id="irr-guess" type="number" step="0.01" value="10" /></label>
            <button id="irr-btn" class="action">计算 IRR</button>
            <div id="irr-result" class="metric-card"></div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">03</p>
            <h2>快速打印</h2>
          </div>
          <p>从粘贴的数据或已载入的工作表生成打印友好的预览摘要，适合名单、台账和简版报表。</p>
        </div>

        <div class="field-row">
          <label class="field grow">
            <span>打印标题</span>
            <input id="print-title" type="text" value="Excel 工具箱打印预览" />
          </label>
          <button id="print-preview-btn" class="action">生成预览</button>
          <button id="print-btn" class="ghost">直接打印</button>
        </div>

        <div id="print-preview" class="print-preview empty">尚未生成预览</div>
      </section>
    </main>
  </div>
`;

const cleanSummary = must<HTMLUListElement>("#clean-summary");
const cleanTable = must<HTMLDivElement>("#clean-table");
const printPreview = must<HTMLDivElement>("#print-preview");
const workbookPathEl = must<HTMLParagraphElement>("#workbook-path");
const workbookMetaEl = must<HTMLDivElement>("#workbook-meta");
const sheetSelect = must<HTMLSelectElement>("#sheet-select");
const statusCard = must<HTMLDivElement>("#status-card");

let latestCsv = "";
let currentTable: CleanResult | null = null;
let workbookInfo: WorkbookInfo | null = null;
let syncedSignature = "";

must<HTMLButtonElement>("#open-workbook-btn").addEventListener("click", async () => {
  try {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Spreadsheet", extensions: ["xlsx", "xlsm", "xls", "csv"] }]
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    const info = await invoke<WorkbookInfo>("inspect_workbook", { path: selected });
    workbookInfo = info;
    renderWorkbookInfo(info);
    setStatus(`已打开 ${info.fileName}，请选择工作表并载入`, "success");
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#load-sheet-btn").addEventListener("click", async () => {
  try {
    if (!workbookInfo) {
      setStatus("请先打开工作簿", "warning");
      return;
    }

    const result = await invoke<CleanResult>("load_sheet_table", {
      path: workbookInfo.path,
      sheetName: sheetSelect.value,
      hasHeader: must<HTMLInputElement>("#table-header").checked,
      limit: Number(must<HTMLInputElement>("#sheet-limit").value)
    });

    renderCleanResult(result, true);
    setStatus(`已载入工作表 ${sheetSelect.value}`, "success");
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#refresh-preview-btn").addEventListener("click", async () => {
  try {
    const result = await previewCurrentInput();
    renderCleanResult(result, false);
    setStatus("已根据文本内容刷新预览", "success");
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#dedupe-btn").addEventListener("click", async () => {
  try {
    const payload = baseTableInput();
    const rawIndex = must<HTMLInputElement>("#dedupe-column").value;
    const columnIndex = rawIndex === "" ? null : Number(rawIndex);
    const result = await invoke<CleanResult>("dedupe_rows", { input: payload, columnIndex });
    renderCleanResult(result, true);
    setStatus("重复值处理完成", "success");
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#split-btn").addEventListener("click", async () => {
  try {
    const result = await invoke<CleanResult>("split_column", {
      input: baseTableInput(),
      columnIndex: Number(must<HTMLInputElement>("#split-column").value),
      splitBy: must<HTMLInputElement>("#split-delimiter").value
    });
    renderCleanResult(result, true);
    setStatus("分列完成", "success");
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#merge-btn").addEventListener("click", async () => {
  try {
    const indices = must<HTMLInputElement>("#merge-columns").value.split(",").map((item) => Number(item.trim())).filter((item) => !Number.isNaN(item));
    const result = await invoke<CleanResult>("merge_columns", {
      input: baseTableInput(),
      columnIndices: indices,
      joinWith: must<HTMLInputElement>("#merge-delimiter").value,
      newColumnName: must<HTMLInputElement>("#merge-name").value
    });
    renderCleanResult(result, true);
    setStatus("合并列完成", "success");
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#copy-csv-btn").addEventListener("click", async () => {
  if (!latestCsv) {
    setStatus("当前没有可复制的结果", "warning");
    return;
  }
  await navigator.clipboard.writeText(latestCsv);
  setStatus("已复制 CSV 到剪贴板", "success");
});

must<HTMLButtonElement>("#export-xlsx-btn").addEventListener("click", async () => {
  await exportCurrentTable("xlsx");
});

must<HTMLButtonElement>("#export-csv-btn").addEventListener("click", async () => {
  await exportCurrentTable("csv");
});

must<HTMLButtonElement>("#loan-btn").addEventListener("click", async () => {
  try {
    const result = await invoke<LoanResult>("loan_payment", {
      request: {
        principal: Number(must<HTMLInputElement>("#loan-principal").value),
        annualRatePct: Number(must<HTMLInputElement>("#loan-rate").value),
        years: Number(must<HTMLInputElement>("#loan-years").value),
        paymentsPerYear: Number(must<HTMLInputElement>("#loan-payments").value)
      } satisfies LoanRequest
    });
    must<HTMLDivElement>("#loan-result").innerHTML = metricHtml([["每期还款", currency(result.payment)], ["总还款", currency(result.totalPayment)], ["总利息", currency(result.totalInterest)]]);
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#npv-btn").addEventListener("click", async () => {
  try {
    const result = await invoke<NpvResult>("net_present_value", {
      request: {
        ratePct: Number(must<HTMLInputElement>("#npv-rate").value),
        initialInvestment: Number(must<HTMLInputElement>("#npv-investment").value),
        cashFlows: parseNumberList(must<HTMLInputElement>("#npv-cashflows").value)
      } satisfies NpvRequest
    });
    must<HTMLDivElement>("#npv-result").innerHTML = metricHtml([["NPV", currency(result.npv)]]);
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#irr-btn").addEventListener("click", async () => {
  try {
    const result = await invoke<IrrResult>("internal_rate_of_return", {
      request: {
        cashFlows: parseNumberList(must<HTMLInputElement>("#irr-cashflows").value),
        guessPct: Number(must<HTMLInputElement>("#irr-guess").value)
      } satisfies IrrRequest
    });
    must<HTMLDivElement>("#irr-result").innerHTML = metricHtml([["IRR", `${result.irrPct.toFixed(2)}%`], ["迭代次数", String(result.iterations)]]);
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#print-preview-btn").addEventListener("click", async () => {
  try {
    renderPrintPreview(await buildPrintPreview());
  } catch (error) {
    handleError(error);
  }
});

must<HTMLButtonElement>("#print-btn").addEventListener("click", async () => {
  try {
    renderPrintPreview(await buildPrintPreview());
    window.print();
  } catch (error) {
    handleError(error);
  }
});

function must<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Missing element: ${selector}`);
  }
  return node;
}

function baseTableInput(): TableInput {
  const rawDelimiter = must<HTMLSelectElement>("#table-delimiter").value;
  return {
    raw: must<HTMLTextAreaElement>("#table-raw").value,
    delimiter: rawDelimiter === "tab" ? "\t" : rawDelimiter,
    hasHeader: must<HTMLInputElement>("#table-header").checked
  };
}

function renderWorkbookInfo(info: WorkbookInfo): void {
  workbookPathEl.textContent = info.path;
  workbookMetaEl.innerHTML = `<div><span>文件</span><strong>${escapeHtml(info.fileName)}</strong></div><div><span>类型</span><strong>${escapeHtml(info.kind.toUpperCase())}</strong></div><div><span>工作表数</span><strong>${info.sheets.length}</strong></div>`;
  sheetSelect.innerHTML = info.sheets.map((sheet) => `<option value="${escapeHtml(sheet.name)}">${escapeHtml(sheet.name)} (${sheet.rowCount} 行 / ${sheet.columnCount} 列)</option>`).join("");
}

async function previewCurrentInput(): Promise<CleanResult> {
  return invoke<CleanResult>("preview_input_table", { input: baseTableInput() });
}

function renderCleanResult(result: CleanResult, syncTextarea: boolean): void {
  currentTable = result;
  latestCsv = result.csv;
  if (syncTextarea) {
    must<HTMLTextAreaElement>("#table-raw").value = tableToText(result.columns, result.rows);
  }
  syncedSignature = signatureFor(baseTableInput());
  cleanSummary.innerHTML = result.summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const header = result.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const rows = result.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  cleanTable.innerHTML = `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
}

async function ensureCurrentTable(): Promise<CleanResult> {
  const signature = signatureFor(baseTableInput());
  if (!currentTable || syncedSignature !== signature) {
    currentTable = await previewCurrentInput();
    latestCsv = currentTable.csv;
    syncedSignature = signature;
  }
  return currentTable;
}

async function exportCurrentTable(format: "xlsx" | "csv"): Promise<void> {
  try {
    const table = await ensureCurrentTable();
    const chosen = await save({ defaultPath: format === "xlsx" ? "excel-utils-output.xlsx" : "excel-utils-output.csv", filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (!chosen) {
      return;
    }
    const result = await invoke<ExportResult>("export_table", {
      path: chosen,
      format,
      sheetName: selectedSheetName(),
      columns: table.columns,
      rows: table.rows
    });
    setStatus(`已导出到 ${result.path}`, "success");
  } catch (error) {
    handleError(error);
  }
}

function selectedSheetName(): string {
  const base = sheetSelect.value || "CleanedData";
  return base.slice(0, 31) || "CleanedData";
}

async function buildPrintPreview(): Promise<PrintResult> {
  return invoke<PrintResult>("build_printable_report", { input: baseTableInput(), title: must<HTMLInputElement>("#print-title").value });
}

function renderPrintPreview(result: PrintResult): void {
  printPreview.classList.remove("empty");
  const summary = result.summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const tableHeader = result.columns.map((item) => `<th>${escapeHtml(item)}</th>`).join("");
  const tableRows = result.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  printPreview.innerHTML = `<div class="print-sheet"><div class="print-sheet-head"><div><p class="eyebrow">PRINT READY</p><h3>${escapeHtml(result.title)}</h3></div><p>${escapeHtml(result.generatedAt)}</p></div><ul class="summary-list">${summary}</ul><table><thead><tr>${tableHeader}</tr></thead><tbody>${tableRows}</tbody></table></div>`;
}

function parseNumberList(input: string): number[] {
  return input.split(",").map((item) => Number(item.trim())).filter((item) => !Number.isNaN(item));
}

function currency(value: number): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);
}

function metricHtml(entries: Array<[string, string]>): string {
  return entries.map(([label, value]) => `<div class="metric-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function tableToText(columns: string[], rows: string[][]): string {
  return [columns.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");
}

function signatureFor(input: TableInput): string {
  return JSON.stringify(input);
}

function setStatus(message: string, tone: "info" | "success" | "warning" | "error" = "info"): void {
  statusCard.textContent = message;
  statusCard.dataset.tone = tone;
}

function handleError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(message, "error");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}