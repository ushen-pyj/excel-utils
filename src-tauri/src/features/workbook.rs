use calamine::{open_workbook_auto, Reader};
use csv::{ReaderBuilder, WriterBuilder};
use rust_xlsxwriter::Workbook;
use std::path::Path;

use crate::common::table::pad_rows;
use crate::models::{ExportResult, SourceTable, WorkbookInfo, WorkbookSheet};

pub fn read_source(path: &str, selected_sheet: Option<&str>) -> Result<SourceTable, String> {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();

    if extension == "csv" {
        return read_csv_source(path);
    }

    read_workbook_source(path, selected_sheet, extension)
}

pub fn export_dataset(
    path: String,
    format: String,
    sheet_name: String,
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
) -> Result<ExportResult, String> {
    let normalized_rows = crate::common::table::normalize_rows(rows);
    let format = format.to_lowercase();

    match format.as_str() {
        "csv" => export_csv(&path, &columns, &normalized_rows)?,
        "xlsx" => export_xlsx(&path, &sheet_name, &columns, &normalized_rows)?,
        _ => return Err("Only xlsx and csv export are supported".to_string()),
    }

    Ok(ExportResult {
        path,
        format,
        row_count: normalized_rows.len(),
        column_count: columns.len(),
    })
}

pub fn inspect_source(path: String) -> Result<WorkbookInfo, String> {
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

fn read_csv_source(path: &str) -> Result<SourceTable, String> {
    let rows = read_csv_rows(path)?;
    let row_count = rows.len();
    let width = rows.iter().map(Vec::len).max().unwrap_or(0);

    Ok(SourceTable {
        path: path.to_string(),
        kind: "csv".to_string(),
        active_sheet: "CSV".to_string(),
        rows: pad_rows(rows, width),
        sheets: vec![WorkbookSheet {
            name: "CSV".to_string(),
            row_count,
            column_count: width,
        }],
    })
}

fn read_workbook_source(
    path: &str,
    selected_sheet: Option<&str>,
    extension: String,
) -> Result<SourceTable, String> {
    let mut workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let sheet_names = workbook.sheet_names().to_vec();
    if sheet_names.is_empty() {
        return Err("No worksheets found in the workbook".to_string());
    }

    let mut sheets = Vec::with_capacity(sheet_names.len());
    for name in &sheet_names {
        let range = workbook
            .worksheet_range(name)
            .map_err(|error| error.to_string())?;
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
    let mut writer = WriterBuilder::new()
        .from_path(path)
        .map_err(|error| error.to_string())?;
    writer
        .write_record(columns)
        .map_err(|error| error.to_string())?;

    for row in rows {
        writer.write_record(row).map_err(|error| error.to_string())?;
    }

    writer.flush().map_err(|error| error.to_string())
}

fn export_xlsx(
    path: &str,
    sheet_name: &str,
    columns: &[String],
    rows: &[Vec<String>],
) -> Result<(), String> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet
        .set_name(sheet_name)
        .map_err(|error| error.to_string())?;

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
