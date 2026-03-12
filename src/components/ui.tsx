import { ReactNode } from "react";
import { Button, Card, Empty, Form, Input, List, Select, Space, Statistic, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { BatchFileResult, CleanResult, MetricEntry, ViewKey } from "../features/shared/types";

const { Paragraph, Text } = Typography;

export function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <Space orientation="vertical" size="middle">
        <Paragraph type="secondary">{subtitle}</Paragraph>
        {children}
      </Space>
    </Card>
  );
}

export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="small">
      <Space orientation="vertical" size={4}>
        <Text type="secondary">{label}</Text>
        <Text>{value}</Text>
      </Space>
    </Card>
  );
}

export function MiniCard({ title, value }: { title: string; value: string }) {
  return (
    <Card size="small">
      <Statistic title={title} value={value} />
    </Card>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <Empty description={text} />;
}

export function SummaryList({ items, fallback }: { items: string[]; fallback: string }) {
  if (items.length === 0) return <EmptyState text={fallback} />;
  return <List size="small" bordered dataSource={items} renderItem={(item) => <List.Item>{item}</List.Item>} />;
}

export function TableCard({ columns, rows, emptyText }: { columns: string[]; rows: string[][]; emptyText: string }) {
  if (columns.length === 0) return <EmptyState text={emptyText} />;
  const tableColumns: ColumnsType<Record<string, string>> = columns.map((column, index) => ({
    title: column,
    dataIndex: `col_${index}`,
    key: `col_${index}`
  }));
  const dataSource = rows.map((row, rowIndex) => {
    const record: Record<string, string> = { key: `row_${rowIndex}` };
    row.forEach((cell, cellIndex) => {
      record[`col_${cellIndex}`] = cell;
    });
    return record;
  });
  return <Table size="small" columns={tableColumns} dataSource={dataSource} pagination={{ pageSize: 10 }} scroll={{ x: true }} />;
}

export function BatchTable({ results }: { results: BatchFileResult[] }) {
  if (results.length === 0) return <EmptyState text="选择文件和输出目录后开始运行。" />;
  const columns: ColumnsType<BatchFileResult> = [
    { title: "状态", dataIndex: "status", key: "status" },
    { title: "输入", dataIndex: "inputPath", key: "inputPath" },
    { title: "输出", dataIndex: "outputPath", key: "outputPath" },
    { title: "行数", dataIndex: "rowCount", key: "rowCount" },
    { title: "信息", dataIndex: "message", key: "message" }
  ];
  return <Table size="small" rowKey={(record) => `${record.inputPath}-${record.outputPath}`} columns={columns} dataSource={results} pagination={{ pageSize: 8 }} scroll={{ x: true }} />;
}

export function PlainTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (columns.length === 0) return null;
  const tableColumns: ColumnsType<Record<string, string>> = columns.map((column, index) => ({
    title: column,
    dataIndex: `col_${index}`,
    key: `col_${index}`
  }));
  const dataSource = rows.map((row, rowIndex) => {
    const record: Record<string, string> = { key: `print_${rowIndex}` };
    row.forEach((cell, cellIndex) => {
      record[`col_${cellIndex}`] = cell;
    });
    return record;
  });
  return <Table size="small" columns={tableColumns} dataSource={dataSource} pagination={false} scroll={{ x: true }} />;
}

export function MetricList({ entries }: { entries: MetricEntry[] }) {
  if (entries.length === 0) return <EmptyState text="执行计算后会在这里显示结果。" />;
  return (
    <List
      size="small"
      bordered
      dataSource={entries}
      renderItem={([label, value]) => (
        <List.Item>
          <Space>
            <Text type="secondary">{label}</Text>
            <Text strong>{value}</Text>
          </Space>
        </List.Item>
      )}
    />
  );
}

export function InputField({ label, value, onChange, type = "text", step }: { label: string; value: string; onChange: (value: string) => void; type?: string; step?: string; }) {
  return (
    <Form.Item label={label}>
      <Input value={value} type={type} step={step} onChange={(event) => onChange(event.target.value)} />
    </Form.Item>
  );
}

export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; }) {
  return (
    <Form.Item label={label}>
      <Select value={value} onChange={onChange} options={options} />
    </Form.Item>
  );
}

export function DashboardView({ dashboardCards, onNavigate, onOpenWorkbook, onRefreshPreview, currentTable, financeResult, batchResult }: { dashboardCards: Array<{ key: ViewKey; title: string; desc: string; metric: string }>; onNavigate: (key: ViewKey) => void; onOpenWorkbook: () => void; onRefreshPreview: () => Promise<void>; currentTable: CleanResult | null; financeResult: CleanResult | null; batchResult: { processed: number } | null; }) {
  return (
    <Space orientation="vertical" size="middle">
      <Card
        title="工作区快捷入口"
        extra={(
          <Space>
            <Button type="primary" onClick={onOpenWorkbook}>打开工作簿</Button>
            <Button onClick={() => void onRefreshPreview()}>刷新预览</Button>
          </Space>
        )}
      >
        <Space wrap>
          {dashboardCards.map((card) => (
            <Card key={card.key} title={card.title} extra={<Button type="link" onClick={() => onNavigate(card.key)}>进入</Button>}>
              <Space orientation="vertical">
                <Text type="secondary">{card.desc}</Text>
                <Text strong>{card.metric}</Text>
              </Space>
            </Card>
          ))}
        </Space>
      </Card>
      <Card title="当前工作流快照">
        <Space orientation="vertical">
          <MiniCard title="清洗区" value={currentTable ? `${currentTable.rows.length} 行，已可继续处理` : "当前还没有清洗结果"} />
          <MiniCard title="财务区" value={financeResult ? `${financeResult.rows.length} 行财务表已生成` : "还没有财务分析结果"} />
          <MiniCard title="批处理" value={batchResult ? `最近一次成功处理 ${batchResult.processed} 个文件` : "还没有批量执行记录"} />
        </Space>
      </Card>
    </Space>
  );
}

