use crate::common::formatting::csv_escape;
use crate::models::{CleanResult, ParsedTable, TableInput};

pub fn parse_table(input: TableInput) -> Result<ParsedTable, String> {
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
                .map(|cell| cell.trim_end().to_string())
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    rows_to_table(rows, input.has_header)
}

pub fn rows_to_table(rows: Vec<Vec<String>>, has_header: bool) -> Result<ParsedTable, String> {
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

pub fn ensure_column_index(table: &ParsedTable, column_index: usize) -> Result<(), String> {
    if column_index >= table.columns.len() {
        Err("Column index is out of range".to_string())
    } else {
        Ok(())
    }
}

pub fn normalize_rows(rows: Vec<Vec<String>>) -> Vec<Vec<String>> {
    let width = rows.iter().map(Vec::len).max().unwrap_or(0);
    pad_rows(rows, width)
}

pub fn pad_rows(mut rows: Vec<Vec<String>>, width: usize) -> Vec<Vec<String>> {
    for row in &mut rows {
        while row.len() < width {
            row.push(String::new());
        }
    }
    rows
}

pub fn build_clean_result(
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    summary: Vec<String>,
) -> CleanResult {
    let normalized_rows = normalize_rows(rows);
    let mut csv_lines = Vec::with_capacity(normalized_rows.len() + 1);
    csv_lines.push(
        columns
            .iter()
            .map(|item| csv_escape(item))
            .collect::<Vec<_>>()
            .join(","),
    );
    for row in &normalized_rows {
        csv_lines.push(
            row.iter()
                .map(|item| csv_escape(item))
                .collect::<Vec<_>>()
                .join(","),
        );
    }

    CleanResult {
        columns,
        rows: normalized_rows,
        summary,
        csv: csv_lines.join("\n"),
    }
}
