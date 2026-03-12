use crate::models::{CleanResult, IrrRequest, IrrResult, LoanRequest, LoanResult, NpvRequest, NpvResult};

#[tauri::command]
pub fn loan_payment(request: LoanRequest) -> Result<LoanResult, String> {
    crate::features::finance::loan_payment_details(request)
}

#[tauri::command]
pub fn loan_amortization_schedule(request: LoanRequest) -> Result<CleanResult, String> {
    crate::features::finance::loan_amortization_table(request)
}

#[tauri::command]
pub fn net_present_value(request: NpvRequest) -> Result<NpvResult, String> {
    crate::features::finance::calculate_npv(request)
}

#[tauri::command]
pub fn npv_sensitivity_table(
    rate_pct: f64,
    initial_investment: f64,
    cash_flows: Vec<f64>,
) -> Result<CleanResult, String> {
    crate::features::finance::build_npv_sensitivity_table(rate_pct, initial_investment, cash_flows)
}

#[tauri::command]
pub fn internal_rate_of_return(request: IrrRequest) -> Result<IrrResult, String> {
    crate::features::finance::calculate_irr(request)
}
