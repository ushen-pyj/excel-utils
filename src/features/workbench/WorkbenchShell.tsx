"use client";

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  App,

  Button,
  Card,
  Col,
  Dropdown,
  Flex,
  Layout,
  Menu,
  MenuProps,
  Modal,
  Row,
  Space,
  Statistic,
  theme,
  Typography
} from "antd";
import {
  BgColorsOutlined,
  BorderOutlined,
  CloseOutlined,
  CopyOutlined,
  DownOutlined,
  FileExcelOutlined,
  FolderOpenOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MinusOutlined
} from "@ant-design/icons";
import { navItems } from "./constants";
import { RecentWorkbookEntry, StatusTone, ViewKey, WorkbookInfo } from "../shared/types";
import { COPY } from "../shared/copy";

const { Sider, Content } = Layout;
const { Paragraph, Text } = Typography;

export type ThemeMode = "default" | "dark" | "compact" | "dark-compact";

const themeOptions: Array<{ label: string; value: ThemeMode; desc: string }> = [
  { label: "默认", value: "default", desc: "平衡信息密度，适合大多数场景。" },
  { label: "暗色", value: "dark", desc: "夜间阅读更舒适，减少眩光。" },
  { label: "紧凑", value: "compact", desc: "更高信息密度，适合大量表格操作。" },
  { label: "暗色 + 紧凑", value: "dark-compact", desc: "暗色界面并保留高密度布局。" }
];

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

function workbookMenuItems(recentWorkbooks: RecentWorkbookEntry[], isOpenWorkbookPending: boolean): MenuProps["items"] {
  const recentItems = recentWorkbooks.map((item, index) => ({
    key: `recent:${index}`,
    icon: <FileExcelOutlined />,
    label: (
      <div className="workbench-menu__recent-item">
        <div className="workbench-menu__recent-name">{item.fileName}</div>
        <div className="workbench-menu__recent-path">{item.path}</div>
      </div>
    )
  }));

  return [
    {
      key: "import",
      icon: <FolderOpenOutlined />,
      disabled: isOpenWorkbookPending,
      label: COPY.actions.importWorkbook
    },
    {
      key: "theme",
      icon: <BgColorsOutlined />,
      label: "主题设置"
    },
    { type: "divider" },
    ...(recentItems.length > 0
      ? [
          {
            key: "recent-group",
            type: "group" as const,
            label: "最近打开",
            children: recentItems
          }
        ]
      : [{ key: "recent-empty", disabled: true, label: "暂无最近打开记录" }])
  ];
}

export function WorkbenchShell({
  activeView,
  onNavigate,
  workbookInfo,
  onOpenWorkbook,
  onOpenRecentWorkbook,
  recentWorkbooks,
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
  onOpenRecentWorkbook: (path: string) => Promise<void>;
  recentWorkbooks: RecentWorkbookEntry[];
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
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const lastStatus = useRef<string>("");

  const menuItems = useMemo(() => workbookMenuItems(recentWorkbooks, isOpenWorkbookPending), [recentWorkbooks, isOpenWorkbookPending]);

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
          <Button
            type="text"
            size="small"
            className="workbench-titlebar__toggle"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((prev) => !prev)}
          />

          <div className="workbench-appmark" aria-hidden>
            <FileExcelOutlined />
          </div>
          <Text strong>Excel Utils</Text>

          <Dropdown
            trigger={["click"]}
            menu={{
              items: menuItems,
              onClick: ({ key }) => {
                if (key === "import") {
                  void onOpenWorkbook();
                  return;
                }
                if (key === "theme") {
                  setThemeModalOpen(true);
                  return;
                }
                if (typeof key === "string" && key.startsWith("recent:")) {
                  const index = Number(key.split(":")[1]);
                  const target = recentWorkbooks[index];
                  if (target?.path) {
                    void onOpenRecentWorkbook(target.path);
                  }
                }
              }
            }}
          >
            <Button
              type="text"
              size="small"
              className="workbench-titlebar__menu-btn"
              icon={<MenuOutlined />}
              title={workbookInfo?.fileName ?? "未打开"}
            >
              <span className="workbench-titlebar__menu-label">{workbookInfo?.fileName ?? "未打开"}</span> <DownOutlined />
            </Button>
          </Dropdown>
        </div>

        <div className="workbench-titlebar__center" data-tauri-drag-region />

        <div className="workbench-titlebar__right">
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

      <Modal title="主题设置" open={themeModalOpen} onCancel={() => setThemeModalOpen(false)} footer={null} width={420}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {themeOptions.map((option) => (
            <Card
              key={option.value}
              size="small"
              className={themeMode === option.value ? "workbench-theme-card workbench-theme-card--active" : "workbench-theme-card"}
              onClick={() => {
                onThemeModeChange(option.value);
                setThemeModalOpen(false);
              }}
            >
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Text strong>{option.label}</Text>
                <Text type="secondary">{option.desc}</Text>
              </Space>
            </Card>
          ))}
        </Space>
      </Modal>
    </div>
  );
}

