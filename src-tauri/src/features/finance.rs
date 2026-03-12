use crate::common::formatting::format_decimal;
use crate::common::table::build_clean_result;
use crate::models::{CleanResult, IrrRequest, IrrResult, LoanRequest, LoanResult, NpvRequest, NpvResult};

pub fn loan_payment_details(request: LoanRequest) -> Result<LoanResult, String> {
    validate_loan_request(&request)?;
    let periods = request.years * request.payments_per_year;
    let payment = periodic_payment(&request);
    let total_payment = payment * periods;

    Ok(LoanResult {
        payment,
        total_payment,
        total_interest: total_payment - request.principal,
    })
}

pub fn loan_amortization_table(request: LoanRequest) -> Result<CleanResult, String> {
    validate_loan_request(&request)?;
    let payment = periodic_payment(&request);
    let periodic_rate = request.annual_rate_pct / 100.0 / request.payments_per_year;
    let periods = (request.years * request.payments_per_year).round() as usize;
    let mut balance = request.principal;
    let mut rows = Vec::with_capacity(periods);

    for period in 1..=periods {
        let interest = if periodic_rate.abs() < f64::EPSILON {
            0.0
        } else {
            balance * periodic_rate
        };
        let principal = if period == periods {
            balance
        } else {
            (payment - interest).min(balance)
        };
        balance = (balance - principal).max(0.0);
        rows.push(vec![
            period.to_string(),
            format_decimal(payment),
            format_decimal(principal),
            format_decimal(interest),
            format_decimal(balance),
        ]);
    }

    Ok(build_clean_result(
        vec![
            "Period".to_string(),
            "Payment".to_string(),
            "Principal".to_string(),
            "Interest".to_string(),
            "RemainingBalance".to_string(),
        ],
        rows,
        vec![
            format!("Principal: {}", format_decimal(request.principal)),
            format!("Periodic payment: {}", format_decimal(payment)),
            format!("Periods: {periods}"),
        ],
    ))
}

pub fn calculate_npv(request: NpvRequest) -> Result<NpvResult, String> {
    if request.cash_flows.is_empty() {
        return Err("Please provide at least one cash flow".to_string());
    }

    Ok(NpvResult {
        npv: compute_npv(
            request.rate_pct / 100.0,
            request.initial_investment,
            &request.cash_flows,
        ),
    })
}

pub fn build_npv_sensitivity_table(
    rate_pct: f64,
    initial_investment: f64,
    cash_flows: Vec<f64>,
) -> Result<CleanResult, String> {
    if cash_flows.is_empty() {
        return Err("Please provide at least one cash flow".to_string());
    }

    let offsets = [-3.0_f64, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0];
    let rows = offsets
        .iter()
        .map(|offset| {
            let rate = (rate_pct + offset).max(0.0);
            let npv = compute_npv(rate / 100.0, initial_investment, &cash_flows);
            vec![format_decimal(rate), format_decimal(npv)]
        })
        .collect::<Vec<_>>();

    Ok(build_clean_result(
        vec!["DiscountRatePct".to_string(), "NPV".to_string()],
        rows,
        vec![
            format!("Base rate: {}", format_decimal(rate_pct)),
            format!("Investment: {}", format_decimal(initial_investment)),
            format!("Cash flow periods: {}", cash_flows.len()),
        ],
    ))
}

pub fn calculate_irr(request: IrrRequest) -> Result<IrrResult, String> {
    if request.cash_flows.len() < 2 {
        return Err("IRR requires at least two cash flow periods".to_string());
    }

    let mut rate = request.guess_pct / 100.0;
    for iteration in 1..=100_u32 {
        let (npv, derivative) = npv_and_derivative(&request.cash_flows, rate);
        if derivative.abs() < 1e-10 {
            return Err("IRR failed because the derivative became too small".to_string());
        }

        let next = rate - npv / derivative;
        if (next - rate).abs() < 1e-7_f64 {
            return Ok(IrrResult {
                irr_pct: next * 100.0,
                iterations: iteration,
            });
        }
        rate = next;
    }

    Err("IRR did not converge within 100 iterations".to_string())
}

fn validate_loan_request(request: &LoanRequest) -> Result<(), String> {
    if request.principal <= 0.0 || request.years <= 0.0 || request.payments_per_year <= 0.0 {
        Err("Principal, years, and payments per year must be greater than 0".to_string())
    } else {
        Ok(())
    }
}

fn periodic_payment(request: &LoanRequest) -> f64 {
    let periods = request.years * request.payments_per_year;
    let rate = request.annual_rate_pct / 100.0 / request.payments_per_year;

    if rate.abs() < f64::EPSILON {
        request.principal / periods
    } else {
        let factor = (1.0 + rate).powf(periods);
        request.principal * rate * factor / (factor - 1.0)
    }
}

fn compute_npv(rate: f64, initial_investment: f64, cash_flows: &[f64]) -> f64 {
    cash_flows.iter().enumerate().fold(-initial_investment, |acc, (idx, value)| {
        acc + value / (1.0 + rate).powi((idx as i32) + 1)
    })
}

fn npv_and_derivative(cash_flows: &[f64], rate: f64) -> (f64, f64) {
    let mut npv = 0.0;
    let mut derivative = 0.0;

    for (period, cash_flow) in cash_flows.iter().enumerate() {
        let period = period as i32;
        let factor = (1.0 + rate).powi(period);
        npv += cash_flow / factor;
        if period > 0 {
            derivative -= (period as f64) * cash_flow / (1.0 + rate).powi(period + 1);
        }
    }

    (npv, derivative)
}
