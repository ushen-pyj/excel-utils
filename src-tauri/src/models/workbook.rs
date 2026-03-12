use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookSheet {
    pub name: String,
    pub row_count: usize,
    pub column_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookInfo {
    pub path: String,
    pub file_name: String,
    pub kind: String,
    pub sheets: Vec<WorkbookSheet>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub format: String,
    pub row_count: usize,
    pub column_count: usize,
}

pub struct SourceTable {
    pub path: String,
    pub kind: String,
    pub active_sheet: String,
    pub rows: Vec<Vec<String>>,
    pub sheets: Vec<WorkbookSheet>,
}
