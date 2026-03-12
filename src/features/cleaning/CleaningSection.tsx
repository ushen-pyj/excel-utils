import { Button, Card, Checkbox, Collapse, Form, Input, Row, Select, Space, Typography } from "antd";
import { EmptyState, MiniCard, Panel, SummaryList, TableCard } from "../../components/ui";
import { COPY } from "../shared/copy";
import { columnOptions, describeRule } from "../shared/utils";
import { useExcelWorkbench } from "../workbench/useExcelWorkbench";

const { Text } = Typography;

export function CleaningSection({ workbench }: { workbench: ReturnType<typeof useExcelWorkbench> }) {
  const hasColumns = workbench.columns.length > 0;
  const hasCurrentTable = Boolean(workbench.currentTable);

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Panel title={COPY.cleaning.panelTitle} subtitle={COPY.cleaning.panelSubtitle}>
        <Form layout="vertical">
          <Form.Item label={COPY.cleaning.rawLabel}>
            <Input.TextArea value={workbench.tableRaw} onChange={(event) => workbench.setTableRaw(event.target.value)} placeholder={COPY.cleaning.rawPlaceholder} rows={10} />
          </Form.Item>
          <Row gutter={[12, 12]}>
            <Form.Item style={{ minWidth: 180 }} label={COPY.cleaning.delimiterLabel}>
              <Select value={workbench.tableDelimiter} onChange={workbench.setTableDelimiter} options={[...COPY.cleaning.delimiterOptions]} />
            </Form.Item>
            <Form.Item label={COPY.cleaning.firstRowLabel}>
              <Checkbox checked={workbench.hasHeader} onChange={(event) => workbench.setHasHeader(event.target.checked)}>{COPY.cleaning.headerCheckbox}</Checkbox>
            </Form.Item>
            <Form.Item label={COPY.cleaning.operationLabel}>
              <Space>
                <Button disabled={!hasCurrentTable} onClick={() => void workbench.exportCurrentTable("xlsx")}>{COPY.actions.exportXlsx}</Button>
                <Button disabled={!hasCurrentTable} onClick={() => void workbench.copyCsv()}>{COPY.actions.copyCsv}</Button>
                <Button type="primary" loading={workbench.isPending("refreshPreview")} onClick={() => void workbench.refreshPreview()}>{COPY.actions.refreshPreview}</Button>
              </Space>
            </Form.Item>
          </Row>
        </Form>

        <Space wrap>
          <MiniCard title={COPY.cleaning.mini.currentColumn} value={workbench.selectedColumnName || COPY.cleaning.mini.currentColumnFallback} />
          <MiniCard title={COPY.cleaning.mini.ruleChain} value={workbench.effectiveRules.map((rule) => describeRule(rule)).join(" -> ") || COPY.cleaning.mini.ruleChainFallback} />
          <MiniCard title={COPY.cleaning.mini.dataSize} value={workbench.currentTable ? COPY.cleaning.mini.dataSizeValue(workbench.currentTable.rows.length, workbench.currentTable.columns.length) : COPY.cleaning.mini.dataSizeFallback} />
        </Space>
      </Panel>

      <Panel title={COPY.cleaning.advancedTitle} subtitle={COPY.cleaning.advancedSubtitle}>
        <Collapse
          defaultActiveKey={["column-rule"]}
          items={[
            {
              key: "column-rule",
              label: COPY.cleaning.sections.columnRule,
              children: (
                <Form layout="vertical">
                  <Form.Item label={COPY.cleaning.labels.targetColumn}>
                    <Select value={workbench.ruleColumnIndex} onChange={workbench.setRuleColumnIndex} options={columnOptions(workbench.columns)} />
                  </Form.Item>
                  <Form.Item label={COPY.cleaning.labels.ruleType}>
                    <Select value={workbench.ruleType} onChange={workbench.setRuleType} options={[...COPY.cleaning.ruleTypeOptions]} />
                  </Form.Item>
                  <Form.Item label={COPY.cleaning.labels.fillValue}>
                    <Input value={workbench.ruleFill} onChange={(event) => workbench.setRuleFill(event.target.value)} />
                  </Form.Item>
                  <Form.Item label={COPY.cleaning.labels.decimals}>
                    <Input type="number" min={0} value={workbench.ruleDecimals} onChange={(event) => workbench.setRuleDecimals(event.target.value)} />
                  </Form.Item>
                  <Space wrap>
                    <Button disabled={!hasColumns} onClick={workbench.addRuleToChain}>{COPY.cleaning.actions.addRule}</Button>
                    <Button disabled={!hasColumns} type="primary" onClick={() => void workbench.runColumnRule()}>{COPY.cleaning.actions.applyCurrentRule}</Button>
                    <Button disabled={!hasColumns} onClick={() => void workbench.runRuleChain()}>{COPY.cleaning.actions.applyRuleChain}</Button>
                  </Space>
                </Form>
              )
            },
            {
              key: "dedupe",
              label: COPY.cleaning.sections.dedupe,
              children: (
                <Space orientation="vertical">
                  <Select
                    value={workbench.dedupeColumnIndex}
                    onChange={workbench.setDedupeColumnIndex}
                    options={[{ value: "__all__", label: COPY.cleaning.dedupeAllRows }, ...columnOptions(workbench.columns)]}
                  />
                  <Button disabled={!hasColumns} type="primary" onClick={() => void workbench.dedupeRows()}>{COPY.cleaning.actions.executeDedupe}</Button>
                </Space>
              )
            },
            {
              key: "split",
              label: COPY.cleaning.sections.split,
              children: (
                <Form layout="vertical">
                  <Form.Item label={COPY.cleaning.labels.targetColumn}>
                    <Select value={workbench.splitColumnIndex} onChange={workbench.setSplitColumnIndex} options={columnOptions(workbench.columns)} />
                  </Form.Item>
                  <Form.Item label={COPY.cleaning.labels.splitBy}>
                    <Input value={workbench.splitDelimiter} onChange={(event) => workbench.setSplitDelimiter(event.target.value)} />
                  </Form.Item>
                  <Button disabled={!hasColumns} type="primary" onClick={() => void workbench.splitColumn()}>{COPY.cleaning.actions.executeSplit}</Button>
                </Form>
              )
            },
            {
              key: "merge",
              label: COPY.cleaning.sections.merge,
              children: (
                <Form layout="vertical">
                  <Form.Item label={COPY.cleaning.labels.targetColumn}>
                    {workbench.columns.length ? (
                      <Checkbox.Group
                        value={workbench.mergeSelection}
                        options={workbench.columns.map((column, index) => ({ label: column, value: index }))}
                        onChange={(values) => {
                          const selectedValues = values.map((value) => Number(value));
                          workbench.columns.forEach((_, index) => {
                            const selected = selectedValues.includes(index);
                            const current = workbench.mergeSelection.includes(index);
                            if (selected !== current) {
                              workbench.toggleMergeColumn(index);
                            }
                          });
                        }}
                      />
                    ) : (
                      <EmptyState text={COPY.cleaning.mergeColumnHint} />
                    )}
                  </Form.Item>
                  <Form.Item label={COPY.cleaning.labels.joinBy}>
                    <Input value={workbench.mergeDelimiter} onChange={(event) => workbench.setMergeDelimiter(event.target.value)} />
                  </Form.Item>
                  <Form.Item label={COPY.cleaning.labels.newColumnName}>
                    <Input value={workbench.mergeName} onChange={(event) => workbench.setMergeName(event.target.value)} />
                  </Form.Item>
                  <Button
                    disabled={!hasColumns || workbench.mergeSelection.length === 0 || workbench.mergeName.trim().length === 0}
                    type="primary"
                    onClick={() => void workbench.mergeColumns()}
                  >
                    {COPY.cleaning.actions.executeMerge}
                  </Button>
                </Form>
              )
            },
            {
              key: "rule-chain",
              label: COPY.cleaning.sections.ruleChain,
              children: workbench.ruleChain.length ? (
                <Space orientation="vertical">
                  <Button onClick={() => workbench.updateRuleChain("clear")}>{COPY.cleaning.actions.clearRuleChain}</Button>
                  {workbench.ruleChain.map((rule, index) => (
                    <Card key={rule.id} size="small" title={`${index + 1}. ${rule.ruleType}`}>
                      <Space orientation="vertical">
                        <Text type="secondary">{describeRule(rule)}</Text>
                        <Space wrap>
                          <Button disabled={index === 0} onClick={() => workbench.updateRuleChain("up", rule.id)}>{COPY.cleaning.actions.moveUp}</Button>
                          <Button disabled={index === workbench.ruleChain.length - 1} onClick={() => workbench.updateRuleChain("down", rule.id)}>{COPY.cleaning.actions.moveDown}</Button>
                          <Button danger onClick={() => workbench.updateRuleChain("remove", rule.id)}>{COPY.cleaning.actions.remove}</Button>
                        </Space>
                      </Space>
                    </Card>
                  ))}
                </Space>
              ) : (
                <EmptyState text={COPY.cleaning.ruleChainEmpty} />
              )
            }
          ]}
        />
      </Panel>

      <Panel title={COPY.cleaning.resultTitle} subtitle={COPY.cleaning.resultSubtitle}>
        <SummaryList items={workbench.currentTable?.summary ?? []} fallback={COPY.cleaning.resultFallback} />
        <TableCard columns={workbench.currentTable?.columns ?? []} rows={workbench.currentTable?.rows ?? []} emptyText={COPY.cleaning.resultEmptyText} />
      </Panel>
    </Space>
  );
}



