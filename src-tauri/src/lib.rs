use calamine::{open_workbook_auto, Reader};
use csv::{ReaderBuilder, WriterBuilder};
use rust_xlsxwriter::Workbook;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

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

#[derive(Debug, Deserialize, Clone)]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchRule {
    rule_type: String,
    fill_value: String,
    decimals: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchFileResult {
    input_path: String,
    output_path: String,
    format: String,
    row_count: usize,
    status: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchProcessResult {
    processed: usize,
    failed: usize,
    results: Vec<BatchFileResult>,
}

#[tauri::command]
fn preview_input_table(input: TableInput) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    Ok(build_clean_result(table.columns.clone(), table.rows.clone(), vec![format!("Parsed {} rows and {} columns", table.rows.len(), table.columns.len()), "Current preview comes from the text input area".to_string()]))
}

#[tauri::command]
fn inspect_workbook(path: String) -> Result<WorkbookInfo, String> {
    let source = read_source(&path, None)?;
    let file_name = Path::new(&path).file_name().map(|value| value.to_string_lossy().to_string()).unwrap_or_else(|| path.clone());
    Ok(WorkbookInfo { path, file_name, kind: source.kind, sheets: source.sheets })
}

#[tauri::command]
fn load_sheet_table(path: String, sheet_name: String, has_header: bool, limit: usize) -> Result<CleanResult, String> {
    let source = read_source(&path, Some(sheet_name.as_str()))?;
    let parsed = rows_to_table(source.rows, has_header)?;
    let total_rows = parsed.rows.len();
    let preview_rows = parsed.rows.iter().take(limit.max(1)).cloned().collect::<Vec<_>>();
    Ok(build_clean_result(parsed.columns, preview_rows.clone(), vec![format!("Source file: {}", source.path), format!("Sheet: {}", source.active_sheet), format!("{} total rows, {} preview rows", total_rows, preview_rows.len())]))
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
    Ok(ExportResult { path, format: format_lower, row_count: normalized.len(), column_count: columns.len() })
}

#[tauri::command]
fn batch_apply_column_rule(paths: Vec<String>, output_dir: String, column_name: String, rule: BatchRule, has_header: bool) -> Result<BatchProcessResult, String> {
    if paths.is_empty() { return Err("Please provide at least one input file".to_string()); }
    if column_name.trim().is_empty() { return Err("Column name is required for batch processing".to_string()); }

    let mut results = Vec::new();
    let mut processed = 0;
    let mut failed = 0;

    for path in paths {
        match batch_process_single_file(&path, &output_dir, &column_name, &rule, has_header) {
            Ok(result) => {
                processed += 1;
                results.push(result);
            }
            Err(error) => {
                failed += 1;
                results.push(BatchFileResult {
                    input_path: path,
                    output_path: String::new(),
                    format: String::new(),
                    row_count: 0,
                    status: "failed".to_string(),
                    message: error,
                });
            }
        }
    }

    Ok(BatchProcessResult { processed, failed, results })
}

#[tauri::command]
fn trim_cells(input: TableInput, column_index: usize) -> Result<CleanResult, String> { transform_single_column(input, column_index, |value| value.trim().to_string(), |column| vec![format!("Trimmed whitespace in column {}", column)]) }

#[tauri::command]
fn change_case(input: TableInput, column_index: usize, mode: String) -> Result<CleanResult, String> {
    let normalized_mode = mode.to_lowercase();
    transform_single_column(input, column_index, |value| {
        if normalized_mode == "uppercase" { value.to_uppercase() } else if normalized_mode == "lowercase" { value.to_lowercase() } else { value.to_string() }
    }, |column| vec![format!("Applied {} to column {}", normalized_mode, column)])
}

#[tauri::command]
fn fill_empty_cells(input: TableInput, column_index: usize, fill_value: String) -> Result<CleanResult, String> {
    transform_single_column(input, column_index, |value| if value.trim().is_empty() { fill_value.clone() } else { value.to_string() }, |column| vec![format!("Filled empty cells in column {}", column), format!("Fill value: {}", fill_value)])
}

#[tauri::command]
fn format_numeric_column(input: TableInput, column_index: usize, decimals: usize) -> Result<CleanResult, String> {
    transform_single_column(input, column_index, |value| format_number_cell(value, decimals), |column| vec![format!("Formatted numeric values in column {}", column), format!("Decimals: {}", decimals)])
}

