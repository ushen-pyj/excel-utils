"use client";

import { ReactNode, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Badge,
  Button,
  Card,
  Col,
  Flex,
  Layout,
  Menu,
  Row,
  Segmented,
  Space,
  Statistic,
  Typography
} from "antd";
import {
  BorderOutlined,
  CloseOutlined,
  CopyOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MinusOutlined
} from "@ant-design/icons";
import { navItems } from "./constants";
import { ViewKey, WorkbookInfo } from "../shared/types";

const { Sider, Content } = Layout;
const { Paragraph, Text } = Typography;

export type ThemeMode = "default" | "dark" | "compact" | "dark-compact";

function WindowControls() {
  const [isTauriWindow, setIsTauriWindow] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    const appWindow = getCurrentWindow();
    setIsTauriWindow(true);

    let unlisten: (() => void) | undefined;

    void appWindow.isMaximized().then(setIsMaximized).catch(() => undefined);
    void appWindow
      .onResized(async () => {
        try {
          setIsMaximized(await appWindow.isMaximized());
        } catch {
          // Ignore window state sync issues outside Tauri.
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      unlisten?.();
    };
  }, []);

  if (!isTauriWindow) {
    return null;
  }

  const appWindow = getCurrentWindow();

  return (
    <Space data-tauri-drag-region>
      <Button aria-label="最小化窗口" icon={<MinusOutlined />} onClick={() => void appWindow.minimize()} />
      <Button
        aria-label={isMaximized ? "还原窗口" : "最大化窗口"}
        icon={isMaximized ? <CopyOutlined /> : <BorderOutlined />}
        onClick={() => void appWindow.toggleMaximize()}
      />
      <Button danger aria-label="关闭窗口" icon={<CloseOutlined />} onClick={() => void appWindow.close()} />
    </Space>
  );
}

export function WorkbenchShell({
  activeView,
  onNavigate,
  workbookInfo,
  onOpenWorkbook,
  stats,
  themeMode,
  onThemeModeChange,
  isDark,
  children
}: {
  activeView: ViewKey;
  onNavigate: (key: ViewKey) => void;
  workbookInfo: WorkbookInfo | null;
  onOpenWorkbook: () => Promise<void>;
  stats: Array<{ label: string; value: string }>;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  isDark: boolean;
  children: ReactNode;
}) {
  const navMeta = navItems.find((item) => item.key === activeView) ?? navItems[0];
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout hasSider style={{ minHeight: "100vh" }}>
      <Sider
        width={232}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        collapsedWidth={72}
        trigger={null}
        theme={isDark ? "dark" : "light"}
      >
        <Flex vertical gap="small" style={{ paddingBlock: 12 }}>
          <Text strong style={{ paddingInline: 16, color: isDark ? "rgba(255,255,255,0.92)" : undefined }}>
            {collapsed ? "Excel" : "Excel Utils"}
          </Text>
          <Menu
            mode="inline"
            theme={isDark ? "dark" : "light"}
            selectedKeys={[activeView]}
            onSelect={({ key }) => onNavigate(key as ViewKey)}
            items={navItems.map((item) => ({
              key: item.key,
              label: item.label
            }))}
          />
        </Flex>
      </Sider>

      <Layout>
        <Content style={{ overflow: "auto", height: "100vh" }}>
          <Row gutter={[0, 16]}>
            <Col span={24}>
              <Card>
                <div
                  data-tauri-drag-region
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    columnGap: 12
                  }}
                >
                  <Space data-tauri-drag-region>
                    <Button
                      icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                      onClick={() => setCollapsed((prev) => !prev)}
                    />
                    <Text strong>{navMeta.label}</Text>
                  </Space>

                  {workbookInfo ? (
                    <Space>
                      <Badge status="success" />
                      <Text strong>{workbookInfo.fileName}</Text>
                    </Space>
                  ) : (
                    <Button type="primary" onClick={() => void onOpenWorkbook()}>
                      打开工作簿
                    </Button>
                  )}

                  <Space data-tauri-drag-region style={{ justifySelf: "end" }}>
                    <Segmented
                      value={themeMode}
                      onChange={(value) => onThemeModeChange(value as ThemeMode)}
                      options={[
                        { label: "默认", value: "default" },
                        { label: "暗色", value: "dark" },
                        { label: "紧凑", value: "compact" },
                        { label: "暗色+紧凑", value: "dark-compact" }
                      ]}
                    />
                    <WindowControls />
                  </Space>
                </div>
              </Card>
            </Col>

            <Col span={24}>
              <Card title={navMeta.label}>
                <Paragraph type="secondary">{navMeta.desc}</Paragraph>
                <Row gutter={[12, 12]}>
                  {stats.map((item) => (
                    <Col key={item.label} xs={24} sm={12} lg={6}>
                      <Card size="small">
                        <Statistic title={item.label} value={item.value} />
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Card>
            </Col>

            <Col span={24}>
              <Card>
                <Space orientation="vertical" size="middle">
                  <Text type="secondary">当前模块内容</Text>
                  {children}
                </Space>
              </Card>
            </Col>
          </Row>
        </Content>
      </Layout>
    </Layout>
  );
}
