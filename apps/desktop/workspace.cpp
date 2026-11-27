#include "workbook_window.h"
#include "workspace_search.h"
#include "workspace_ui.h"
#include <QButtonGroup>
#include <QComboBox>
#include <QDesktopServices>
#include <QDir>
#include <QEasingCurve>
#include <QFileDialog>
#include <QFileSystemModel>
#include <QFrame>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLabel>
#include <QLineEdit>
#include <QMenu>
#include <QPushButton>
#include <QSettings>
#include <QShortcut>
#include <QSplitter>
#include <QStandardPaths>
#include <QTabBar>
#include <QToolButton>
#include <QUrl>
#include <QVariantAnimation>
#include <QVBoxLayout>

namespace {
QString settingsFile() {
    const auto profile = qEnvironmentVariable("EXCELUTILS_PROFILE",
        QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation));
    return QDir(profile).filePath("workspaces.ini");
}
}

void WorkbookWindow::restoreWorkspaceOnStartup() {
    if (QSettings(settingsFile(), QSettings::IniFormat).value("resumeWorkspace").toBool()) showWorkspace();
}

void WorkbookWindow::showWorkspace(const QString& initialRoot) {
    if (workspacePage_) {
        if (!initialRoot.isEmpty()) selectWorkspace(initialRoot);
        tabs_.setCurrentWidget(workspacePage_);
        return;
    }
    workspacePage_ = new QWidget(&tabs_);
    workspacePage_->setObjectName("workspacePage");
    const int index = tabs_.addTab(workspacePage_, QIcon(":/window-chrome/folder-open.svg"), QStringLiteral("工作区"));
    tabs_.tabBar()->setTabButton(index, QTabBar::RightSide, nullptr);
    auto* layout = new QVBoxLayout(workspacePage_);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(0);

    // ── Top Command Bar ──
    const double s = ExcelUi::scaleFor(this);
    auto* toolbarBar = new QWidget(workspacePage_);
    toolbarBar->setObjectName("workspaceToolbar");
    auto* toolbar = new QHBoxLayout(toolbarBar);
    toolbar->setContentsMargins(qRound(12 * s), qRound(6 * s), qRound(12 * s), qRound(6 * s));
    toolbar->setSpacing(qRound(8 * s));

    workspacePicker_ = new QComboBox(toolbarBar);
    workspacePicker_->setMinimumWidth(qRound(176 * s));
    workspacePicker_->setMaximumWidth(qRound(260 * s));
    workspacePicker_->setIconSize(QSize(qRound(15 * s), qRound(15 * s)));
    workspacePicker_->setSizeAdjustPolicy(QComboBox::AdjustToMinimumContentsLengthWithIcon);
    workspacePicker_->setAccessibleName(QStringLiteral("最近工作区"));
    workspacePicker_->setCursor(Qt::PointingHandCursor);
    toolbar->addWidget(workspacePicker_);

    auto* browse = new QPushButton(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/folder-outline.svg"), ExcelUi::currentTheme().iconNormal, 18),
                                   QStringLiteral("打开文件夹"), toolbarBar);
    workspaceBrowseButton_ = browse;
    browse->setObjectName("workspaceActionBtn");
    browse->setIconSize(QSize(qRound(15 * s), qRound(15 * s)));
    browse->setToolTip(QStringLiteral("选择新的本地文件夹作为工作区"));
    browse->setCursor(Qt::PointingHandCursor);
    toolbar->addWidget(browse);
    connect(browse, &QPushButton::clicked, this, [this] {
        const auto path = QFileDialog::getExistingDirectory(this, QStringLiteral("打开工作区文件夹"), workspaceRoot_);
        if (!path.isEmpty()) selectWorkspace(path);
    });

    toolbar->addStretch(1);

    quickOpenButton_ = new ExcelUi::CommandSearchPill(toolbarBar);
    quickOpenButton_->setPlaceholder(QStringLiteral("快速打开工作簿…"));
    quickOpenButton_->setShortcutHint(QStringLiteral("Ctrl+Shift+O"));
    quickOpenButton_->setAccessibleName(QStringLiteral("快速打开"));
    quickOpenButton_->setToolTip(QStringLiteral("按文件名或相对路径快速打开工作簿（Ctrl+Shift+O）"));
    quickOpenButton_->setMinimumWidth(qRound(280 * s));
    quickOpenButton_->setMaximumWidth(qRound(440 * s));
    toolbar->addWidget(quickOpenButton_, 2);
    connect(quickOpenButton_, &QPushButton::clicked, this, &WorkbookWindow::quickOpenWorkbook);
    auto* quickOpen = new QShortcut(QKeySequence("Ctrl+Shift+O"), workspacePage_);
    quickOpen->setContext(Qt::WidgetWithChildrenShortcut);
    connect(quickOpen, &QShortcut::activated, this, &WorkbookWindow::quickOpenWorkbook);

    toolbar->addStretch(1);

    auto* tools = new QToolButton(toolbarBar);
    workspaceToolsButton_ = tools;
    tools->setObjectName("workspaceToolsButton");
    tools->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/tools.svg"), ExcelUi::currentTheme().accent, 20));
    tools->setText(QStringLiteral("财务工具"));
    tools->setToolButtonStyle(Qt::ToolButtonTextBesideIcon);
    auto* menu = new QMenu(tools);
    menu->setObjectName("workspacePopupMenu");
    tools->setMenu(menu);
    tools->setEnabled(!workspaceToolCatalog_.value("tools").toArray().isEmpty());
    connect(menu, &QMenu::aboutToShow, this, [this, menu] {
        menu->clear();
        const auto busy = workspaceToolCatalog_.value("busyMode").toString();
        for (const auto& item : workspaceToolCatalog_.value("tools").toArray()) {
            const auto tool = item.toObject();
            const auto id = tool.value("id").toString();
            auto* action = menu->addAction(tool.value("title").toString());
            action->setData(id);
            action->setEnabled(busy.isEmpty() || busy == id);
        }
    });
    connect(menu, &QMenu::triggered, this, [this](QAction* action) {
        launchWorkspaceTool(action->data().toString(), action->text());
    });
    tools->setPopupMode(QToolButton::InstantPopup);
    tools->setAccessibleName(QStringLiteral("工具"));
    tools->setToolTip(QStringLiteral("在当前工作区打开财务与数据工具"));
    tools->setCursor(Qt::PointingHandCursor);
    tools->setIconSize(QSize(16, 16));
    toolbar->addWidget(tools);
    layout->addWidget(toolbarBar);

    // ── Main Workbench Body (Animated Rail + Collapsible Animated Sidebar + Editor/Welcome) ──
    auto* body = new QHBoxLayout;
    body->setSpacing(0);
    layout->addLayout(body, 1);

    workspaceRail_ = new ExcelUi::AnimatedActivityRail(workspacePage_);
    workspaceViews_ = new QButtonGroup(this);
    auto addView = [&](bool search, const QString& name, const QString& icon, const QString& keys) {
        auto* button = new QToolButton(workspaceRail_);
        button->setObjectName("railNavBtn");
        button->setCheckable(true);
        button->setCursor(Qt::PointingHandCursor);
        QIcon stateIcon;
        stateIcon.addFile(":/window-chrome/" + icon + ".svg", QSize(), QIcon::Normal, QIcon::Off);
        stateIcon.addFile(":/window-chrome/" + icon + "-active.svg", QSize(), QIcon::Normal, QIcon::On);
        button->setIcon(stateIcon);
        button->setAccessibleName(name);
        button->setToolTip(name + " (" + keys + ")");
        const int id = search ? 1 : 0;
        workspaceViews_->addButton(button, id);
        workspaceRail_->registerViewButton(id, button);
        connect(button, &QToolButton::clicked, this, [this, search] { setWorkspaceView(search); });
        auto* shortcut = new QShortcut(QKeySequence(keys), workspacePage_);
        shortcut->setContext(Qt::WidgetWithChildrenShortcut);
        connect(shortcut, &QShortcut::activated, this, [this, search] { setWorkspaceView(search); });
    };
    addView(false, QStringLiteral("文件"), "files", "Ctrl+Shift+E");
    addView(true, QStringLiteral("搜索"), "search", "Ctrl+Shift+F");

    auto* collapseSidebarBtn = new QToolButton(workspaceRail_);
    collapseSidebarBtn->setObjectName("railToggleBtn");
    collapseSidebarBtn->setCursor(Qt::PointingHandCursor);
    collapseSidebarBtn->setAccessibleName(QStringLiteral("切换侧边栏"));
    collapseSidebarBtn->setToolTip(QStringLiteral("折叠/展开侧边栏 (Ctrl+B)"));
    connect(collapseSidebarBtn, &QToolButton::clicked, this, &WorkbookWindow::toggleWorkspaceSidebar);
    workspaceRail_->setToggleButton(collapseSidebarBtn);

    auto* settingsBtn = new QToolButton(workspaceRail_);
    settingsBtn->setObjectName("railSettingsBtn");
    settingsBtn->setCursor(Qt::PointingHandCursor);
    settingsBtn->setAccessibleName(QStringLiteral("外观设置"));
    settingsBtn->setToolTip(QStringLiteral("外观与主题色设置"));
    connect(settingsBtn, &QToolButton::clicked, this, [this, settingsBtn] {
        const QPoint anchor = settingsBtn->mapToGlobal(QPoint(settingsBtn->width() + ExcelUi::scaled(this, 10), settingsBtn->height()));
        openThemeSettings(anchor);
    });
    workspaceRail_->setSettingsButton(settingsBtn);
    workspaceRail_->applyTheme();
    workspaceRail_->updateScale();

    auto* toggleSidebarShortcut = new QShortcut(QKeySequence("Ctrl+B"), workspacePage_);
    toggleSidebarShortcut->setContext(Qt::WidgetWithChildrenShortcut);
    connect(toggleSidebarShortcut, &QShortcut::activated, this, &WorkbookWindow::toggleWorkspaceSidebar);

    body->addWidget(workspaceRail_);

    workspaceSplitter_ = new QSplitter(workspacePage_);
    workspaceSplitter_->setObjectName("workspaceSplitter");
    workspaceSplitter_->setHandleWidth(1);
    workspaceSplitter_->setChildrenCollapsible(false);
    body->addWidget(workspaceSplitter_, 1);

    workspaceSidebar_ = new ExcelUi::AnimatedSidebarStack(workspaceSplitter_);
    workspaceSidebar_->setObjectName("workspaceSidebar");
    workspaceSidebar_->setMinimumWidth(qRound(228 * s));
    workspaceSidebar_->addWidget(makeWorkspaceExplorer());
    workspaceSearch_ = new WorkspaceSearch(
        [this](const QString& path, const QString& sheet, const QString& address, bool hidden) {
            openSearchHit(path, sheet, address, hidden);
        }, [this] { setWorkspaceView(false); }, workspaceSidebar_);
    workspaceSidebar_->addWidget(workspaceSearch_);
    workspaceViews_->button(0)->setChecked(true);
    workspaceRail_->setActiveId(0, false);

    auto* right = new QWidget(workspaceSplitter_);
    auto* content = new QVBoxLayout(right);
    content->setContentsMargins(0, 0, 0, 0);
    content->setSpacing(0);

    workspaceTabs_ = new QTabWidget(right);
    workspaceTabs_->setObjectName("workspaceTabs");
    workspaceTabs_->setDocumentMode(true);
    workspaceTabs_->setTabsClosable(true);
    workspaceTabs_->setElideMode(Qt::ElideMiddle);
    workspaceTabs_->tabBar()->setDrawBase(false);
    workspaceTabs_->tabBar()->setExpanding(false);
    workspaceTabs_->tabBar()->setContextMenuPolicy(Qt::CustomContextMenu);
    connect(workspaceTabs_->tabBar(), &QTabBar::customContextMenuRequested, this, &WorkbookWindow::showWorkspaceTabMenu);
    connect(workspaceTabs_, &QTabWidget::currentChanged, this, [this] {
        QTimer::singleShot(0, this, &WorkbookWindow::revealWorkspaceBook);
    });
    connect(&tabs_, &QTabWidget::currentChanged, this, [this] {
        QTimer::singleShot(0, this, &WorkbookWindow::revealWorkspaceBook);
    });
    for (bool previous : {false, true}) {
        auto* shortcut = new QShortcut(QKeySequence(previous ? "Ctrl+Shift+Tab" : "Ctrl+Tab"), workspacePage_);
        shortcut->setContext(Qt::WidgetWithChildrenShortcut);
        connect(shortcut, &QShortcut::activated, this, [this, previous] { cycleWorkspaceTab(previous); });
    }
    content->addWidget(workspaceTabs_);
    connect(workspaceTabs_, &QTabWidget::tabCloseRequested, this, [this](int idx) {
        requestClose(bookId(workspaceTabs_->widget(idx)), false);
    });

    ExcelUi::WorkspaceWelcomeWidget::Callbacks welcomeCb;
    welcomeCb.openFolder = [this] {
        const auto path = QFileDialog::getExistingDirectory(this, QStringLiteral("打开工作区文件夹"), workspaceRoot_);
        if (!path.isEmpty()) selectWorkspace(path);
    };
    welcomeCb.openRecentWorkspace = [this](const QString& rootPath) {
        selectWorkspace(rootPath);
    };
    welcomeCb.quickOpen = [this] { quickOpenWorkbook(); };
    welcomeCb.openSearch = [this] { setWorkspaceView(true); };
    welcomeCb.newWorkbook = [this] {
        setWorkspaceView(false);
        if (openNewWorkbookForm_) openNewWorkbookForm_(workspaceRoot_);
    };
    welcomeCb.openTools = [this] {
        if (workspaceToolsButton_ && workspaceToolsButton_->isEnabled()) workspaceToolsButton_->showMenu();
    };
    welcomeCb.revealFolder = [this] {
        if (!workspaceRoot_.isEmpty() && QFileInfo(workspaceRoot_).isDir())
            QDesktopServices::openUrl(QUrl::fromLocalFile(workspaceRoot_));
    };
    workspaceWelcome_ = new ExcelUi::WorkspaceWelcomeWidget(std::move(welcomeCb), right);
    content->addWidget(workspaceWelcome_);

    workspaceSplitter_->setStretchFactor(1, 1);
    savedSidebarWidth_ = qRound(268 * s);
    workspaceSplitter_->setSizes({savedSidebarWidth_, qRound(912 * s)});

    // ── Live Status Bar ──
    auto* statusBar = new QWidget(workspacePage_);
    statusBar->setObjectName("workspaceStatusBar");
    auto* statusLayout = new QHBoxLayout(statusBar);
    statusLayout->setContentsMargins(qRound(12 * s), 0, qRound(12 * s), 0);
    statusLayout->setSpacing(qRound(10 * s));

    auto* statusDot = new QLabel(statusBar);
    statusDot->setObjectName("statusLiveDot");
    const int dotSize = qRound(7 * s);
    statusDot->setFixedSize(dotSize, dotSize);
    statusLayout->addWidget(statusDot);

    workspaceStatusLabel_ = new QLabel(QStringLiteral("未选择工作区"), statusBar);
    workspaceStatusLabel_->setObjectName("statusWorkspaceBadge");
    statusLayout->addWidget(workspaceStatusLabel_);

    auto* statusSep = new QFrame(statusBar);
    statusSep->setObjectName("statusDivider");
    statusSep->setFrameShape(QFrame::VLine);
    statusSep->setFixedHeight(12);
    statusLayout->addWidget(statusSep);

    workspaceOpenCountLabel_ = new QLabel(QStringLiteral("就绪"), statusBar);
    workspaceOpenCountLabel_->setObjectName("statusOpenCount");
    statusLayout->addWidget(workspaceOpenCountLabel_);

    statusLayout->addStretch(1);

    auto addStatusChip = [&](const QString& text, const std::function<void()>& onClick) {
        auto* btn = new QPushButton(text, statusBar);
        btn->setObjectName("statusShortcutBtn");
        btn->setCursor(Qt::PointingHandCursor);
        btn->setFocusPolicy(Qt::NoFocus);
        connect(btn, &QPushButton::clicked, this, onClick);
        statusLayout->addWidget(btn);
    };
    addStatusChip(QStringLiteral("快速打开 Ctrl+Shift+O"), [this] { quickOpenWorkbook(); });
    addStatusChip(QStringLiteral("搜索 Ctrl+Shift+F"), [this] { setWorkspaceView(true); });
    addStatusChip(QStringLiteral("侧边栏 Ctrl+B"), [this] { toggleWorkspaceSidebar(); });

    layout->addWidget(statusBar);

    recentWorkspaces_ = QSettings(settingsFile(), QSettings::IniFormat).value("recent").toStringList().mid(0, 20);
    connect(workspacePicker_, QOverload<int>::of(&QComboBox::activated), this, [this](int i) {
        selectWorkspace(workspacePicker_->itemData(i).toString());
    });
    selectWorkspace(initialRoot.isEmpty() ? recentWorkspaces_.value(0) : initialRoot);
    tabs_.setCurrentWidget(workspacePage_);
}