#[tauri::command]
fn dedupe_rows(input: TableInput, column_index: Option<usize>) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    let mut seen = HashSet::new();
    let mut rows = Vec::new();
    let original_count = table.rows.len();
    for row in table.rows {
        let key = match column_index { Some(index) => row.get(index).cloned().unwrap_or_default(), None => row.join("\u{1f}") };
        if seen.insert(key) { rows.push(row); }
    }
    Ok(build_clean_result(table.columns, rows, vec![format!("{} original rows, {} rows after dedupe", original_count, seen.len()), match column_index { Some(index) => format!("Dedupe key column: {}", index), None => "Dedupe key: full row".to_string() }]))
}

#[tauri::command]
fn split_column(input: TableInput, column_index: usize, split_by: String) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    if split_by.is_empty() { return Err("Split delimiter cannot be empty".to_string()); }
    ensure_column_index(&table, column_index)?;
    let max_segments = table.rows.iter().map(|row| row.get(column_index).map(|cell| cell.split(&split_by).count()).unwrap_or(1)).max().unwrap_or(1);
    let mut columns = Vec::new();
    for (idx, column) in table.columns.iter().enumerate() {
        if idx == column_index { for part_index in 0..max_segments { columns.push(format!("{} {}", column, part_index + 1)); } } else { columns.push(column.clone()); }
    }
    let mut rows = Vec::new();
    for row in table.rows {
        let mut new_row = Vec::new();
        for (idx, cell) in row.iter().enumerate() {
            if idx == column_index {
                let parts: Vec<String> = cell.split(&split_by).map(|item| item.trim().to_string()).collect();
                for part_index in 0..max_segments { new_row.push(parts.get(part_index).cloned().unwrap_or_default()); }
            } else { new_row.push(cell.clone()); }
        }
        rows.push(new_row);
    }
    Ok(build_clean_result(columns.clone(), rows, vec![format!("Split column {} by '{}'", column_index, split_by), format!("Output columns: {}", columns.len())]))
}

#[tauri::command]
fn merge_columns(input: TableInput, column_indices: Vec<usize>, join_with: String, new_column_name: String) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    if column_indices.is_empty() { return Err("Select at least one column to merge".to_string()); }
    if column_indices.iter().any(|index| *index >= table.columns.len()) { return Err("One or more column indices are out of range".to_string()); }
    let selected: HashSet<usize> = column_indices.iter().copied().collect();
    let mut columns = Vec::new();
    for (idx, column) in table.columns.iter().enumerate() { if !selected.contains(&idx) { columns.push(column.clone()); } }
    columns.push(new_column_name.clone());
    let mut rows = Vec::new();
    for row in table.rows {
        let merged = column_indices.iter().filter_map(|index| row.get(*index)).map(|item| item.trim()).filter(|item| !item.is_empty()).collect::<Vec<_>>().join(&join_with);
        let mut new_row = Vec::new();
        for (idx, cell) in row.iter().enumerate() { if !selected.contains(&idx) { new_row.push(cell.clone()); } }
        new_row.push(merged);
        rows.push(new_row);
    }
    Ok(build_clean_result(columns, rows, vec![format!("Merged {} columns", column_indices.len()), format!("New column: {}", new_column_name)]))
}

#[tauri::command]
fn loan_payment(request: LoanRequest) -> Result<LoanResult, String> {
    validate_loan_request(&request)?;
    let periods = request.years * request.payments_per_year;
    let payment = periodic_payment(&request);
    let total_payment = payment * periods;
    Ok(LoanResult { payment, total_payment, total_interest: total_payment - request.principal })
}

#[tauri::command]
fn loan_amortization_schedule(request: LoanRequest) -> Result<CleanResult, String> {
    validate_loan_request(&request)?;
    let payment = periodic_payment(&request);
    let periodic_rate = request.annual_rate_pct / 100.0 / request.payments_per_year;
    let periods = (request.years * request.payments_per_year).round() as usize;
    let mut balance = request.principal;
    let mut rows = Vec::new();
    for period in 1..=periods {
        let interest = if periodic_rate.abs() < f64::EPSILON { 0.0 } else { balance * periodic_rate };
        let principal = if period == periods { balance } else { (payment - interest).min(balance) };
        balance = (balance - principal).max(0.0);
        rows.push(vec![period.to_string(), format_decimal(payment), format_decimal(principal), format_decimal(interest), format_decimal(balance)]);
    }
    Ok(build_clean_result(vec!["Period".to_string(), "Payment".to_string(), "Principal".to_string(), "Interest".to_string(), "RemainingBalance".to_string()], rows, vec![format!("Principal: {}", format_decimal(request.principal)), format!("Periodic payment: {}", format_decimal(payment)), format!("Periods: {}", periods)]))
}

