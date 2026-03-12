import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Excel 工具箱",
  description: "基于 Next.js、Tailwind CSS 与 Tauri 的 Excel 桌面工作台"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