void WorkbookWindow::toggleWorkspaceSidebar() {
    if (!workspaceSplitter_ || !workspaceSidebar_) return;
    const auto sizes = workspaceSplitter_->sizes();
    const int total = sizes.value(0) + sizes.value(1);
    if (total <= 0) return;
    const int minW = ExcelUi::scaled(this, 228);

    if (!sidebarCollapsed_) {
        savedSidebarWidth_ = qMax(minW, sizes.value(0));
        sidebarCollapsed_ = true;
        if (!ExcelUi::motionEnabled()) {
            workspaceSidebar_->setMinimumWidth(0);
            workspaceSidebar_->hide();
            workspaceSplitter_->setSizes({0, total});
            return;
        }
        workspaceSidebar_->setMinimumWidth(0);
        auto* anim = new QVariantAnimation(workspaceSplitter_);
        anim->setDuration(190);
        anim->setEasingCurve(QEasingCurve::OutCubic);
        anim->setStartValue(sizes.value(0));
        anim->setEndValue(0);
        connect(anim, &QVariantAnimation::valueChanged, this, [this, total](const QVariant& v) {
            const int w = v.toInt();
            workspaceSplitter_->setSizes({w, qMax(1, total - w)});
        });
        connect(anim, &QVariantAnimation::finished, this, [this, anim] {
            if (sidebarCollapsed_) workspaceSidebar_->hide();
            anim->deleteLater();
        });
        anim->start();
    } else {
        sidebarCollapsed_ = false;
        const int target = qBound(minW, savedSidebarWidth_, qMax(minW + 40, total / 2));
        workspaceSidebar_->show();
        if (!ExcelUi::motionEnabled()) {
            workspaceSidebar_->setMinimumWidth(minW);
            workspaceSplitter_->setSizes({target, qMax(1, total - target)});
            return;
        }
        workspaceSidebar_->setMinimumWidth(0);
        auto* anim = new QVariantAnimation(workspaceSplitter_);
        anim->setDuration(200);
        anim->setEasingCurve(QEasingCurve::OutCubic);
        anim->setStartValue(0);
        anim->setEndValue(target);
        connect(anim, &QVariantAnimation::valueChanged, this, [this, total](const QVariant& v) {
            const int w = v.toInt();
            workspaceSplitter_->setSizes({w, qMax(1, total - w)});
        });
        connect(anim, &QVariantAnimation::finished, this, [this, anim, minW] {
            if (!sidebarCollapsed_) workspaceSidebar_->setMinimumWidth(minW);
            anim->deleteLater();
        });
        anim->start();
    }
}