#[tauri::command]
fn net_present_value(request: NpvRequest) -> Result<NpvResult, String> {
    if request.cash_flows.is_empty() { return Err("Please provide at least one cash flow".to_string()); }
    Ok(NpvResult { npv: compute_npv(request.rate_pct / 100.0, request.initial_investment, &request.cash_flows) })
}

#[tauri::command]
fn npv_sensitivity_table(rate_pct: f64, initial_investment: f64, cash_flows: Vec<f64>) -> Result<CleanResult, String> {
    if cash_flows.is_empty() { return Err("Please provide at least one cash flow".to_string()); }
    let offsets = [-3.0_f64, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0];
    let rows = offsets.iter().map(|offset| { let rate = (rate_pct + offset).max(0.0); let npv = compute_npv(rate / 100.0, initial_investment, &cash_flows); vec![format_decimal(rate), format_decimal(npv)] }).collect::<Vec<_>>();
    Ok(build_clean_result(vec!["DiscountRatePct".to_string(), "NPV".to_string()], rows, vec![format!("Base rate: {}", format_decimal(rate_pct)), format!("Investment: {}", format_decimal(initial_investment)), format!("Cash flow periods: {}", cash_flows.len())]))
}

#[tauri::command]
fn internal_rate_of_return(request: IrrRequest) -> Result<IrrResult, String> {
    if request.cash_flows.len() < 2 { return Err("IRR requires at least two cash flow periods".to_string()); }
    let mut rate = request.guess_pct / 100.0;
    for iteration in 1..=100_u32 {
        let (npv, derivative) = npv_and_derivative(&request.cash_flows, rate);
        if derivative.abs() < 1e-10 { return Err("IRR failed because the derivative became too small".to_string()); }
        let next = rate - npv / derivative;
        if (next - rate).abs() < 1e-7_f64 { return Ok(IrrResult { irr_pct: next * 100.0, iterations: iteration }); }
        rate = next;
    }
    Err("IRR did not converge within 100 iterations".to_string())
}

#[tauri::command]
fn build_printable_report(input: TableInput, title: String) -> Result<PrintResult, String> {
    let table = parse_table(input)?;
    Ok(PrintResult { title, summary: vec![format!("Rows: {}", table.rows.len()), format!("Columns: {}", table.columns.len()), "Preview defaults to the first 20 rows".to_string()], columns: table.columns, rows: table.rows.into_iter().take(20).collect(), generated_at: "Generated by the Rust processing layer".to_string() })
}

#[derive(Debug)]
struct ParsedTable { columns: Vec<String>, rows: Vec<Vec<String>> }

struct SourceTable { path: String, kind: String, active_sheet: String, rows: Vec<Vec<String>>, sheets: Vec<WorkbookSheet> }

fn batch_process_single_file(path: &str, output_dir: &str, column_name: &str, rule: &BatchRule, has_header: bool) -> Result<BatchFileResult, String> {
    let source = read_source(path, None)?;
    let parsed = rows_to_table(source.rows, has_header)?;
    let column_index = parsed.columns.iter().position(|column| column == column_name).ok_or_else(|| format!("Column '{}' not found", column_name))?;
    let transformed = apply_rule_to_table(parsed, column_index, rule)?;
    let input_path = Path::new(path);
    let stem = input_path.file_stem().and_then(|value| value.to_str()).unwrap_or("output");
    let extension = if source.kind == "csv" { "csv" } else { "xlsx" };
    let output_path = PathBuf::from(output_dir).join(format!("{}-cleaned.{}", stem, extension));
    let output_string = output_path.to_string_lossy().to_string();
    export_table(output_string.clone(), extension.to_string(), source.active_sheet.clone(), transformed.columns.clone(), transformed.rows.clone())?;
    Ok(BatchFileResult { input_path: path.to_string(), output_path: output_string, format: extension.to_string(), row_count: transformed.rows.len(), status: "processed".to_string(), message: format!("Applied {} to column {}", rule.rule_type, column_name) })
}

