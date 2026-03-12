import { Button, Card, Col, List, Row, Space, Typography } from "antd";
import { EmptyState, InputField, Panel, PlainTable } from "../../components/ui";
import { useExcelWorkbench } from "../workbench/useExcelWorkbench";
import { COPY } from "../shared/copy";

const { Text, Title } = Typography;

export function PrintSection({ workbench }: { workbench: ReturnType<typeof useExcelWorkbench> }) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={8}>
        <Panel title="打印配置" subtitle="从文本输入或已载入数据生成打印预览。">
          <InputField label="打印标题" value={workbench.printTitle} onChange={workbench.setPrintTitle} />
          <Space>
            <Button type="primary" loading={workbench.isPending("previewPrint")} onClick={() => void workbench.previewPrint()}>{COPY.actions.generatePreview}</Button>
            <Button loading={workbench.isPending("printNow")} onClick={() => void workbench.printNow()}>{COPY.actions.executePrint}</Button>
          </Space>
          <Card size="small">
            <Text type="secondary">打印区会自动使用当前文本输入或已载入的工作表内容，并保留摘要信息。</Text>
          </Card>
        </Panel>
      </Col>

      <Col xs={24} xl={16}>
        <Panel title="打印预览" subtitle="展示最终的打印版结构。">
          {workbench.printResult ? (
            <Card title={<Title level={4}>{workbench.printResult.title}</Title>} extra={<Text type="secondary">{workbench.printResult.generatedAt}</Text>}>
              <List size="small" bordered dataSource={workbench.printResult.summary} renderItem={(item) => <List.Item>{item}</List.Item>} />
              <PlainTable columns={workbench.printResult.columns} rows={workbench.printResult.rows} />
            </Card>
          ) : (
            <EmptyState text={COPY.empty.printPreviewMissing} />
          )}
        </Panel>
      </Col>
    </Row>
  );
}



