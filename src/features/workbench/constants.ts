import { NavItem } from "../shared/types";

export const navItems: NavItem[] = [
  { key: "dashboard", label: "总览", desc: "一眼看到当前流程状态与功能入口" },
  { key: "workbook", label: "工作簿", desc: "导入 Excel / CSV 并管理工作表" },
  { key: "cleaning", label: "数据清洗", desc: "列规则、去重、分列、合并" },
  { key: "batch", label: "批量处理", desc: "把同一套规则应用到多文件" },
  { key: "finance", label: "财务建模", desc: "PMT、NPV、IRR 与分析表" },
  { key: "print", label: "打印预览", desc: "生成适合直接打印的报表" }
];