fn apply_rule_to_table(table: ParsedTable, column_index: usize, rule: &BatchRule) -> Result<CleanResult, String> {
    let summary = match rule.rule_type.as_str() {
        "trim" => vec![format!("Trimmed whitespace in column {}", table.columns[column_index])],
        "uppercase" | "lowercase" => vec![format!("Applied {} to column {}", rule.rule_type, table.columns[column_index])],
        "fill-empty" => vec![format!("Filled empty cells in column {}", table.columns[column_index]), format!("Fill value: {}", rule.fill_value)],
        "format-number" => vec![format!("Formatted numeric values in column {}", table.columns[column_index]), format!("Decimals: {}", rule.decimals)],
        _ => return Err("Unsupported batch rule".to_string()),
    };

    let column_name = table.columns[column_index].clone();
    let rows = table.rows.into_iter().map(|mut row| {
        if let Some(cell) = row.get_mut(column_index) {
            *cell = match rule.rule_type.as_str() {
                "trim" => cell.trim().to_string(),
                "uppercase" => cell.to_uppercase(),
                "lowercase" => cell.to_lowercase(),
                "fill-empty" => if cell.trim().is_empty() { rule.fill_value.clone() } else { cell.clone() },
                "format-number" => format_number_cell(cell, rule.decimals),
                _ => cell.clone(),
            };
        }
        row
    }).collect::<Vec<_>>();
    Ok(build_clean_result(table.columns, rows, vec![summary.join(" | "), format!("Matched column: {}", column_name)]))
}

fn read_source(path: &str, selected_sheet: Option<&str>) -> Result<SourceTable, String> {
    let extension = Path::new(path).extension().and_then(|value| value.to_str()).unwrap_or("").to_lowercase();
    if extension == "csv" {
        let rows = read_csv_rows(path)?;
        let row_count = rows.len();
        let width = rows.iter().map(Vec::len).max().unwrap_or(0);
        return Ok(SourceTable { path: path.to_string(), kind: "csv".to_string(), active_sheet: "CSV".to_string(), rows: pad_rows(rows, width), sheets: vec![WorkbookSheet { name: "CSV".to_string(), row_count, column_count: width }] });
    }
    let mut workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let sheet_names = workbook.sheet_names().to_vec();
    if sheet_names.is_empty() { return Err("No worksheets found in the workbook".to_string()); }
    let mut sheets = Vec::new();
    for name in &sheet_names {
        let range = workbook.worksheet_range(name).map_err(|error| error.to_string())?;
        sheets.push(WorkbookSheet { name: name.clone(), row_count: range.height(), column_count: range.width() });
    }
    let active_sheet = selected_sheet.map(|value| value.to_string()).unwrap_or_else(|| sheet_names[0].clone());
    let range = workbook.worksheet_range(&active_sheet).map_err(|error| error.to_string())?;
    let rows = range.rows().map(|row| row.iter().map(|cell| cell.to_string()).collect::<Vec<_>>()).collect::<Vec<_>>();
    Ok(SourceTable { path: path.to_string(), kind: extension, active_sheet, rows, sheets })
}

fn parse_table(input: TableInput) -> Result<ParsedTable, String> {
    let lines = input.raw.lines().map(str::trim_end).filter(|line| !line.trim().is_empty()).collect::<Vec<_>>();
    if lines.is_empty() { return Err("Please enter table content first".to_string()); }
    let rows = lines.iter().map(|line| line.split(&input.delimiter).map(|cell| cell.trim_end().to_string()).collect::<Vec<_>>()).collect::<Vec<_>>();
    rows_to_table(rows, input.has_header)
}

fn rows_to_table(rows: Vec<Vec<String>>, has_header: bool) -> Result<ParsedTable, String> {
    if rows.is_empty() { return Err("No table data was loaded".to_string()); }
    let width = rows.iter().map(Vec::len).max().unwrap_or(0);
    let mut normalized = pad_rows(rows, width);
    let (columns, rows) = if has_header { let header = normalized.remove(0); (header, normalized) } else { ((0..width).map(|idx| format!("Column{}", idx + 1)).collect(), normalized) };
    Ok(ParsedTable { columns, rows })
}

fn ensure_column_index(table: &ParsedTable, column_index: usize) -> Result<(), String> { if column_index >= table.columns.len() { Err("Column index is out of range".to_string()) } else { Ok(()) } }

fn transform_single_column<F, S>(input: TableInput, column_index: usize, mut transform: F, summary_builder: S) -> Result<CleanResult, String>
where F: FnMut(&str) -> String, S: Fn(&str) -> Vec<String> {
    let table = parse_table(input)?;
    ensure_column_index(&table, column_index)?;
    let column_name = table.columns[column_index].clone();
    let rows = table.rows.into_iter().map(|mut row| { if let Some(cell) = row.get_mut(column_index) { *cell = transform(cell); } row }).collect::<Vec<_>>();
    Ok(build_clean_result(table.columns, rows, summary_builder(&column_name)))
}

