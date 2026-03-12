pub fn format_decimal(value: f64) -> String {
    format!("{value:.2}")
}

pub fn format_number_cell(value: &str, decimals: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        String::new()
    } else if let Ok(number) = trimmed.parse::<f64>() {
        format!("{number:.prec$}", prec = decimals)
    } else {
        value.to_string()
    }
}

pub fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}