void WorkbookWindow::setWorkspaceView(bool search) {
    if (sidebarCollapsed_) toggleWorkspaceSidebar();
    const int index = search ? 1 : 0;
    workspaceViews_->button(index)->setChecked(true);
    if (workspaceRail_) workspaceRail_->setActiveId(index, true);
    workspaceSidebar_->animateToIndex(index);
    if (search) workspaceSearch_->focusSearch();
    else workspaceTree_->setFocus(Qt::ShortcutFocusReason);
}

void WorkbookWindow::syncWorkspaceTreeIndicators() {
    if (!workspaceTree_) return;
    QSet<QString> openPaths;
    int openCount = 0;
    for (const auto& book : books_) {
        if (book.tabs != workspaceTabs_ || book.root != workspaceRoot_) continue;
        openPaths.insert(book.path.toCaseFolded());
        ++openCount;
    }
    QString activePath;
    const int activeId = visibleBookId();
    if (activeId >= 0 && books_.contains(activeId) && books_[activeId].root == workspaceRoot_) {
        activePath = books_[activeId].path;
    }
    workspaceTree_->setOpenBooks(openPaths, activePath);
    if (workspaceOpenCountLabel_) {
        workspaceOpenCountLabel_->setText(openCount > 0
            ? QStringLiteral("已打开 %1 个工作簿").arg(openCount)
            : QStringLiteral("未打开工作簿"));
    }
}

