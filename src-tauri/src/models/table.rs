use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInput {
    pub raw: String,
    pub delimiter: String,
    pub has_header: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub summary: Vec<String>,
    pub csv: String,
}

#[derive(Debug)]
pub struct ParsedTable {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}
