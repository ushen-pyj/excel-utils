use calamine::{open_workbook_auto, Reader};
use csv::{ReaderBuilder, WriterBuilder};
use rust_xlsxwriter::Workbook;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TableInput {
    raw: String,
    delimiter: String,
    has_header: bool,
}

#[derive(Debug, Serialize, Clone)]
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookSheet {
    name: String,
    row_count: usize,
    column_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookInfo {
    path: String,
    file_name: String,
    kind: String,
    sheets: Vec<WorkbookSheet>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    path: String,
    format: String,
    row_count: usize,
    column_count: usize,
}

#[tauri::command]
fn preview_input_table(input: TableInput) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    Ok(build_clean_result(
        table.columns.clone(),
        table.rows.clone(),
        vec![
            format!("Parsed {} rows and {} columns", table.rows.len(), table.columns.len()),
            "Current preview comes from the text input area".to_string(),
        ],
    ))
}

#[tauri::command]
fn inspect_workbook(path: String) -> Result<WorkbookInfo, String> {
    let source = read_source(&path, None)?;
    let file_name = Path::new(&path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    Ok(WorkbookInfo {
        path,
        file_name,
        kind: source.kind,
        sheets: source.sheets,
    })
}

#[tauri::command]
fn load_sheet_table(path: String, sheet_name: String, has_header: bool, limit: usize) -> Result<CleanResult, String> {
    let source = read_source(&path, Some(sheet_name.as_str()))?;
    let parsed = rows_to_table(source.rows, has_header)?;
    let total_rows = parsed.rows.len();
    let preview_rows = parsed.rows.iter().take(limit.max(1)).cloned().collect::<Vec<_>>();
    Ok(build_clean_result(
        parsed.columns,
        preview_rows.clone(),
        vec![
            format!("Source file: {}", source.path),
            format!("Sheet: {}", source.active_sheet),
            format!("{} total rows, {} preview rows", total_rows, preview_rows.len()),
        ],
    ))
}

#[tauri::command]
fn export_table(path: String, format: String, sheet_name: String, columns: Vec<String>, rows: Vec<Vec<String>>) -> Result<ExportResult, String> {
    let normalized = normalize_rows(rows);
    let format_lower = format.to_lowercase();
    match format_lower.as_str() {
        "csv" => export_csv(&path, &columns, &normalized)?,
        "xlsx" => export_xlsx(&path, &sheet_name, &columns, &normalized)?,
        _ => return Err("Only xlsx and csv export are supported".to_string()),
    }

    Ok(ExportResult {
        path,
        format: format_lower,
        row_count: normalized.len(),
        column_count: columns.len(),
    })
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
            format!("{} original rows, {} rows after dedupe", original_count, seen.len()),
            match column_index {
                Some(index) => format!("Dedupe key column: {}", index),
                None => "Dedupe key: full row".to_string(),
            },
        ],
    ))
}

#[tauri::command]
fn split_column(input: TableInput, column_index: usize, split_by: String) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    if split_by.is_empty() {
        return Err("Split delimiter cannot be empty".to_string());
    }
    if column_index >= table.columns.len() {
        return Err("Column index is out of range".to_string());
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
            format!("Split column {} by '{}'", column_index, split_by),
            format!("Output columns: {}", columns.len()),
        ],
    ))
}

#[tauri::command]
fn merge_columns(input: TableInput, column_indices: Vec<usize>, join_with: String, new_column_name: String) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    if column_indices.is_empty() {
        return Err("Select at least one column to merge".to_string());
    }
    if column_indices.iter().any(|index| *index >= table.columns.len()) {
        return Err("One or more column indices are out of range".to_string());
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
            format!("Merged {} columns", column_indices.len()),
            format!("New column: {}", new_column_name),
        ],
    ))
}