void WorkbookWindow::selectWorkspace(const QString& path, bool remember) {
    if (!quitRequested_) rememberWorkspaceTab();
    const QFileInfo info(path);
    if (workspaceRoot_ != path && newWorkbookPanel_) newWorkbookPanel_->setExpanded(false, false);
    workspaceRoot_ = info.isDir() ? info.canonicalFilePath() : path;
    if (remember && !workspaceRoot_.isEmpty() && info.isDir()) {
        for (int i = recentWorkspaces_.size() - 1; i >= 0; --i)
            if (recentWorkspaces_[i].compare(workspaceRoot_, Qt::CaseInsensitive) == 0) recentWorkspaces_.removeAt(i);
        recentWorkspaces_.prepend(workspaceRoot_);
        recentWorkspaces_ = recentWorkspaces_.mid(0, 20);
        QSettings(settingsFile(), QSettings::IniFormat).setValue("recent", recentWorkspaces_);
    }
    workspacePicker_->clear();
    for (const auto& root : recentWorkspaces_) {
        const auto name = QFileInfo(root).fileName();
        const auto label = name.isEmpty() ? QDir::toNativeSeparators(root) : name;
        workspacePicker_->addItem(QIcon(":/window-chrome/folder.svg"), label, root);
        workspacePicker_->setItemData(workspacePicker_->count() - 1, QDir::toNativeSeparators(root), Qt::ToolTipRole);
    }
    if (recentWorkspaces_.isEmpty()) workspacePicker_->addItem(QStringLiteral("最近工作区"));
    workspacePicker_->setCurrentIndex(qMax(0, workspacePicker_->findData(workspaceRoot_)));
    workspacePicker_->setToolTip(QDir::toNativeSeparators(workspaceRoot_));
    quickOpenButton_->setEnabled(info.isDir());
    workspaceSidebar_->widget(0)->setEnabled(info.isDir());
    workspaceRootLabel_->setText(info.isDir() ? QDir(path).dirName() : QStringLiteral("工作区文件"));
    if (info.isDir() && workspaceRootLabel_->text().isEmpty()) workspaceRootLabel_->setText(path);
    workspaceRootLabel_->setToolTip(QDir::toNativeSeparators(path));
    if (workspaceFilterInput_) workspaceFilterInput_->clear();
    workspaceTree_->setVisible(info.isDir());
    if (!quitRequested_) workspaceSearch_->setRoot(info.isDir() ? workspaceRoot_ : QString());
    if (workspaceProxy_) workspaceProxy_->setRootDirectory(info.isDir() ? workspaceRoot_ : QString());
    const QModelIndex srcRoot = workspaceModel_->setRootPath(info.isDir() ? workspaceRoot_ : QString());
    workspaceTree_->setRootIndex(workspaceProxy_ ? workspaceProxy_->mapFromSource(srcRoot) : srcRoot);

    if (workspaceWelcome_) {
        workspaceWelcome_->setWorkspaceState(workspaceRoot_, info.isDir(), recentWorkspaces_);
    }
    if (workspaceStatusLabel_) {
        workspaceStatusLabel_->setText(info.isDir()
            ? workspaceRootLabel_->text()
            : QStringLiteral("未选择工作区"));
        workspaceStatusLabel_->setToolTip(QDir::toNativeSeparators(workspaceRoot_));
    }
    refreshWorkspaceTabs();
    if (!info.isDir() || quitRequested_) return;

    const auto root = workspaceRoot_.toCaseFolded();
    if (!loadedWorkspaces_.contains(root)) {
        loadedWorkspaces_.insert(root);
        QSettings settings(settingsFile(), QSettings::IniFormat);
        const auto session = settings.value("sessions").toMap().value(root).toMap();
        const auto paths = session.value("tabs").toStringList();
        for (const auto& file : paths) {
            const int id = bookId(file);
            if (id >= 0 && books_[id].tabs == workspaceTabs_ && books_[id].root != workspaceRoot_) continue;
            openBook(file, true, true);
        }
        updateBookTitles();
        refreshWorkspaceTabs();
        activeWorkspaceBooks_[root] = bookId(session.value("active").toString());
    }
    const auto active = books_.constFind(activeWorkspaceBooks_.value(root, -1));
    if (active != books_.cend() && active->root == workspaceRoot_) {
        workspaceTabs_->setCurrentWidget(active->widget);
    } else {
        for (int i = 0; i < workspaceTabs_->count(); ++i) {
            if (workspaceTabs_->isTabVisible(i)) { workspaceTabs_->setCurrentIndex(i); break; }
        }
    }
    syncWorkspaceTreeIndicators();
}

