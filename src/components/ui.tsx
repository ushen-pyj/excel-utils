import { ReactNode } from "react";
import { actionButton, ghostButton, inputClass } from "../features/shared/utils";
import { BatchFileResult, CleanResult, MetricEntry, ViewKey } from "../features/shared/types";

export { actionButton, ghostButton, inputClass };

export function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="glass-panel rounded-[32px] p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-white">{title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function InfoCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl border border-white/8 bg-white/[0.04] px-5 py-4"><p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p><p className="mt-3 break-all text-sm leading-6 text-slate-200">{value}</p></div>;
}

export function MiniCard({ title, value }: { title: string; value: string }) {
  return <div className="rounded-3xl border border-white/8 bg-white/[0.04] px-5 py-4"><p className="text-xs uppercase tracking-[0.24em] text-slate-500">{title}</p><p className="mt-2 text-base font-semibold text-white">{value}</p></div>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="grid min-h-[160px] place-items-center rounded-[28px] border border-dashed border-white/12 bg-white/[0.03] px-6 text-center text-sm leading-6 text-slate-400">{text}</div>;
}

export function SummaryList({ items, fallback }: { items: string[]; fallback: string }) {
  if (items.length === 0) return <EmptyState text={fallback} />;
  return <ul className="mb-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function TableCard({ columns, rows, emptyText }: { columns: string[]; rows: string[][]; emptyText: string }) {
  if (columns.length === 0) return <EmptyState text={emptyText} />;
  return <div className="scrollbar-thin overflow-auto rounded-[28px] border border-white/8 bg-slate-950/30"><table className="min-w-full border-collapse text-sm"><thead><tr className="bg-amber-300/10 text-left text-slate-200">{columns.map((column) => <th key={column} className="border-b border-white/8 px-4 py-3 font-medium">{column}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`} className="border-b border-white/6 text-slate-300 last:border-b-0">{row.map((cell, cellIndex) => <td key={`cell-${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-4 py-3">{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function BatchTable({ results }: { results: BatchFileResult[] }) {
  if (results.length === 0) return <EmptyState text="选择文件与输出目录后开始运行。" />;
  return <div className="scrollbar-thin overflow-auto rounded-[28px] border border-white/8 bg-slate-950/30"><table className="min-w-full border-collapse text-sm"><thead><tr className="bg-amber-300/10 text-left text-slate-200"><th className="border-b border-white/8 px-4 py-3 font-medium">状态</th><th className="border-b border-white/8 px-4 py-3 font-medium">输入</th><th className="border-b border-white/8 px-4 py-3 font-medium">输出</th><th className="border-b border-white/8 px-4 py-3 font-medium">行数</th><th className="border-b border-white/8 px-4 py-3 font-medium">信息</th></tr></thead><tbody>{results.map((item) => <tr key={`${item.inputPath}-${item.outputPath}`} className="border-b border-white/6 text-slate-300 last:border-b-0"><td className="px-4 py-3">{item.status}</td><td className="px-4 py-3">{item.inputPath}</td><td className="px-4 py-3">{item.outputPath}</td><td className="px-4 py-3">{item.rowCount}</td><td className="px-4 py-3">{item.message}</td></tr>)}</tbody></table></div>;
}

export function PlainTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (columns.length === 0) return null;
  return <div className="overflow-auto rounded-3xl border border-slate-200"><table className="min-w-full border-collapse text-sm"><thead><tr className="bg-slate-100 text-left text-slate-700">{columns.map((column) => <th key={column} className="border-b border-slate-200 px-4 py-3 font-medium">{column}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`print-row-${rowIndex}`} className="border-b border-slate-200 last:border-b-0">{row.map((cell, cellIndex) => <td key={`print-cell-${rowIndex}-${cellIndex}`} className="px-4 py-3 text-slate-700">{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function MetricList({ entries }: { entries: MetricEntry[] }) {
  if (entries.length === 0) return <EmptyState text="执行计算后会在这里显示结果。" />;
  return <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-4">{entries.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 border-b border-white/8 py-3 text-sm last:border-b-0 last:pb-0 first:pt-0"><span className="text-slate-400">{label}</span><strong className="text-base text-white">{value}</strong></div>)}</div>;
}

export function InputField({ label, value, onChange, type = "text", step }: { label: string; value: string; onChange: (value: string) => void; type?: string; step?: string; }) {
  return <label className="grid gap-2"><span className="text-sm font-medium text-slate-200">{label}</span><input className={inputClass} value={value} type={type} step={step} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; }) {
  return <label className="grid gap-2"><span className="text-sm font-medium text-slate-200">{label}</span><select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function DashboardView({ cardClass, dashboardCards, onNavigate, onOpenWorkbook, onRefreshPreview, currentTable, financeResult, batchResult }: { cardClass: string; dashboardCards: Array<{ key: ViewKey; title: string; desc: string; metric: string }>; onNavigate: (key: ViewKey) => void; onOpenWorkbook: () => void; onRefreshPreview: () => Promise<void>; currentTable: CleanResult | null; financeResult: CleanResult | null; batchResult: { processed: number } | null; }) {
  return <div className="grid gap-4"><div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]"><div className={`${cardClass} rounded-[32px] p-6`}><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.24em] text-slate-400">Workspace</p><h3 className="mt-2 text-2xl font-semibold text-white">功能分区导航</h3></div><div className="flex flex-wrap gap-3"><button type="button" className={actionButton} onClick={onOpenWorkbook}>打开工作簿</button><button type="button" className={ghostButton} onClick={() => void onRefreshPreview()}>刷新预览</button></div></div><div className="mt-6 grid gap-4 md:grid-cols-2">{dashboardCards.map((card, index) => <button key={card.key} type="button" onClick={() => onNavigate(card.key)} className="rounded-[26px] border border-white/8 bg-white/[0.04] p-5 text-left transition hover:-translate-y-1 hover:border-amber-300/30 hover:bg-white/[0.06]" style={{ animationDelay: `${index * 120}ms` }}><p className="text-xs uppercase tracking-[0.24em] text-slate-500">模块</p><h4 className="mt-3 text-xl font-semibold text-white">{card.title}</h4><p className="mt-2 text-sm leading-6 text-slate-400">{card.desc}</p><div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/30 px-4 py-3 text-sm text-amber-200">{card.metric}</div></button>)}</div></div><div className={`${cardClass} rounded-[32px] p-6`}><p className="text-xs uppercase tracking-[0.24em] text-slate-400">Live Feed</p><h3 className="mt-2 text-2xl font-semibold text-white">当前工作流快照</h3><div className="mt-6 grid gap-4"><MiniCard title="清洗区" value={currentTable ? `${currentTable.rows.length} 行，准备继续加工` : "当前还没有清洗结果"} /><MiniCard title="财务区" value={financeResult ? `${financeResult.rows.length} 行财务表已生成` : "还没有财务分析结果"} /><MiniCard title="批处理" value={batchResult ? `最近一次成功 ${batchResult.processed} 个文件` : "还没有批量执行记录"} /></div></div></div></div>;
}