import { Button, Card, Col, Empty, InputNumber, Row, Select, Space, Typography } from "antd";
import { InfoCard, Panel } from "../../components/ui";
import { useExcelWorkbench } from "../workbench/useExcelWorkbench";

const { Text } = Typography;

export function WorkbookSection({ workbench }: { workbench: ReturnType<typeof useExcelWorkbench> }) {
  return (
    <Space orientation="vertical" size="middle">
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Panel title="工作簿导入台" subtitle="连接本地 Excel / CSV，管理文件信息与工作表入口。">
            <Space wrap>
              <Button type="primary" onClick={workbench.openWorkbook}>打开工作簿</Button>
              <Button onClick={() => void workbench.loadSheet()}>载入当前工作表</Button>
              <Button onClick={() => void workbench.exportCurrentTable("xlsx")}>导出 XLSX</Button>
              <Button onClick={() => void workbench.exportCurrentTable("csv")}>导出 CSV</Button>
            </Space>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}>
                <InfoCard label="文件路径" value={workbench.workbookInfo?.path ?? "尚未选择文件"} />
              </Col>
              <Col xs={24} md={12}>
                <InfoCard
                  label="文件概况"
                  value={workbench.workbookInfo ? `${workbench.workbookInfo.kind.toUpperCase()} · ${workbench.workbookInfo.sheets.length} 个工作表` : "等待导入"}
                />
              </Col>
            </Row>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={16}>
                <Text>工作表</Text>
                <Select
                  value={workbench.selectedSheet}
                  onChange={workbench.setSelectedSheet}
                  options={workbench.workbookInfo?.sheets.length
                    ? workbench.workbookInfo.sheets.map((sheet) => ({
                        value: sheet.name,
                        label: `${sheet.name} (${sheet.rowCount} 行 / ${sheet.columnCount} 列)`
                      }))
                    : [{ value: "", label: "等待文件" }]}
                />
              </Col>
              <Col xs={24} md={8}>
                <Text>预览行数</Text>
                <InputNumber min={5} value={Number(workbench.sheetLimit)} onChange={(value) => workbench.setSheetLimit(String(value ?? 200))} />
              </Col>
            </Row>
          </Panel>
        </Col>
        <Col xs={24} xl={10}>
          <Panel title="工作表清单" subtitle="快速确认文件结构，进入数据清洗流程。">
            <Space orientation="vertical" size="small">
              {workbench.workbookInfo?.sheets.length ? (
                workbench.workbookInfo.sheets.map((sheet) => (
                  <Card key={sheet.name} size="small" title={sheet.name} extra={<Text type="secondary">{sheet.rowCount} 行</Text>}>
                    <Space>
                      <Text type="secondary">{sheet.columnCount} 列</Text>
                      <Button
                        type="link"
                        onClick={() => {
                          workbench.setSelectedSheet(sheet.name);
                          workbench.setActiveView("workbook");
                        }}
                      >
                        选择
                      </Button>
                    </Space>
                  </Card>
                ))
              ) : (
                <Empty description="导入工作簿后，这里会列出所有工作表。" />
              )}
            </Space>
          </Panel>
        </Col>
      </Row>
    </Space>
  );
}