void WorkbookWindow::rememberWorkspaceTab() {
    if (!workspaceTabs_ || workspaceRoot_.isEmpty()) return;
    auto* selected = workspaceTabs_->currentWidget();
    for (auto it = books_.cbegin(); it != books_.cend(); ++it) {
        if (it->widget == selected && it->root == workspaceRoot_) {
            activeWorkspaceBooks_[workspaceRoot_.toCaseFolded()] = it.key();
            return;
        }
    }
}

void WorkbookWindow::saveWorkspaceSessions() {
    QSettings settings(settingsFile(), QSettings::IniFormat);
    settings.setValue("resumeWorkspace", workspacePage_ && tabs_.currentWidget() == workspacePage_);
    if (!workspaceTabs_) return;
    rememberWorkspaceTab();
    const auto previous = settings.value("sessions").toMap();
    QVariantMap sessions;
    QHash<QString, QStringList> paths;
    QVector<const Book*> ordered(workspaceTabs_->count(), nullptr);
    for (const auto& book : books_) {
        if (book.tabs != workspaceTabs_) continue;
        const int index = workspaceTabs_->indexOf(book.widget);
        if (index >= 0) ordered[index] = &book;
    }
    for (const auto* book : ordered) {
        if (book) paths[book->root.toCaseFolded()].append(book->path);
    }
    for (const auto& folder : recentWorkspaces_) {
        const auto root = folder.toCaseFolded();
        if (!loadedWorkspaces_.contains(root)) {
            if (previous.contains(root)) sessions.insert(root, previous.value(root));
            continue;
        }
        const auto files = paths.value(root);
        if (files.isEmpty()) continue;
        const auto book = books_.constFind(activeWorkspaceBooks_.value(root, -1));
        const auto active = book != books_.cend() && files.contains(book->path) ? book->path : files.first();
        sessions.insert(root, QVariantMap{{"tabs", files}, {"active", active}});
    }
    settings.setValue("sessions", sessions);
}

