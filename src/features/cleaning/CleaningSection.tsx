import { Button, Card, Checkbox, Col, Form, Input, Row, Select, Space, Typography } from "antd";
import { EmptyState, MiniCard, Panel, SummaryList, TableCard } from "../../components/ui";
import { columnOptions, describeRule } from "../shared/utils";
import { useExcelWorkbench } from "../workbench/useExcelWorkbench";

const { Text } = Typography;

export function CleaningSection({ workbench }: { workbench: ReturnType<typeof useExcelWorkbench> }) {
  return (
    <Space orientation="vertical" size="middle">
      <Panel title="数据清洗工作台" subtitle="把输入、规则和结果拆分成独立区域，减少操作切换成本。">
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={15}>
            <Form layout="vertical">
              <Form.Item label="表格内容">
                <Input.TextArea value={workbench.tableRaw} onChange={(event) => workbench.setTableRaw(event.target.value)} placeholder="姓名\t部门\t地区" rows={10} />
              </Form.Item>
              <Row gutter={[12, 12]}>
                <Col xs={24} md={8}>
                  <Form.Item label="分隔符">
                    <Select
                      value={workbench.tableDelimiter}
                      onChange={workbench.setTableDelimiter}
                      options={[
                        { value: "tab", label: "Tab" },
                        { value: ",", label: "逗号" },
                        { value: ";", label: "分号" },
                        { value: "|", label: "竖线" }
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="首行类型">
                    <Checkbox checked={workbench.hasHeader} onChange={(event) => workbench.setHasHeader(event.target.checked)}>首行是表头</Checkbox>
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Space>
                    <Button type="primary" onClick={() => void workbench.refreshPreview()}>刷新预览</Button>
                    <Button onClick={() => void workbench.exportCurrentTable("xlsx")}>导出 XLSX</Button>
                    <Button onClick={() => void workbench.copyCsv()}>复制 CSV</Button>
                  </Space>
                </Col>
              </Row>
            </Form>
          </Col>
          <Col xs={24} xl={9}>
            <Space orientation="vertical">
              <MiniCard title="当前列绑定" value={workbench.selectedColumnName || "等待识别"} />
              <MiniCard title="规则链" value={workbench.effectiveRules.map((rule) => describeRule(rule)).join(" -> ") || "未配置"} />
              <MiniCard title="当前数据量" value={workbench.currentTable ? `${workbench.currentTable.rows.length} 行 / ${workbench.currentTable.columns.length} 列` : "未预览"} />
            </Space>
          </Col>
        </Row>
      </Panel>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12} xxl={6}>
          <Panel title="列规则" subtitle="按列做规范化处理，也支持规则链。">
            <Form layout="vertical">
              <Form.Item label="目标列">
                <Select value={workbench.ruleColumnIndex} onChange={workbench.setRuleColumnIndex} options={columnOptions(workbench.columns)} />
              </Form.Item>
              <Form.Item label="规则类型">
                <Select
                  value={workbench.ruleType}
                  onChange={workbench.setRuleType}
                  options={[
                    { value: "trim", label: "去首尾空格" },
                    { value: "uppercase", label: "转大写" },
                    { value: "lowercase", label: "转小写" },
                    { value: "fill-empty", label: "空值填充" },
                    { value: "format-number", label: "数字格式化" }
                  ]}
                />
              </Form.Item>
              <Form.Item label="填充值">
                <Input value={workbench.ruleFill} onChange={(event) => workbench.setRuleFill(event.target.value)} />
              </Form.Item>
              <Form.Item label="保留小数位">
                <Input type="number" min={0} value={workbench.ruleDecimals} onChange={(event) => workbench.setRuleDecimals(event.target.value)} />
              </Form.Item>
              <Space wrap>
                <Button onClick={workbench.addRuleToChain}>加入规则链</Button>
                <Button type="primary" onClick={() => void workbench.runColumnRule()}>应用当前规则</Button>
                <Button onClick={() => void workbench.runRuleChain()}>应用规则链</Button>
              </Space>
            </Form>
          </Panel>
        </Col>

        <Col xs={24} xl={12} xxl={6}>
          <Panel title="重复值处理" subtitle="按整行或指定列去重。">
            <Space orientation="vertical">
              <Select
                value={workbench.dedupeColumnIndex}
                onChange={workbench.setDedupeColumnIndex}
                options={[{ value: "__all__", label: "整行" }, ...columnOptions(workbench.columns)]}
              />
              <Button type="primary" onClick={() => void workbench.dedupeRows()}>执行去重</Button>
            </Space>
          </Panel>
        </Col>

        <Col xs={24} xl={12} xxl={6}>
          <Panel title="分列" subtitle="按指定分隔符拆分列内容。">
            <Form layout="vertical">
              <Form.Item label="目标列">
                <Select value={workbench.splitColumnIndex} onChange={workbench.setSplitColumnIndex} options={columnOptions(workbench.columns)} />
              </Form.Item>
              <Form.Item label="拆分符">
                <Input value={workbench.splitDelimiter} onChange={(event) => workbench.setSplitDelimiter(event.target.value)} />
              </Form.Item>
              <Button type="primary" onClick={() => void workbench.splitColumn()}>执行分列</Button>
            </Form>
          </Panel>
        </Col>

        <Col xs={24} xl={12} xxl={6}>
          <Panel title="合并列" subtitle="从多列拼出新字段。">
            <Form layout="vertical">
              <Form.Item label="目标列">
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
                  <EmptyState text="载入数据后可按列名勾选。" />
                )}
              </Form.Item>
              <Form.Item label="连接符">
                <Input value={workbench.mergeDelimiter} onChange={(event) => workbench.setMergeDelimiter(event.target.value)} />
              </Form.Item>
              <Form.Item label="新列名称">
                <Input value={workbench.mergeName} onChange={(event) => workbench.setMergeName(event.target.value)} />
              </Form.Item>
              <Button type="primary" onClick={() => void workbench.mergeColumns()}>执行合并</Button>
            </Form>
          </Panel>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Panel title="规则链面板" subtitle="批处理会直接复用这里的顺序。">
            {workbench.ruleChain.length ? (
              <Space orientation="vertical">
                <Button onClick={() => workbench.updateRuleChain("clear")}>清空</Button>
                {workbench.ruleChain.map((rule, index) => (
                  <Card key={rule.id} size="small" title={`${index + 1}. ${rule.ruleType}`}>
                    <Space orientation="vertical">
                      <Text type="secondary">{describeRule(rule)}</Text>
                      <Space wrap>
                        <Button disabled={index === 0} onClick={() => workbench.updateRuleChain("up", rule.id)}>上移</Button>
                        <Button disabled={index === workbench.ruleChain.length - 1} onClick={() => workbench.updateRuleChain("down", rule.id)}>下移</Button>
                        <Button danger onClick={() => workbench.updateRuleChain("remove", rule.id)}>删除</Button>
                      </Space>
                    </Space>
                  </Card>
                ))}
              </Space>
            ) : (
              <EmptyState text="尚未添加规则，批处理会回退到当前单步规则。" />
            )}
          </Panel>
        </Col>
        <Col xs={24} xl={14}>
          <Panel title="处理结果" subtitle="预览清洗后的表格数据。">
            <SummaryList items={workbench.currentTable?.summary ?? []} fallback="先刷新预览或执行清洗动作。" />
            <TableCard columns={workbench.currentTable?.columns ?? []} rows={workbench.currentTable?.rows ?? []} emptyText="等待生成结果" />
          </Panel>
        </Col>
      </Row>
    </Space>
  );
}

