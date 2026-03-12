use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintResult {
    pub title: String,
    pub summary: Vec<String>,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub generated_at: String,
}