void WorkbookWindow::refreshWorkspaceTabs() {
    bool hasBooks = false;
    for (const auto& book : books_) {
        if (book.tabs != workspaceTabs_) continue;
        const bool visible = book.root == workspaceRoot_;
        workspaceTabs_->setTabVisible(workspaceTabs_->indexOf(book.widget), visible);
        hasBooks |= visible;
    }
    workspaceTabs_->setVisible(hasBooks);
    if (workspaceWelcome_) workspaceWelcome_->setVisible(!hasBooks);
    syncWorkspaceTreeIndicators();
}

void WorkbookWindow::launchWorkspaceTool(const QString& mode, const QString& title) {
    if (workspaceToolDialog_ || tabs_.currentWidget() != workspacePage_) return;
    auto* dialog = new QDialog(this);
    dialog->setObjectName("workspaceToolDialog");
    dialog->setWindowTitle(title);
    dialog->setWindowFlag(Qt::WindowContextHelpButtonHint, false);
    dialog->setSizeGripEnabled(true);
    dialog->resize(qMin(1000, width() - 48), qMin(740, height() - 64));
    auto* layout = new QVBoxLayout(dialog);
    layout->setContentsMargins(0, 0, 0, 0);
    // Keep the same renderer and tool session for native replies and in-flight jobs.
    layout->addWidget(home_);
    workspaceToolDialog_ = dialog;
    toolDirectory_ = workspaceRoot_;
    financeReply("workspace:tool", {{"mode", mode}, {"directory", toolDirectory_}});
    connect(dialog, &QDialog::finished, this, [this, dialog] {
        homeLayout_->addWidget(home_);
        home_->show();
        workspaceToolDialog_ = nullptr;
        financeReply("workspace:tool-closed", {});
        dialog->deleteLater();
    });
    dialog->open();
    home_->show();
    home_->setFocus();
}

