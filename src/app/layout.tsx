import type { Metadata } from "next";
import { WorkbenchRoot } from "../features/workbench/WorkbenchRoot";
import "antd/dist/reset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Excel 工具箱",
  description: "基于 Next.js、Ant Design 与 Tauri 的 Excel 桌面工作台"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <WorkbenchRoot>{children}</WorkbenchRoot>
      </body>
    </html>
  );
}
