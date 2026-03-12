import { Button, Card, Col, Row, Space, Typography } from "antd";
import { BatchTable, EmptyState, InfoCard, Panel, SummaryList } from "../../components/ui";
import { useExcelWorkbench } from "../workbench/useExcelWorkbench";

const { Text } = Typography;

export function BatchSection({ workbench }: { workbench: ReturnType<typeof useExcelWorkbench> }) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={10}>
        <Panel title="批量处理控制台" subtitle="选文件、设输出目录，复用当前规则链一键执行。">
          <Space wrap>
            <Button type="primary" onClick={() => void workbench.pickBatchFiles()}>选择多个文件</Button>
            <Button onClick={() => void workbench.pickBatchOutputDir()}>选择输出目录</Button>
            <Button onClick={() => void workbench.runBatch()}>开始批量处理</Button>
          </Space>
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <InfoCard label="输出目录" value={workbench.batchOutputDir || "尚未选择输出目录"} />
            </Col>
            <Col xs={24} md={12}>
              <InfoCard label="批量规则" value={`${workbench.selectedColumnName || "未绑定列"} · ${workbench.effectiveRules.length} 步规则`} />
            </Col>
          </Row>
          <Space orientation="vertical">
            {workbench.batchFiles.length ? (
              workbench.batchFiles.map((file) => (
                <Card key={file} size="small">
                  <Text>{file}</Text>
                </Card>
              ))
            ) : (
              <EmptyState text="选择多个文件后，这里会列出待处理清单。" />
            )}
          </Space>
        </Panel>
      </Col>
      <Col xs={24} xl={14}>
        <Panel title="批量处理结果" subtitle="查看每个文件的输出状态、路径与错误信息。">
          <SummaryList
            items={workbench.batchResult ? [`成功 ${workbench.batchResult.processed} 个文件`, `失败 ${workbench.batchResult.failed} 个文件`] : []}
            fallback="还没有批量执行记录。"
          />
          <BatchTable results={workbench.batchResult?.results ?? []} />
        </Panel>
      </Col>
    </Row>
  );
}

