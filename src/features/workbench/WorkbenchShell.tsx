"use client";

import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  App,
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
  theme,
  Typography
} from "antd";
import {
  BorderOutlined,
  CloseOutlined,
  CopyOutlined,
  FileExcelOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MinusOutlined
} from "@ant-design/icons";
import { navItems } from "./constants";
import { StatusTone, ViewKey, WorkbookInfo } from "../shared/types";
import { COPY } from "../shared/copy";

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
    <Space size={0} className="workbench-window-controls">
      <Button
        type="text"
        className="workbench-window-controls__btn"
        aria-label="最小化窗口"
        icon={<MinusOutlined />}
        onClick={() => void appWindow.minimize()}
      />
      <Button
        type="text"
        className="workbench-window-controls__btn"
        aria-label={isMaximized ? "还原窗口" : "最大化窗口"}
        icon={isMaximized ? <CopyOutlined /> : <BorderOutlined />}
        onClick={() => void appWindow.toggleMaximize()}
      />
      <Button
        type="text"
        className="workbench-window-controls__btn workbench-window-controls__btn--close"
        aria-label="关闭窗口"
        icon={<CloseOutlined />}
        onClick={() => void appWindow.close()}
      />
    </Space>
  );
}

function messageType(tone: StatusTone): "success" | "warning" | "error" {
  if (tone === "warning") return "warning";
  if (tone === "error") return "error";
  return "success";
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
  status,
  isOpenWorkbookPending,
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
  status: { message: string; tone: StatusTone };
  isOpenWorkbookPending: boolean;
  children: ReactNode;
}) {
  const navMeta = navItems.find((item) => item.key === activeView) ?? navItems[0];
  const [collapsed, setCollapsed] = useState(false);
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const lastStatus = useRef<string>("");

  useEffect(() => {
    const signature = `${status.tone}:${status.message}`;
    if (signature === lastStatus.current) {
      return;
    }
    lastStatus.current = signature;

    if (status.tone === "info") {
      return;
    }

    void message.open({
      type: messageType(status.tone),
      content: status.message,
      duration: 2
    });
  }, [message, status.message, status.tone]);

  const shellStyle = {
    "--wb-titlebar-bg": token.colorBgContainer,
    "--wb-border-color": token.colorBorderSecondary,
    "--wb-appmark-fg": token.colorPrimary,
    "--wb-appmark-bg": token.colorFillSecondary,
    "--wb-control-hover-bg": token.colorFillTertiary
  } as CSSProperties;

  return (
    <div className="workbench-shell" style={shellStyle}>
      <header className="workbench-titlebar" data-tauri-drag-region>
        <div className="workbench-titlebar__left" data-tauri-drag-region>
          <div className="workbench-appmark" aria-hidden>
            <FileExcelOutlined />
          </div>
          <Text strong>Excel Utils</Text>
          <Button
            type="text"
            size="small"
            className="workbench-titlebar__toggle"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((prev) => !prev)}
          />
          <Text type="secondary">{navMeta.label}</Text>
        </div>

        <div className="workbench-titlebar__center" data-tauri-drag-region>
          {workbookInfo ? (
            <Space className="workbench-titlebar__workbook">
              <Badge status="success" />
              <Text>{workbookInfo.fileName}</Text>
            </Space>
          ) : (
            <Button
              type="primary"
              size="small"
              className="workbench-titlebar__primary"
              loading={isOpenWorkbookPending}
              onClick={() => void onOpenWorkbook()}
            >
              {COPY.actions.importWorkbook}
            </Button>
          )}
        </div>

        <div className="workbench-titlebar__right">
          <Segmented
            className="workbench-titlebar__segmented"
            size="small"
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
        </div>
      </header>

      <Layout hasSider className="workbench-main">
        <Sider
          width={232}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          collapsedWidth={72}
          trigger={null}
          theme={isDark ? "dark" : "light"}
        >
          <Flex vertical gap="small" style={{ paddingBlock: 8 }}>
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
          <Content className="workbench-content">
            <Row gutter={[0, 16]}>
              <Col span={24}>
                <Card title={navMeta.label}>
                  <Paragraph type="secondary">{navMeta.desc}</Paragraph>
                  <Row gutter={[12, 12]}>
                    {stats.map((item) => (
                      <Col key={item.label} xs={24} sm={12} lg={6}>
                        <Statistic title={item.label} value={item.value} />
                      </Col>
                    ))}
                  </Row>
                </Card>
              </Col>

              <Col span={24}>
                <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
                  <Text type="secondary">当前模块内容</Text>
                  {children}
                </Space>
              </Col>
            </Row>
          </Content>
        </Layout>
      </Layout>
    </div>
  );
}



