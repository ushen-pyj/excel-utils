use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TableInput {
    raw: String,
    delimiter: String,
    has_header: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanResult {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    summary: Vec<String>,
    csv: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoanRequest {
    principal: f64,
    annual_rate_pct: f64,
    years: f64,
    payments_per_year: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoanResult {
    payment: f64,
    total_payment: f64,
    total_interest: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NpvRequest {
    rate_pct: f64,
    initial_investment: f64,
    cash_flows: Vec<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NpvResult {
    npv: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IrrRequest {
    cash_flows: Vec<f64>,
    guess_pct: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IrrResult {
    irr_pct: f64,
    iterations: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrintResult {
    title: String,
    summary: Vec<String>,
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    generated_at: String,
}

#[tauri::command]
fn dedupe_rows(input: TableInput, column_index: Option<usize>) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    let mut seen = HashSet::new();
    let mut rows = Vec::new();
    let original_count = table.rows.len();

    for row in table.rows {
        let key = match column_index {
            Some(index) => row.get(index).cloned().unwrap_or_default(),
            None => row.join("\u{1f}"),
        };

        if seen.insert(key) {
            rows.push(row);
        }
    }

    Ok(build_clean_result(
        table.columns,
        rows,
        vec![
            format!("原始数据 {} 行，去重后 {} 行", original_count, seen.len()),
            match column_index {
                Some(index) => format!("按第 {} 列进行重复值处理", index),
                None => "按整行进行重复值处理".to_string(),
            },
        ],
    ))
}

#[tauri::command]
fn split_column(input: TableInput, column_index: usize, split_by: String) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    if split_by.is_empty() {
        return Err("拆分符不能为空".to_string());
    }
    if column_index >= table.columns.len() {
        return Err("目标列索引超出范围".to_string());
    }

    let max_segments = table
        .rows
        .iter()
        .map(|row| row.get(column_index).map(|cell| cell.split(&split_by).count()).unwrap_or(1))
        .max()
        .unwrap_or(1);

    let mut columns = Vec::new();
    for (idx, column) in table.columns.iter().enumerate() {
        if idx == column_index {
            for part_index in 0..max_segments {
                columns.push(format!("{} {}", column, part_index + 1));
            }
        } else {
            columns.push(column.clone());
        }
    }

    let mut rows = Vec::new();
    for row in table.rows {
        let mut new_row = Vec::new();
        for (idx, cell) in row.iter().enumerate() {
            if idx == column_index {
                let parts: Vec<String> = cell.split(&split_by).map(|item| item.trim().to_string()).collect();
                for part_index in 0..max_segments {
                    new_row.push(parts.get(part_index).cloned().unwrap_or_default());
                }
            } else {
                new_row.push(cell.clone());
            }
        }
        rows.push(new_row);
    }

    Ok(build_clean_result(
        columns.clone(),
        rows,
        vec![
            format!("第 {} 列已按 \"{}\" 拆分", column_index, split_by),
            format!("输出 {} 列", columns.len()),
        ],
    ))
}

#[tauri::command]
fn merge_columns(
    input: TableInput,
    column_indices: Vec<usize>,
    join_with: String,
    new_column_name: String,
) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    if column_indices.is_empty() {
        return Err("至少选择一列用于合并".to_string());
    }
    if column_indices.iter().any(|index| *index >= table.columns.len()) {
        return Err("存在超出范围的列索引".to_string());
    }

    let selected: HashSet<usize> = column_indices.iter().copied().collect();
    let mut columns = Vec::new();
    for (idx, column) in table.columns.iter().enumerate() {
        if !selected.contains(&idx) {
            columns.push(column.clone());
        }
    }
    columns.push(new_column_name.clone());

    let mut rows = Vec::new();
    for row in table.rows {
        let merged = column_indices
            .iter()
            .filter_map(|index| row.get(*index))
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>()
            .join(&join_with);

        let mut new_row = Vec::new();
        for (idx, cell) in row.iter().enumerate() {
            if !selected.contains(&idx) {
                new_row.push(cell.clone());
            }
        }
        new_row.push(merged);
        rows.push(new_row);
    }

    Ok(build_clean_result(
        columns,
        rows,
        vec![
            format!("已合并 {} 列", column_indices.len()),
            format!("新增列：{}", new_column_name),
        ],
    ))
}

#[tauri::command]
fn loan_payment(request: LoanRequest) -> Result<LoanResult, String> {
    if request.principal <= 0.0 || request.years <= 0.0 || request.payments_per_year <= 0.0 {
        return Err("本金、年限和还款频率必须大于 0".to_string());
    }

    let periods = request.years * request.payments_per_year;
    let rate = request.annual_rate_pct / 100.0 / request.payments_per_year;
    let payment = if rate.abs() < f64::EPSILON {
        request.principal / periods
    } else {
        let factor = (1.0 + rate).powf(periods);
        request.principal * rate * factor / (factor - 1.0)
    };
    let total_payment = payment * periods;

    Ok(LoanResult {
        payment,
        total_payment,
        total_interest: total_payment - request.principal,
    })
}

#[tauri::command]
fn net_present_value(request: NpvRequest) -> Result<NpvResult, String> {
    if request.cash_flows.is_empty() {
        return Err("请至少输入一项现金流".to_string());
    }

    let rate = request.rate_pct / 100.0;
    let npv = request
        .cash_flows
        .iter()
        .enumerate()
        .fold(-request.initial_investment, |acc, (idx, value)| {
            acc + value / (1.0 + rate).powi((idx as i32) + 1)
        });

    Ok(NpvResult { npv })
}

#[tauri::command]
fn internal_rate_of_return(request: IrrRequest) -> Result<IrrResult, String> {
    if request.cash_flows.len() < 2 {
        return Err("IRR 至少需要两期现金流".to_string());
    }

    let mut rate = request.guess_pct / 100.0;
    let max_iterations = 100_u32;
    let tolerance = 1e-7_f64;

    for iteration in 1..=max_iterations {
        let (npv, derivative) = npv_and_derivative(&request.cash_flows, rate);
        if derivative.abs() < 1e-10 {
            return Err("IRR 计算失败：导数过小，无法继续迭代".to_string());
        }

        let next = rate - npv / derivative;
        if (next - rate).abs() < tolerance {
            return Ok(IrrResult {
                irr_pct: next * 100.0,
                iterations: iteration,
            });
        }

        rate = next;
    }

    Err("IRR 在 100 次迭代内未收敛".to_string())
}

#[tauri::command]
fn build_printable_report(input: TableInput, title: String) -> Result<PrintResult, String> {
    let table = parse_table(input)?;
    let preview_rows = table.rows.iter().take(20).cloned().collect::<Vec<_>>();

    Ok(PrintResult {
        title,
        summary: vec![
            format!("记录数：{}", table.rows.len()),
            format!("字段数：{}", table.columns.len()),
            "预览默认展示前 20 行，适合做快速打印检查".to_string(),
        ],
        columns: table.columns,
        rows: preview_rows,
        generated_at: "由 Rust 处理层生成".to_string(),
    })
}

#[derive(Debug)]
struct ParsedTable {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
}

fn parse_table(input: TableInput) -> Result<ParsedTable, String> {
    let lines = input
        .raw
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>();

    if lines.is_empty() {
        return Err("请先输入表格内容".to_string());
    }

    let mut matrix = lines
        .iter()
        .map(|line| line.split(&input.delimiter).map(|cell| cell.trim().to_string()).collect::<Vec<_>>())
        .collect::<Vec<_>>();

    let width = matrix.iter().map(Vec::len).max().unwrap_or(0);
    for row in &mut matrix {
        while row.len() < width {
            row.push(String::new());
        }
    }

    let (columns, rows) = if input.has_header {
        let header = matrix.remove(0);
        (header, matrix)
    } else {
        let header = (0..width).map(|idx| format!("列{}", idx + 1)).collect();
        (header, matrix)
    };

    Ok(ParsedTable { columns, rows })
}

fn build_clean_result(columns: Vec<String>, rows: Vec<Vec<String>>, summary: Vec<String>) -> CleanResult {
    let mut csv_lines = Vec::new();
    csv_lines.push(columns.iter().map(|item| csv_escape(item)).collect::<Vec<_>>().join(","));
    for row in &rows {
        csv_lines.push(row.iter().map(|item| csv_escape(item)).collect::<Vec<_>>().join(","));
    }

    CleanResult {
        columns,
        rows,
        summary,
        csv: csv_lines.join("\n"),
    }
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn npv_and_derivative(cash_flows: &[f64], rate: f64) -> (f64, f64) {
    let mut npv = 0.0;
    let mut derivative = 0.0;

    for (period, cash_flow) in cash_flows.iter().enumerate() {
        let period = period as i32;
        let factor = (1.0 + rate).powi(period);
        npv += cash_flow / factor;

        if period > 0 {
            derivative -= (period as f64) * cash_flow / (1.0 + rate).powi(period + 1);
        }
    }

    (npv, derivative)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            dedupe_rows,
            split_column,
            merge_columns,
            loan_payment,
            net_present_value,
            internal_rate_of_return,
            build_printable_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
