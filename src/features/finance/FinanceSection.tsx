import { Button, Col, Row, Space } from "antd";
import { InputField, MetricList, Panel, SummaryList, TableCard } from "../../components/ui";
import { COPY } from "../shared/copy";
import { useExcelWorkbench } from "../workbench/useExcelWorkbench";

export function FinanceSection({ workbench }: { workbench: ReturnType<typeof useExcelWorkbench> }) {
  return (
    <Space orientation="vertical" size="middle">
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Panel title={COPY.finance.sections.loan.title} subtitle={COPY.finance.sections.loan.subtitle}>
            <InputField label={COPY.finance.sections.loan.labels.principal} value={workbench.loanPrincipal} onChange={workbench.setLoanPrincipal} type="number" />
            <InputField label={COPY.finance.sections.loan.labels.annualRate} value={workbench.loanRate} onChange={workbench.setLoanRate} type="number" step="0.01" />
            <InputField label={COPY.finance.sections.loan.labels.years} value={workbench.loanYears} onChange={workbench.setLoanYears} type="number" />
            <InputField label={COPY.finance.sections.loan.labels.paymentsPerYear} value={workbench.loanPayments} onChange={workbench.setLoanPayments} type="number" />
            <Space>
              <Button type="primary" loading={workbench.isPending("calculateLoan")} onClick={() => void workbench.calculateLoan()}>{COPY.finance.sections.loan.actions.calculate}</Button>
              <Button loading={workbench.isPending("generateSchedule")} onClick={() => void workbench.generateSchedule()}>{COPY.finance.sections.loan.actions.generateSchedule}</Button>
            </Space>
            <MetricList entries={workbench.loanMetrics} />
          </Panel>
        </Col>

        <Col xs={24} xl={8}>
          <Panel title={COPY.finance.sections.npv.title} subtitle={COPY.finance.sections.npv.subtitle}>
            <InputField label={COPY.finance.sections.npv.labels.rate} value={workbench.npvRate} onChange={workbench.setNpvRate} type="number" step="0.01" />
            <InputField label={COPY.finance.sections.npv.labels.investment} value={workbench.npvInvestment} onChange={workbench.setNpvInvestment} type="number" />
            <InputField label={COPY.finance.sections.npv.labels.cashflows} value={workbench.npvCashflows} onChange={workbench.setNpvCashflows} />
            <Space>
              <Button type="primary" loading={workbench.isPending("calculateNpv")} onClick={() => void workbench.calculateNpv()}>{COPY.finance.sections.npv.actions.calculate}</Button>
              <Button loading={workbench.isPending("generateSensitivity")} onClick={() => void workbench.generateSensitivity()}>{COPY.finance.sections.npv.actions.generateSensitivity}</Button>
            </Space>
            <MetricList entries={workbench.npvMetrics} />
          </Panel>
        </Col>

        <Col xs={24} xl={8}>
          <Panel title={COPY.finance.sections.irr.title} subtitle={COPY.finance.sections.irr.subtitle}>
            <InputField label={COPY.finance.sections.irr.labels.cashflows} value={workbench.irrCashflows} onChange={workbench.setIrrCashflows} />
            <InputField label={COPY.finance.sections.irr.labels.guess} value={workbench.irrGuess} onChange={workbench.setIrrGuess} type="number" step="0.01" />
            <Button type="primary" loading={workbench.isPending("calculateIrr")} onClick={() => void workbench.calculateIrr()}>{COPY.finance.sections.irr.actions.calculate}</Button>
            <MetricList entries={workbench.irrMetrics} />
          </Panel>
        </Col>
      </Row>

      <Panel title={COPY.finance.result.title} subtitle={COPY.finance.result.subtitle}>
        <Button onClick={workbench.useFinanceTable}>{COPY.finance.result.loadToCleaning}</Button>
        <SummaryList items={workbench.financeResult?.summary ?? []} fallback={COPY.finance.result.summaryFallback} />
        <TableCard columns={workbench.financeResult?.columns ?? []} rows={workbench.financeResult?.rows ?? []} emptyText={COPY.finance.result.tableEmpty} />
      </Panel>
    </Space>
  );
}
