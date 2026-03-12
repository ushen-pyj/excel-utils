import { Button, Col, Row, Space } from "antd";
import { InputField, MetricList, Panel, SummaryList, TableCard } from "../../components/ui";
import { useExcelWorkbench } from "../workbench/useExcelWorkbench";

export function FinanceSection({ workbench }: { workbench: ReturnType<typeof useExcelWorkbench> }) {
  return (
    <Space orientation="vertical" size="middle">
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Panel title="贷款月供 PMT" subtitle="同时支持输出完整摊还表。">
            <InputField label="本金" value={workbench.loanPrincipal} onChange={workbench.setLoanPrincipal} type="number" />
            <InputField label="年利率 (%)" value={workbench.loanRate} onChange={workbench.setLoanRate} type="number" step="0.01" />
            <InputField label="年限" value={workbench.loanYears} onChange={workbench.setLoanYears} type="number" />
            <InputField label="每年还款次数" value={workbench.loanPayments} onChange={workbench.setLoanPayments} type="number" />
            <Space>
              <Button type="primary" onClick={() => void workbench.calculateLoan()}>计算月供</Button>
              <Button onClick={() => void workbench.generateSchedule()}>生成摊还表</Button>
            </Space>
            <MetricList entries={workbench.loanMetrics} />
          </Panel>
        </Col>

        <Col xs={24} xl={8}>
          <Panel title="净现值 NPV" subtitle="支持输出敏感性分析表。">
            <InputField label="贴现率 (%)" value={workbench.npvRate} onChange={workbench.setNpvRate} type="number" step="0.01" />
            <InputField label="初始投资" value={workbench.npvInvestment} onChange={workbench.setNpvInvestment} type="number" />
            <InputField label="现金流（逗号分隔）" value={workbench.npvCashflows} onChange={workbench.setNpvCashflows} />
            <Space>
              <Button type="primary" onClick={() => void workbench.calculateNpv()}>计算 NPV</Button>
              <Button onClick={() => void workbench.generateSensitivity()}>生成敏感性表</Button>
            </Space>
            <MetricList entries={workbench.npvMetrics} />
          </Panel>
        </Col>

        <Col xs={24} xl={8}>
          <Panel title="内部收益率 IRR" subtitle="给出收益率与迭代次数。">
            <InputField label="现金流（首项通常为负）" value={workbench.irrCashflows} onChange={workbench.setIrrCashflows} />
            <InputField label="初始猜测 (%)" value={workbench.irrGuess} onChange={workbench.setIrrGuess} type="number" step="0.01" />
            <Button type="primary" onClick={() => void workbench.calculateIrr()}>计算 IRR</Button>
            <MetricList entries={workbench.irrMetrics} />
          </Panel>
        </Col>
      </Row>

      <Panel title="财务结果表" subtitle="可继续导入到数据清洗区进行后续加工。">
        <Button onClick={workbench.useFinanceTable}>载入到清洗区</Button>
        <SummaryList items={workbench.financeResult?.summary ?? []} fallback="先生成摊还表或敏感性分析表。" />
        <TableCard columns={workbench.financeResult?.columns ?? []} rows={workbench.financeResult?.rows ?? []} emptyText="等待财务结果" />
      </Panel>
    </Space>
  );
}