fn validate_loan_request(request: &LoanRequest) -> Result<(), String> { if request.principal <= 0.0 || request.years <= 0.0 || request.payments_per_year <= 0.0 { Err("Principal, years, and payments per year must be greater than 0".to_string()) } else { Ok(()) } }
fn periodic_payment(request: &LoanRequest) -> f64 { let periods = request.years * request.payments_per_year; let rate = request.annual_rate_pct / 100.0 / request.payments_per_year; if rate.abs() < f64::EPSILON { request.principal / periods } else { let factor = (1.0 + rate).powf(periods); request.principal * rate * factor / (factor - 1.0) } }
fn compute_npv(rate: f64, initial_investment: f64, cash_flows: &[f64]) -> f64 { cash_flows.iter().enumerate().fold(-initial_investment, |acc, (idx, value)| acc + value / (1.0 + rate).powi((idx as i32) + 1)) }
fn normalize_rows(rows: Vec<Vec<String>>) -> Vec<Vec<String>> { let width = rows.iter().map(Vec::len).max().unwrap_or(0); pad_rows(rows, width) }
fn pad_rows(mut rows: Vec<Vec<String>>, width: usize) -> Vec<Vec<String>> { for row in &mut rows { while row.len() < width { row.push(String::new()); } } rows }
fn build_clean_result(columns: Vec<String>, rows: Vec<Vec<String>>, summary: Vec<String>) -> CleanResult { let normalized_rows = normalize_rows(rows); let mut csv_lines = Vec::new(); csv_lines.push(columns.iter().map(|item| csv_escape(item)).collect::<Vec<_>>().join(",")); for row in &normalized_rows { csv_lines.push(row.iter().map(|item| csv_escape(item)).collect::<Vec<_>>().join(",")); } CleanResult { columns, rows: normalized_rows, summary, csv: csv_lines.join("\n") } }
fn read_csv_rows(path: &str) -> Result<Vec<Vec<String>>, String> { let mut reader = ReaderBuilder::new().has_headers(false).from_path(path).map_err(|error| error.to_string())?; let mut rows = Vec::new(); for record in reader.records() { let record = record.map_err(|error| error.to_string())?; rows.push(record.iter().map(|value| value.to_string()).collect()); } Ok(rows) }
fn export_csv(path: &str, columns: &[String], rows: &[Vec<String>]) -> Result<(), String> { let mut writer = WriterBuilder::new().from_path(path).map_err(|error| error.to_string())?; writer.write_record(columns).map_err(|error| error.to_string())?; for row in rows { writer.write_record(row).map_err(|error| error.to_string())?; } writer.flush().map_err(|error| error.to_string()) }
fn export_xlsx(path: &str, sheet_name: &str, columns: &[String], rows: &[Vec<String>]) -> Result<(), String> { let mut workbook = Workbook::new(); let worksheet = workbook.add_worksheet(); worksheet.set_name(sheet_name).map_err(|error| error.to_string())?; for (column_index, value) in columns.iter().enumerate() { worksheet.write_string(0, column_index as u16, value).map_err(|error| error.to_string())?; } for (row_index, row) in rows.iter().enumerate() { for (column_index, value) in row.iter().enumerate() { worksheet.write_string((row_index + 1) as u32, column_index as u16, value).map_err(|error| error.to_string())?; } } workbook.save(path).map_err(|error| error.to_string()) }
fn csv_escape(value: &str) -> String { if value.contains(',') || value.contains('"') || value.contains('\n') { format!("\"{}\"", value.replace('"', "\"\"")) } else { value.to_string() } }
fn format_decimal(value: f64) -> String { format!("{:.2}", value) }
fn format_number_cell(value: &str, decimals: usize) -> String { let trimmed = value.trim(); if trimmed.is_empty() { String::new() } else if let Ok(number) = trimmed.parse::<f64>() { format!("{number:.prec$}", prec = decimals) } else { value.to_string() } }
fn npv_and_derivative(cash_flows: &[f64], rate: f64) -> (f64, f64) { let mut npv = 0.0; let mut derivative = 0.0; for (period, cash_flow) in cash_flows.iter().enumerate() { let period = period as i32; let factor = (1.0 + rate).powi(period); npv += cash_flow / factor; if period > 0 { derivative -= (period as f64) * cash_flow / (1.0 + rate).powi(period + 1); } } (npv, derivative) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![preview_input_table, inspect_workbook, load_sheet_table, export_table, batch_apply_column_rule, trim_cells, change_case, fill_empty_cells, format_numeric_column, dedupe_rows, split_column, merge_columns, loan_payment, loan_amortization_schedule, net_present_value, npv_sensitivity_table, internal_rate_of_return, build_printable_report])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}