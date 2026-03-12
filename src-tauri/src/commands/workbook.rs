use crate::common::table::{build_clean_result, rows_to_table};
use crate::models::{CleanResult, ExportResult, WorkbookInfo};

#[tauri::command]
pub fn inspect_workbook(path: String) -> Result<WorkbookInfo, String> {
    crate::features::workbook::inspect_source(path)
}

#[tauri::command]
pub fn load_sheet_table(
    path: String,
    sheet_name: String,
    has_header: bool,
    limit: usize,
) -> Result<CleanResult, String> {
    let source = crate::features::workbook::read_source(&path, Some(sheet_name.as_str()))?;
    let parsed = rows_to_table(source.rows, has_header)?;
    let total_rows = parsed.rows.len();
    let preview_rows = parsed
        .rows
        .iter()
        .take(limit.max(1))
        .cloned()
        .collect::<Vec<_>>();

    Ok(build_clean_result(
        parsed.columns,
        preview_rows.clone(),
        vec![
            format!("Source file: {}", source.path),
            format!("Sheet: {}", source.active_sheet),
            format!("{total_rows} total rows, {} preview rows", preview_rows.len()),
        ],
    ))
}

#[tauri::command]
pub fn export_table(
    path: String,
    format: String,
    sheet_name: String,
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
) -> Result<ExportResult, String> {
    crate::features::workbook::export_dataset(path, format, sheet_name, columns, rows)
}
