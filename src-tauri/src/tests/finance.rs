use crate::{
    internal_rate_of_return, loan_amortization_schedule, loan_payment, net_present_value,
    npv_sensitivity_table, IrrRequest, LoanRequest, NpvRequest,
};

fn approx_eq(left: f64, right: f64, tolerance: f64) {
    assert!(
        (left - right).abs() <= tolerance,
        "left={left}, right={right}, tolerance={tolerance}"
    );
}

#[test]
fn loan_payment_returns_expected_amounts() {
    let result = loan_payment(LoanRequest {
        principal: 500_000.0,
        annual_rate_pct: 3.2,
        years: 20.0,
        payments_per_year: 12.0,
    })
    .expect("loan payment");

    approx_eq(result.payment, 2823.31, 0.05);
    approx_eq(result.total_payment, result.payment * 240.0, 0.05);
    approx_eq(result.total_interest, result.total_payment - 500_000.0, 0.05);
}

#[test]
fn loan_amortization_schedule_generates_full_table() {
    let result = loan_amortization_schedule(LoanRequest {
        principal: 120_000.0,
        annual_rate_pct: 4.8,
        years: 1.0,
        payments_per_year: 12.0,
    })
    .expect("amortization schedule");

    assert_eq!(result.columns, vec!["Period", "Payment", "Principal", "Interest", "RemainingBalance"]);
    assert_eq!(result.rows.len(), 12);
    assert_eq!(result.rows.first().expect("first row")[0], "1");
    assert_eq!(result.rows.last().expect("last row")[4], "0.00");
}

#[test]
fn net_present_value_matches_discounted_cash_flow() {
    let result = net_present_value(NpvRequest {
        rate_pct: 8.0,
        initial_investment: 100_000.0,
        cash_flows: vec![30_000.0, 32_000.0, 36_000.0, 38_000.0, 42_000.0],
    })
    .expect("npv");

    approx_eq(result.npv, 40_306.21, 0.5);
}

#[test]
fn npv_sensitivity_table_expands_around_base_rate() {
    let result = npv_sensitivity_table(8.0, 100_000.0, vec![30_000.0, 32_000.0, 36_000.0, 38_000.0, 42_000.0])
        .expect("sensitivity table");

    assert_eq!(result.columns, vec!["DiscountRatePct", "NPV"]);
    assert_eq!(result.rows.len(), 7);
    assert_eq!(result.rows[3][0], "8.00");
    assert!(result.summary.iter().any(|item| item.contains("Cash flow periods: 5")));
}

#[test]
fn internal_rate_of_return_converges_for_standard_cashflows() {
    let result = internal_rate_of_return(IrrRequest {
        cash_flows: vec![-100_000.0, 30_000.0, 32_000.0, 36_000.0, 38_000.0, 42_000.0],
        guess_pct: 10.0,
    })
    .expect("irr");

    approx_eq(result.irr_pct, 21.39, 0.2);
    assert!(result.iterations > 0);
    assert!(result.iterations <= 100);
}

#[test]
fn finance_functions_reject_invalid_requests() {
    let loan_error = loan_payment(LoanRequest {
        principal: 0.0,
        annual_rate_pct: 3.2,
        years: 20.0,
        payments_per_year: 12.0,
    })
    .expect_err("invalid loan should fail");
    let npv_error = net_present_value(NpvRequest {
        rate_pct: 8.0,
        initial_investment: 100_000.0,
        cash_flows: vec![],
    })
    .expect_err("empty npv should fail");
    let irr_error = internal_rate_of_return(IrrRequest {
        cash_flows: vec![100.0],
        guess_pct: 10.0,
    })
    .expect_err("short irr should fail");

    assert!(loan_error.contains("greater than 0"));
    assert!(npv_error.contains("at least one cash flow"));
    assert!(irr_error.contains("at least two cash flow periods"));
}
