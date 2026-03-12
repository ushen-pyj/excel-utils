use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRule {
    pub rule_type: String,
    pub fill_value: String,
    pub decimals: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFileResult {
    pub input_path: String,
    pub output_path: String,
    pub format: String,
    pub row_count: usize,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchProcessResult {
    pub processed: usize,
    pub failed: usize,
    pub results: Vec<BatchFileResult>,
}
