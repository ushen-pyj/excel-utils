import { invoke } from "@tauri-apps/api/core";
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
        用桌面应用的方式把常见 Excel 处理串起来。界面负责输入与预览，Rust 负责计算和数据整理。
      </p>
      <div class="hero-stats">
        <div>
          <span>数据清洗</span>
          <strong>去重 / 分列 / 合并</strong>
        </div>
        <div>
          <span>财务建模</span>
          <strong>PMT / NPV / IRR</strong>
        </div>
        <div>
          <span>快速打印</span>
          <strong>报表预览 / 浏览器打印</strong>
        </div>
      </div>
    </aside>

    <main class="workspace">
      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">01</p>
            <h2>数据清洗</h2>
          </div>
          <p>粘贴 Excel 复制出来的表格，直接进行重复值处理、分列与合并。</p>
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
          <p>从粘贴的数据生成打印友好的预览摘要，适合名单、台账和简版报表。</p>
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
let latestCsv = "";

must<HTMLButtonElement>("#dedupe-btn").addEventListener("click", async () => {
  const payload = baseTableInput();
  const rawIndex = must<HTMLInputElement>("#dedupe-column").value;
  const columnIndex = rawIndex === "" ? null : Number(rawIndex);
  const result = await invoke<CleanResult>("dedupe_rows", { input: payload, columnIndex });
  renderCleanResult(result);
});

must<HTMLButtonElement>("#split-btn").addEventListener("click", async () => {
  const result = await invoke<CleanResult>("split_column", {
    input: baseTableInput(),
    columnIndex: Number(must<HTMLInputElement>("#split-column").value),
    splitBy: must<HTMLInputElement>("#split-delimiter").value
  });
  renderCleanResult(result);
});

must<HTMLButtonElement>("#merge-btn").addEventListener("click", async () => {
  const indices = must<HTMLInputElement>("#merge-columns")
    .value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => !Number.isNaN(item));

  const result = await invoke<CleanResult>("merge_columns", {
    input: baseTableInput(),
    columnIndices: indices,
    joinWith: must<HTMLInputElement>("#merge-delimiter").value,
    newColumnName: must<HTMLInputElement>("#merge-name").value
  });
  renderCleanResult(result);
});

must<HTMLButtonElement>("#copy-csv-btn").addEventListener("click", async () => {
  if (!latestCsv) {
    return;
  }

  await navigator.clipboard.writeText(latestCsv);
});

must<HTMLButtonElement>("#loan-btn").addEventListener("click", async () => {
  const result = await invoke<LoanResult>("loan_payment", {
    request: {
      principal: Number(must<HTMLInputElement>("#loan-principal").value),
      annualRatePct: Number(must<HTMLInputElement>("#loan-rate").value),
      years: Number(must<HTMLInputElement>("#loan-years").value),
      paymentsPerYear: Number(must<HTMLInputElement>("#loan-payments").value)
    } satisfies LoanRequest
  });

  must<HTMLDivElement>("#loan-result").innerHTML = metricHtml([
    ["每期还款", currency(result.payment)],
    ["总还款", currency(result.totalPayment)],
    ["总利息", currency(result.totalInterest)]
  ]);
});

must<HTMLButtonElement>("#npv-btn").addEventListener("click", async () => {
  const result = await invoke<NpvResult>("net_present_value", {
    request: {
      ratePct: Number(must<HTMLInputElement>("#npv-rate").value),
      initialInvestment: Number(must<HTMLInputElement>("#npv-investment").value),
      cashFlows: parseNumberList(must<HTMLInputElement>("#npv-cashflows").value)
    } satisfies NpvRequest
  });

  must<HTMLDivElement>("#npv-result").innerHTML = metricHtml([["NPV", currency(result.npv)]]);
});

must<HTMLButtonElement>("#irr-btn").addEventListener("click", async () => {
  const result = await invoke<IrrResult>("internal_rate_of_return", {
    request: {
      cashFlows: parseNumberList(must<HTMLInputElement>("#irr-cashflows").value),
      guessPct: Number(must<HTMLInputElement>("#irr-guess").value)
    } satisfies IrrRequest
  });

  must<HTMLDivElement>("#irr-result").innerHTML = metricHtml([
    ["IRR", `${result.irrPct.toFixed(2)}%`],
    ["迭代次数", String(result.iterations)]
  ]);
});

must<HTMLButtonElement>("#print-preview-btn").addEventListener("click", async () => {
  const result = await buildPrintPreview();
  renderPrintPreview(result);
});

must<HTMLButtonElement>("#print-btn").addEventListener("click", async () => {
  const result = await buildPrintPreview();
  renderPrintPreview(result);
  window.print();
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

function renderCleanResult(result: CleanResult): void {
  latestCsv = result.csv;
  cleanSummary.innerHTML = result.summary.map((item) => `<li>${item}</li>`).join("");

  const header = result.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const rows = result.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  cleanTable.innerHTML = `
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function buildPrintPreview(): Promise<PrintResult> {
  return invoke<PrintResult>("build_printable_report", {
    input: baseTableInput(),
    title: must<HTMLInputElement>("#print-title").value
  });
}

function renderPrintPreview(result: PrintResult): void {
  printPreview.classList.remove("empty");
  const summary = result.summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const tableHeader = result.columns.map((item) => `<th>${escapeHtml(item)}</th>`).join("");
  const tableRows = result.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  printPreview.innerHTML = `
    <div class="print-sheet">
      <div class="print-sheet-head">
        <div>
          <p class="eyebrow">PRINT READY</p>
          <h3>${escapeHtml(result.title)}</h3>
        </div>
        <p>${escapeHtml(result.generatedAt)}</p>
      </div>
      <ul class="summary-list">${summary}</ul>
      <table>
        <thead><tr>${tableHeader}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function parseNumberList(input: string): number[] {
  return input
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => !Number.isNaN(item));
}

function currency(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2
  }).format(value);
}

function metricHtml(entries: Array<[string, string]>): string {
  return entries
    .map(
      ([label, value]) => `
        <div class="metric-row">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
