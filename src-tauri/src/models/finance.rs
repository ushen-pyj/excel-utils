use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LoanRequest {
    pub principal: f64,
    pub annual_rate_pct: f64,
    pub years: f64,
    pub payments_per_year: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoanResult {
    pub payment: f64,
    pub total_payment: f64,
    pub total_interest: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpvRequest {
    pub rate_pct: f64,
    pub initial_investment: f64,
    pub cash_flows: Vec<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpvResult {
    pub npv: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IrrRequest {
    pub cash_flows: Vec<f64>,
    pub guess_pct: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IrrResult {
    pub irr_pct: f64,
    pub iterations: u32,
}
