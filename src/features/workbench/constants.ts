import { NavItem } from "../shared/types";

export const navItems: NavItem[] = [
  { key: "dashboard", label: "总览", eyebrow: "00", desc: "一眼看到当前流程状态与功能入口" },
  { key: "workbook", label: "工作簿", eyebrow: "01", desc: "导入 Excel / CSV 并管理工作表" },
  { key: "cleaning", label: "数据清洗", eyebrow: "02", desc: "列规则、去重、分列、合并" },
  { key: "batch", label: "批量处理", eyebrow: "03", desc: "把同一套规则应用到多文件" },
  { key: "finance", label: "财务建模", eyebrow: "04", desc: "PMT、NPV、IRR 与分析表" },
  { key: "print", label: "打印预览", eyebrow: "05", desc: "生成适合直接打印的报表" }
];