#[tauri::command]
fn loan_payment(request: LoanRequest) -> Result<LoanResult, String> {
    if request.principal <= 0.0 || request.years <= 0.0 || request.payments_per_year <= 0.0 {
        return Err("Principal, years, and payments per year must be greater than 0".to_string());
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
        return Err("Please provide at least one cash flow".to_string());
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
        return Err("IRR requires at least two cash flow periods".to_string());
    }
    let mut rate = request.guess_pct / 100.0;
    let max_iterations = 100_u32;
    let tolerance = 1e-7_f64;
    for iteration in 1..=max_iterations {
        let (npv, derivative) = npv_and_derivative(&request.cash_flows, rate);
        if derivative.abs() < 1e-10 {
            return Err("IRR failed because the derivative became too small".to_string());
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
    Err("IRR did not converge within 100 iterations".to_string())
}

#[tauri::command]
fn build_printable_report(input: TableInput, title: String) -> Result<PrintResult, String> {
    let table = parse_table(input)?;
    let preview_rows = table.rows.iter().take(20).cloned().collect::<Vec<_>>();
    Ok(PrintResult {
        title,
        summary: vec![
            format!("Rows: {}", table.rows.len()),
            format!("Columns: {}", table.columns.len()),
            "Preview defaults to the first 20 rows".to_string(),
        ],
        columns: table.columns,
        rows: preview_rows,
        generated_at: "Generated by the Rust processing layer".to_string(),
    })
}

#[derive(Debug)]
struct ParsedTable {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
}

struct SourceTable {
    path: String,
    kind: String,
    active_sheet: String,
    rows: Vec<Vec<String>>,
    sheets: Vec<WorkbookSheet>,
}

fn read_source(path: &str, selected_sheet: Option<&str>) -> Result<SourceTable, String> {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();

    if extension == "csv" {
        let rows = read_csv_rows(path)?;
        let row_count = rows.len();
        let width = rows.iter().map(Vec::len).max().unwrap_or(0);
        return Ok(SourceTable {
            path: path.to_string(),
            kind: "csv".to_string(),
            active_sheet: "CSV".to_string(),
            rows: pad_rows(rows, width),
            sheets: vec![WorkbookSheet {
                name: "CSV".to_string(),
                row_count,
                column_count: width,
            }],
        });
    }

    let mut workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let sheet_names = workbook.sheet_names().to_vec();
    if sheet_names.is_empty() {
        return Err("No worksheets found in the workbook".to_string());
    }

    let mut sheets = Vec::new();
    for name in &sheet_names {
        let range = workbook.worksheet_range(name).map_err(|error| error.to_string())?;
        sheets.push(WorkbookSheet {
            name: name.clone(),
            row_count: range.height(),
            column_count: range.width(),
        });
    }

    let active_sheet = selected_sheet
        .map(|value| value.to_string())
        .unwrap_or_else(|| sheet_names[0].clone());
    let range = workbook
        .worksheet_range(&active_sheet)
        .map_err(|error| error.to_string())?;
    let rows = range
        .rows()
        .map(|row| row.iter().map(|cell| cell.to_string()).collect::<Vec<_>>())
        .collect::<Vec<_>>();

    Ok(SourceTable {
        path: path.to_string(),
        kind: extension,
        active_sheet,
        rows,
        sheets,
    })
}

fn parse_table(input: TableInput) -> Result<ParsedTable, String> {
    let lines = input
        .raw
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Err("Please enter table content first".to_string());
    }
    let rows = lines
        .iter()
        .map(|line| {
            line.split(&input.delimiter)
                .map(|cell| cell.trim().to_string())
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    rows_to_table(rows, input.has_header)
}

fn rows_to_table(rows: Vec<Vec<String>>, has_header: bool) -> Result<ParsedTable, String> {
    if rows.is_empty() {
        return Err("No table data was loaded".to_string());
    }
    let width = rows.iter().map(Vec::len).max().unwrap_or(0);
    let mut normalized = pad_rows(rows, width);
    let (columns, rows) = if has_header {
        let header = normalized.remove(0);
        (header, normalized)
    } else {
        ((0..width).map(|idx| format!("Column{}", idx + 1)).collect(), normalized)
    };
    Ok(ParsedTable { columns, rows })
}

fn normalize_rows(rows: Vec<Vec<String>>) -> Vec<Vec<String>> {
    let width = rows.iter().map(Vec::len).max().unwrap_or(0);
    pad_rows(rows, width)
}

fn pad_rows(mut rows: Vec<Vec<String>>, width: usize) -> Vec<Vec<String>> {
    for row in &mut rows {
        while row.len() < width {
            row.push(String::new());
        }
    }
    rows
}

fn build_clean_result(columns: Vec<String>, rows: Vec<Vec<String>>, summary: Vec<String>) -> CleanResult {
    let normalized_rows = normalize_rows(rows);
    let mut csv_lines = Vec::new();
    csv_lines.push(columns.iter().map(|item| csv_escape(item)).collect::<Vec<_>>().join(","));
    for row in &normalized_rows {
        csv_lines.push(row.iter().map(|item| csv_escape(item)).collect::<Vec<_>>().join(","));
    }
    CleanResult {
        columns,
        rows: normalized_rows,
        summary,
        csv: csv_lines.join("\n"),
    }
}

fn read_csv_rows(path: &str) -> Result<Vec<Vec<String>>, String> {
    let mut reader = ReaderBuilder::new()
        .has_headers(false)
        .from_path(path)
        .map_err(|error| error.to_string())?;
    let mut rows = Vec::new();
    for record in reader.records() {
        let record = record.map_err(|error| error.to_string())?;
        rows.push(record.iter().map(|value| value.to_string()).collect());
    }
    Ok(rows)
}

fn export_csv(path: &str, columns: &[String], rows: &[Vec<String>]) -> Result<(), String> {
    let mut writer = WriterBuilder::new().from_path(path).map_err(|error| error.to_string())?;
    writer.write_record(columns).map_err(|error| error.to_string())?;
    for row in rows {
        writer.write_record(row).map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}

fn export_xlsx(path: &str, sheet_name: &str, columns: &[String], rows: &[Vec<String>]) -> Result<(), String> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name(sheet_name).map_err(|error| error.to_string())?;
    for (column_index, value) in columns.iter().enumerate() {
        worksheet
            .write_string(0, column_index as u16, value)
            .map_err(|error| error.to_string())?;
    }
    for (row_index, row) in rows.iter().enumerate() {
        for (column_index, value) in row.iter().enumerate() {
            worksheet
                .write_string((row_index + 1) as u32, column_index as u16, value)
                .map_err(|error| error.to_string())?;
        }
    }
    workbook.save(path).map_err(|error| error.to_string())
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            preview_input_table,
            inspect_workbook,
            load_sheet_table,
            export_table,
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