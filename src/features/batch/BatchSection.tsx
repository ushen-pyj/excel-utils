import { Button, Card, Col, Collapse, Popconfirm, Row, Space, Typography } from "antd";
import { BatchTable, EmptyState, InfoCard, Panel, SummaryList } from "../../components/ui";
import { useExcelWorkbench } from "../workbench/useExcelWorkbench";
import { COPY } from "../shared/copy";

const { Text } = Typography;

export function BatchSection({ workbench }: { workbench: ReturnType<typeof useExcelWorkbench> }) {
  const canRunBatch = workbench.batchFiles.length > 0 && Boolean(workbench.batchOutputDir) && Boolean(workbench.selectedColumnName);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={10}>
        <Panel title="批量处理控制台" subtitle="先准备输入，再确认执行。">
          <Space wrap>
            <Button onClick={() => void workbench.pickBatchFiles()}>选择多个文件</Button>
            <Button onClick={() => void workbench.pickBatchOutputDir()}>选择输出目录</Button>
            <Popconfirm
              title={COPY.confirm.batchRunTitle}
              description={COPY.confirm.batchRunDescription}
              okText={COPY.confirm.confirm}
              cancelText={COPY.confirm.cancel}
              disabled={!canRunBatch}
              onConfirm={() => void workbench.runBatch()}
            >
              <Button type="primary" loading={workbench.isPending("runBatch")} disabled={!canRunBatch}>{COPY.actions.executeBatch}</Button>
            </Popconfirm>
          </Space>

          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <InfoCard label="输出目录" value={workbench.batchOutputDir || "尚未选择输出目录"} />
            </Col>
            <Col xs={24} md={12}>
              <InfoCard label="批量规则" value={`${workbench.selectedColumnName || "未绑定列"} · ${workbench.effectiveRules.length} 步规则`} />
            </Col>
          </Row>

          <Collapse
            items={[
              {
                key: "batch-files",
                label: `待处理文件清单（${workbench.batchFiles.length}）`,
                children: workbench.batchFiles.length ? (
                  <Space orientation="vertical">
                    {workbench.batchFiles.map((file) => (
                      <Card key={file} size="small">
                        <Text>{file}</Text>
                      </Card>
                    ))}
                  </Space>
                ) : (
                  <EmptyState text="选择多个文件后，这里会列出待处理清单。" />
                )
              }
            ]}
          />
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



