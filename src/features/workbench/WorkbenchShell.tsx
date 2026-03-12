"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  App as AntApp,
  Button,
  Card,
  Col,
  ConfigProvider,
  Flex,
  Layout,
  Menu,
  Row,
  Segmented,
  Space,
  Statistic,
  Tag,
  Typography,
  theme as antdTheme
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
import { StatusTone, ViewKey } from "../shared/types";

const { Sider, Content } = Layout;
const { Paragraph, Text } = Typography;

type ThemeMode = "default" | "dark" | "compact" | "dark-compact";

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

function statusTagColor(tone: StatusTone): "default" | "success" | "warning" | "error" | "processing" {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "error") return "error";
  return "processing";
}

export function WorkbenchShell({
  activeView,
  onNavigate,
  status,
  stats,
  children
}: {
  activeView: ViewKey;
  onNavigate: (key: ViewKey) => void;
  status: { message: string; tone: StatusTone };
  stats: Array<{ label: string; value: string }>;
  children: ReactNode;
}) {
  const navMeta = navItems.find((item) => item.key === activeView) ?? navItems[0];
  const [themeMode, setThemeMode] = useState<ThemeMode>("default");
  const [collapsed, setCollapsed] = useState(false);
  const isDark = themeMode === "dark" || themeMode === "dark-compact";

  const themeAlgorithm = useMemo(() => {
    if (themeMode === "dark") return antdTheme.darkAlgorithm;
    if (themeMode === "compact") return antdTheme.compactAlgorithm;
    if (themeMode === "dark-compact") return [antdTheme.darkAlgorithm, antdTheme.compactAlgorithm];
    return antdTheme.defaultAlgorithm;
  }, [themeMode]);

  return (
    <ConfigProvider theme={{ algorithm: themeAlgorithm }}>
      <AntApp>
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
            <Flex vertical gap="small">
              <Card size="small" title={collapsed ? "Excel" : "Excel Utils"}>
                {!collapsed ? <Tag color={statusTagColor(status.tone)}>{status.message}</Tag> : null}
              </Card>
              <Menu
                mode="inline"
                theme={isDark ? "dark" : "light"}
                selectedKeys={[activeView]}
                onSelect={({ key }) => onNavigate(key as ViewKey)}
                items={navItems.map((item) => ({
                  key: item.key,
                  label: `${item.eyebrow} ${item.label}`
                }))}
              />
            </Flex>
          </Sider>

          <Layout>
            <Content style={{ overflow: "auto", height: "100vh" }}>
              <Row gutter={[0, 16]}>
                <Col span={24}>
                  <Card>
                    <Flex justify="space-between" align="center" data-tauri-drag-region>
                      <Space data-tauri-drag-region>
                        <Button
                          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                          onClick={() => setCollapsed((prev) => !prev)}
                        />
                        <Text strong>{navMeta.label}</Text>
                      </Space>
                      <Space data-tauri-drag-region>
                        <Segmented
                          value={themeMode}
                          onChange={(value) => setThemeMode(value as ThemeMode)}
                          options={[
                            { label: "默认", value: "default" },
                            { label: "暗色", value: "dark" },
                            { label: "紧凑", value: "compact" },
                            { label: "暗色+紧凑", value: "dark-compact" }
                          ]}
                        />
                        <WindowControls />
                      </Space>
                    </Flex>
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
      </AntApp>
    </ConfigProvider>
  );
}