void WorkbookWindow::showWorkspaceTabMenu(const QPoint& position) {
    auto* bar = workspaceTabs_->tabBar();
    const int anchor = bar->tabAt(position);
    if (anchor < 0 || closeState_ != CloseState::Idle) return;

    QList<int> visible;
    for (int i = 0; i < bar->count(); ++i) {
        if (bar->isTabVisible(i)) visible.append(bookId(workspaceTabs_->widget(i)));
    }
    const int id = bookId(workspaceTabs_->widget(anchor));
    const int offset = visible.indexOf(id);
    if (id < 0 || offset < 0) return;

    QMenu menu(bar);
    menu.setObjectName("workspacePopupMenu");
    auto* current = menu.addAction(QStringLiteral("关闭当前"));
    auto* right = menu.addAction(QStringLiteral("关闭右边"));
    auto* left = menu.addAction(QStringLiteral("关闭左边"));
    menu.addSeparator();
    auto* all = menu.addAction(QStringLiteral("关闭全部"));
    right->setEnabled(offset + 1 < visible.size());
    left->setEnabled(offset > 0);
    const auto* action = menu.exec(bar->mapToGlobal(position));
    if (!action || closeState_ != CloseState::Idle || !books_.contains(id) || books_[id].root != workspaceRoot_) return;

    if (action == current) pendingTabCloses_ = {id};
    else if (action == right) pendingTabCloses_ = visible.mid(offset + 1);
    else if (action == left) pendingTabCloses_ = visible.mid(0, offset);
    else if (action == all) pendingTabCloses_ = visible;
    closeNextWorkspaceTab();
}

