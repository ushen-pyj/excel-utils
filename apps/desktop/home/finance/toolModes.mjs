export const modes = [
  { id: "merge", title: "合并明细", description: "对齐不同模板的列，将各部门、各月份的明细汇入一张表。" },
  { id: "summary", title: "分类汇总", description: "按部门、科目或类别统计笔数和金额。" },
  { id: "compare", title: "两表对账", description: "核对两份台账的单号和金额，定位差额、重复及单边记录。" },
];
export const display = cell => cell?.w ?? String(cell?.v ?? "");

export const analysisModes = [
  { id: "unpivot", title: "宽表转明细", description: "把横向排列的月份或项目列展开，每个金额单独占一行。" },
  { id: "aging", title: "往来账龄", description: "将单据与逐笔核销记录配对，按截止日还原未结余额和逾期天数。" },
  { id: "variance", title: "预算差异", description: "按相同期间与项目汇总两份明细，查看实际支出、预算与差额。" },
];

export const fieldList = {
  merge: [],
  summary: [["group", "分组列"], ["amount", "金额列（元）"]],
  compare: [["key", "核对键"], ["amount", "金额列（元）"]],
  unpivot: [],
  aging: [
    [["key","单据号"],["party","往来单位"],["date","单据日期"],["due","到期日"],["amount","单据金额"]],
    [["key","对应单据号"],["date","核销日期"],["amount","核销金额"]],
  ],
  variance: [["period","期间"],["group","预算项目"],["amount","金额列（元）"]],
};

export function fieldsFor(mode, index) {
  return mode === "aging" ? fieldList.aging[Math.min(index, 1)] : fieldList[mode] ?? [];
}