void WorkbookWindow::closeNextWorkspaceTab() {
    while (!pendingTabCloses_.isEmpty()) {
        const int id = pendingTabCloses_.takeFirst();
        const auto book = books_.constFind(id);
        if (book != books_.cend() && book->tabs == workspaceTabs_ && book->root == workspaceRoot_) {
            requestClose(id, false);
            return;
        }
    }
}

void WorkbookWindow::cycleWorkspaceTab(bool previous) {
    const int count = workspaceTabs_->count();
    int index = workspaceTabs_->currentIndex();
    for (int step = 0; step < count; ++step) {
        index = (index + (previous ? count - 1 : 1)) % count;
        if (workspaceTabs_->isTabVisible(index)) {
            workspaceTabs_->setCurrentIndex(index);
            workspaceTabs_->widget(index)->setFocus(Qt::ShortcutFocusReason);
            return;
        }
    }
}

void WorkbookWindow::revealWorkspaceBook() {
    if (quitRequested_ || closing_ || !pendingTabCloses_.isEmpty() || tabs_.currentWidget() != workspacePage_) return;
    syncWorkspaceTreeIndicators();
    const int index = workspaceTabs_->currentIndex();
    if (index < 0 || !workspaceTabs_->isTabVisible(index)) return;
    const int id = visibleBookId();
    if (id < 0 || books_[id].root != workspaceRoot_ || !loadBook(id)) return;
    const auto srcEntry = workspaceModel_->index(workspaceTabs_->tabToolTip(index));
    if (!srcEntry.isValid()) return;
    const auto entry = workspaceProxy_ ? workspaceProxy_->mapFromSource(srcEntry) : srcEntry;
    if (!entry.isValid()) return;
    const auto root = workspaceTree_->rootIndex();
    auto ancestor = entry.parent();
    while (ancestor.isValid() && ancestor != root) ancestor = ancestor.parent();
    if (ancestor != root || !root.isValid()) return;
    workspaceTree_->setCurrentIndex(entry);
    workspaceTree_->scrollTo(entry);
}

void WorkbookWindow::openSearchHit(const QString& path, const QString& sheet, const QString& address, bool hidden) {
    const auto relative = QDir(workspaceRoot_).relativeFilePath(path);
    if (workspaceRoot_.isEmpty() || QDir::isAbsolutePath(relative) || relative.startsWith("../")) return;
    if (locateTimer_) {
        locateTimer_->stop();
        locateTimer_->deleteLater();
        locateTimer_ = nullptr;
    }
    if (hidden) {
        workspaceSearch_->showMessage(QStringLiteral("位于隐藏工作表：%1!%2。可复制位置，或在工作簿中取消隐藏后刷新索引。").arg(sheet, address));
        return;
    }
    openBook(path, true);
    const int id = bookId(path);
    if (id < 0) return;
    books_[id].widget->setFocus(Qt::ShortcutFocusReason);
    const QJsonObject target{{"sheet", sheet}, {"address", address}, {"token", QString::number(++locateRequest_)}};
    const auto script = QByteArrayLiteral(R"JS((function(target) {
        const api = window.Asc && window.Asc.editor;
        if (!api || !document.querySelector('#ws-canvas') || !api.asc_getCellInfo()) return;
        let state = 'unavailable';
        for (let i = 0; i < api.asc_getWorksheetsCount(); ++i) {
            if (api.asc_getWorksheetName(i) !== target.sheet || api.asc_isWorksheetHidden(i)) continue;
            api.asc_showWorksheet(i);
            api.asc_findCell(target.address);
            state = 'ok';
            break;
        }
        window.AscDesktopEditor.execCommand('workspace:located', JSON.stringify({token:target.token,status:state}));
    })( )JS") + QJsonDocument(target).toJson(QJsonDocument::Compact) + ");";
    // A newly opened workbook creates its editor frame asynchronously.
    locateTimer_ = new QTimer(this);
    const QDeadlineTimer deadline(60000);
    connect(locateTimer_, &QTimer::timeout, this, [this, id, deadline, script] {
        if (visibleBookId() != id || deadline.hasExpired()) {
            locateTimer_->stop();
            if (visibleBookId() == id) workspaceSearch_->showMessage(QStringLiteral("工作簿尚未就绪，请再次打开搜索结果。"));
            return;
        }
        books_[id].widget->GetCefView()->ExecuteEditorScript(script.toStdString());
    });
    locateTimer_->start(300);
}
