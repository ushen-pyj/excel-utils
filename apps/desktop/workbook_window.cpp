#include "workbook_window.h"
#include "workspace_search.h"
#include "workspace_ui.h"
#include <OfficeFileFormats.h>
#include <QApplication>
#include <QCloseEvent>
#include <QDateTime>
#include <QDir>
#include <QDesktopServices>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMessageBox>
#include <QPushButton>
#include <QMouseEvent>
#include <QRegularExpression>
#include <QScreen>
#include <QSaveFile>
#include <QSettings>
#include <QShortcut>
#include <QStandardPaths>
#include <QTabBar>
#include <QTemporaryDir>
#include <QThread>
#include <QToolButton>
#include <QUrl>
#include <QVBoxLayout>
#include <QWindow>
#include <QtMath>
#include <dwmapi.h>
#include <memory>
#include <share.h>
#include <windows.h>
#include <windowsx.h>
#pragma comment(lib, "dwmapi.lib")

using namespace NSEditorApi;

WorkbookWindow::WorkbookWindow(CAscApplicationManager& manager) : manager_(manager) {
    manager_.SetEventListener(this);
    setWindowTitle("Excel Utils");
    resize(1180, 780);
    setCentralWidget(&tabs_);
    tabs_.setDocumentMode(true);
    tabs_.setTabsClosable(true);
    loadSavedTheme();
    setupWindowChrome();
    auto* homePage = new QWidget(&tabs_);
    homeLayout_ = new QVBoxLayout(homePage);
    homeLayout_->setContentsMargins(0, 0, 0, 0);
    home_ = new QCefView(homePage);
    homeLayout_->addWidget(home_);
    tabs_.addTab(homePage, QApplication::windowIcon(), QStringLiteral("Excel Utils"));
    tabs_.setTabToolTip(0, QStringLiteral("主页"));
    tabs_.tabBar()->setAccessibleTabName(0, QStringLiteral("主页"));
    tabs_.tabBar()->setTabButton(0, QTabBar::RightSide, nullptr);
    home_->Create(&manager_, cvwtSimple);
    const QString startPage = QCoreApplication::applicationDirPath() + "/index.html";
    manager_.AddFileToLocalResolver(startPage.toStdWString());
    home_->GetCefView()->load(("onlyoffice://plugin/" + startPage + "?lang=zh-CN").toStdWString());
    connect(&tabs_, &QTabWidget::tabCloseRequested, this, [this](int index) {
        requestClose(bookId(tabs_.widget(index)), false);
    });
    auto* open = new QShortcut(QKeySequence::Open, this);
    connect(open, &QShortcut::activated, this, [this] { chooseWorkbook(workspacePage_ && tabs_.currentWidget() == workspacePage_ ? workspaceRoot_ : QString()); });
    auto* closeTab = new QShortcut(QKeySequence::Close, this);
    connect(closeTab, &QShortcut::activated, this, [this] {
        requestClose(visibleBookId(), false);
    });
    closeCheck_.setSingleShot(true);
    closeCheck_.setInterval(100);
    connect(&closeCheck_, &QTimer::timeout, this, &WorkbookWindow::checkClose);
}

void WorkbookWindow::setupWindowChrome() {
    tabs_.setObjectName("workbookTabs");
    auto* bar = tabs_.tabBar();
    bar->setObjectName("workbookTabBar");
    bar->setDrawBase(false);
    bar->setExpanding(false);
    bar->setElideMode(Qt::ElideMiddle);
    tabs_.installEventFilter(this);
    bar->installEventFilter(this);

    captionControls_ = new QWidget(&tabs_);
    captionControls_->setObjectName("captionControls");
    auto* buttons = new QHBoxLayout(captionControls_);
    buttons->setContentsMargins(0, 0, 0, 0);
    buttons->setSpacing(0);
    auto addButton = [&](const QString& name, const QString& icon) {
        auto* button = new QToolButton(captionControls_);
        button->setAutoRaise(true);
        button->setIcon(QIcon(":/window-chrome/" + icon + ".svg"));
        button->setAccessibleName(name);
        button->setToolTip(name);
        button->setFocusPolicy(Qt::NoFocus);
        buttons->addWidget(button);
        return button;
    };
    minimizeButton_ = addButton(QStringLiteral("最小化"), "minimize");
    maximizeButton_ = addButton(QStringLiteral("最大化"), "maximize");
    closeButton_ = addButton(QStringLiteral("关闭窗口"), "close");
    closeButton_->setObjectName("windowClose");
    connect(minimizeButton_, &QToolButton::clicked, this, &QWidget::showMinimized);
    connect(maximizeButton_, &QToolButton::clicked, this, &WorkbookWindow::toggleMaximized);
    connect(closeButton_, &QToolButton::clicked, this, &QWidget::close);
    tabs_.setCornerWidget(captionControls_, Qt::TopRightCorner);

    const auto hwnd = reinterpret_cast<HWND>(winId());
    const BOOL darkMode = ExcelUi::currentTheme().dark ? TRUE : FALSE;
    DwmSetWindowAttribute(hwnd, 20 /*DWMWA_USE_IMMERSIVE_DARK_MODE*/, &darkMode, sizeof(darkMode));
    updateChromeScale();
    connect(windowHandle(), &QWindow::screenChanged, this, &WorkbookWindow::updateChromeScale);
    SetWindowPos(hwnd, nullptr, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOMOVE | SWP_NOSIZE);
}

void WorkbookWindow::loadSavedTheme() {
    const auto profile = qEnvironmentVariable("EXCELUTILS_PROFILE",
        QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation));
    QSettings settings(QDir(profile).filePath("workspaces.ini"), QSettings::IniFormat);
    const bool dark = settings.value("theme/mode", QStringLiteral("light")).toString() == QStringLiteral("dark");
    const QString accent = settings.value("theme/accent", QStringLiteral("emerald")).toString();
    ExcelUi::setCurrentTheme(dark, accent);
}

void WorkbookWindow::updateCaptionIcons() {
    if (!minimizeButton_ || !maximizeButton_ || !closeButton_) return;
    const auto& t = ExcelUi::currentTheme();
    const QColor fg = t.dark ? QColor("#CBD5E1") : QColor("#334155");
    minimizeButton_->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/minimize.svg"), fg, 16));
    maximizeButton_->setIcon(ExcelUi::tintedIcon(
        isMaximized() ? QStringLiteral(":/window-chrome/restore.svg") : QStringLiteral(":/window-chrome/maximize.svg"), fg, 16));
    QIcon closeIcon;
    closeIcon.addPixmap(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/close.svg"), fg, 16).pixmap(32, 32), QIcon::Normal);
    closeIcon.addFile(QStringLiteral(":/window-chrome/close-white.svg"), {}, QIcon::Active);
    closeButton_->setIcon(closeIcon);
}

void WorkbookWindow::syncHomeTheme() {
    if (!home_ || !home_->GetCefView()) return;
    financeReply(QStringLiteral("app:theme"), ExcelUi::currentTheme().toWebPayload());
}

void WorkbookWindow::applyTheme(bool dark, const QString& accent, bool persist) {
    ExcelUi::setCurrentTheme(dark, accent);
    if (persist) {
        const auto profile = qEnvironmentVariable("EXCELUTILS_PROFILE",
            QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation));
        QSettings settings(QDir(profile).filePath("workspaces.ini"), QSettings::IniFormat);
        settings.setValue("theme/mode", dark ? QStringLiteral("dark") : QStringLiteral("light"));
        settings.setValue("theme/accent", ExcelUi::currentTheme().accentId);
    }
    if (winId()) {
        const BOOL darkMode = dark ? TRUE : FALSE;
        DwmSetWindowAttribute(reinterpret_cast<HWND>(winId()), 20, &darkMode, sizeof(darkMode));
    }
    updateChromeScale();
    const auto& t = ExcelUi::currentTheme();
    if (workspaceRail_) workspaceRail_->applyTheme();
    if (quickOpenButton_) quickOpenButton_->applyTheme();
    if (workspaceWelcome_) workspaceWelcome_->applyTheme();
    if (workspaceTree_) workspaceTree_->applyTheme();
    if (workspaceSearch_) workspaceSearch_->applyTheme();
    if (workspaceToolsButton_) {
        workspaceToolsButton_->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/tools.svg"), t.accent, 20));
    }
    if (workspaceBrowseButton_) {
        workspaceBrowseButton_->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/folder-outline.svg"), t.iconNormal, 18));
    }
    if (explorerCreateBtn_) {
        explorerCreateBtn_->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/new-file.svg"), t.iconNormal, 18));
    }
    if (explorerCollapseBtn_) {
        explorerCollapseBtn_->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/collapse.svg"), t.iconNormal, 18));
    }
    const QIcon bookIcon = ExcelUi::themedXlsxIcon(t.accent, t.dark, 18);
    for (const auto& book : books_) {
        const int idx = book.tabs->indexOf(book.widget);
        if (idx >= 0) book.tabs->setTabIcon(idx, bookIcon);
    }
    syncHomeTheme();
}

void WorkbookWindow::openThemeSettings(const QPoint& anchorGlobal) {
    if (themeDialog_) {
        themeDialog_->reject();
        return;
    }
    auto* dialog = new ExcelUi::ThemeSettingsDialog([this](bool dark, const QString& accent) {
        applyTheme(dark, accent, true);
    }, this);
    themeDialog_ = dialog;
    connect(dialog, &QDialog::finished, this, [this] { themeDialog_ = nullptr; });

    QPoint anchor = anchorGlobal;
    if (anchor.isNull()) {
        const double s = ExcelUi::scaleFor(this);
        anchor = mapToGlobal(QPoint(qRound(74 * s), height() - qRound(16 * s)));
    }
    dialog->popupNear(anchor);
}

void WorkbookWindow::updateChromeScale() {
    QFile file(":/window-chrome/chrome.qss");
    if (!file.open(QIODevice::ReadOnly)) return;
    const auto source = ExcelUi::applyThemeTokens(QString::fromUtf8(file.readAll()));
    // Qt's automatic scaling is disabled to share a pixel coordinate system with the SDK.
    const auto scale = windowHandle()->screen()->logicalDotsPerInch() / 96.0;
    QString sheet;
    qsizetype start = 0;
    const QRegularExpression pixels(R"((\d+)px\b)");
    auto matches = pixels.globalMatch(source);
    while (matches.hasNext()) {
        const auto match = matches.next();
        sheet += source.mid(start, match.capturedStart() - start);
        sheet += QString::number(qRound(match.captured(1).toInt() * scale)) + "px";
        start = match.capturedEnd();
    }
    sheet += source.mid(start);
    const auto& theme = ExcelUi::currentTheme();
    QPalette pal = qApp->palette();
    pal.setColor(QPalette::Window, theme.bgChrome);
    pal.setColor(QPalette::WindowText, theme.textPrimary);
    pal.setColor(QPalette::Base, theme.bgInput);
    pal.setColor(QPalette::Text, theme.textPrimary);
    pal.setColor(QPalette::PlaceholderText, theme.textMuted);
    pal.setColor(QPalette::Highlight, theme.accentSoft);
    pal.setColor(QPalette::HighlightedText, theme.accentText);
    qApp->setPalette(pal);
    qApp->setStyleSheet(sheet);
    const QSize iconSize(qRound(16 * scale), qRound(16 * scale));
    tabs_.setIconSize(iconSize);
    for (auto* button : captionControls_->findChildren<QToolButton*>()) button->setIconSize(iconSize);
    updateCaptionIcons();
    if (workspaceRail_) workspaceRail_->updateScale();
    if (workspaceTabs_) workspaceTabs_->setIconSize(QSize(qRound(15 * scale), qRound(15 * scale)));
    if (workspaceToolsButton_) workspaceToolsButton_->setIconSize(QSize(qRound(16 * scale), qRound(16 * scale)));
}

void WorkbookWindow::toggleMaximized() {
    if (isMaximized()) showNormal();
    else showMaximized();
}

void WorkbookWindow::changeEvent(QEvent* event) {
    QMainWindow::changeEvent(event);
    if (event->type() != QEvent::WindowStateChange || !maximizeButton_) return;
    const auto name = isMaximized() ? QStringLiteral("还原") : QStringLiteral("最大化");
    maximizeButton_->setAccessibleName(name);
    maximizeButton_->setToolTip(name);
    updateCaptionIcons();
}

bool WorkbookWindow::isCaptionSpace(const QPoint& position) const {
    if (!captionControls_ || position.y() < 0 || position.y() >= captionControls_->height()) return false;
    if (captionControls_->rect().contains(captionControls_->mapFrom(this, position))) return false;
    auto* bar = tabs_.tabBar();
    const auto tabPos = bar->mapFrom(this, position);
    return bar->tabAt(tabPos) < 0 && !bar->childAt(tabPos);
}

bool WorkbookWindow::eventFilter(QObject* watched, QEvent* event) {
    // A native Qt child may receive the mouse before the top-level HWND's hit test.
    if ((watched == &tabs_ || watched == tabs_.tabBar()) &&
            (event->type() == QEvent::MouseButtonPress || event->type() == QEvent::MouseButtonDblClick)) {
        auto* mouse = static_cast<QMouseEvent*>(event);
        if (mouse->button() == Qt::LeftButton && isCaptionSpace(mapFromGlobal(mouse->globalPos()))) {
            if (event->type() == QEvent::MouseButtonDblClick) toggleMaximized();
            else windowHandle()->startSystemMove();
            return true;
        }
    }
    return QMainWindow::eventFilter(watched, event);
}

bool WorkbookWindow::nativeEvent(const QByteArray& type, void* message, long* result) {
    const auto* msg = static_cast<const MSG*>(message);
    if (msg->message == WM_NCCALCSIZE && msg->wParam) {
        auto* params = reinterpret_cast<NCCALCSIZE_PARAMS*>(msg->lParam);
        const RECT outer = params->rgrc[0];
        DefWindowProcW(msg->hwnd, msg->message, msg->wParam, msg->lParam);
        // Keep Windows' resize borders and maximize insets. Only the top caption becomes client area.
        const LONG frame = params->rgrc[0].left - outer.left;
        params->rgrc[0].top = outer.top + (IsZoomed(msg->hwnd) ? frame : 0);
        *result = 0;
        return true;
    }
    if (msg->message == WM_NCHITTEST && captionControls_) {
        POINT p{GET_X_LPARAM(msg->lParam), GET_Y_LPARAM(msg->lParam)};
        ScreenToClient(msg->hwnd, &p);
        RECT client{};
        GetClientRect(msg->hwnd, &client);
        if (PtInRect(&client, p)) {
            const auto ratio = devicePixelRatioF();
            const QPoint position(qFloor(p.x / ratio), qFloor(p.y / ratio));
            if (position.y() < captionControls_->height()) {
                if (!IsZoomed(msg->hwnd) && p.y < GetSystemMetrics(SM_CYSIZEFRAME)) {
                    const auto border = GetSystemMetrics(SM_CXSIZEFRAME);
                    *result = p.x < border ? HTTOPLEFT : p.x >= client.right - border ? HTTOPRIGHT : HTTOP;
                } else {
                    *result = isCaptionSpace(position) ? HTCAPTION : HTCLIENT;
                }
                return true;
            }
        }
    }
    return QMainWindow::nativeEvent(type, message, result);
}

void WorkbookWindow::chooseWorkbook(const QString& directory) {
    const QString path = QFileDialog::getOpenFileName(this, QStringLiteral("打开工作簿"),
        directory, QStringLiteral("Excel 工作簿 (*.xlsx)"));
    if (!path.isEmpty()) openBook(path, workspacePage_ && tabs_.currentWidget() == workspacePage_);
}

void WorkbookWindow::openWorkbook(const QString& path) {
    openBook(path, false);
}

int WorkbookWindow::bookId(const QString& path) const {
    if (path.isEmpty()) return -1;
    const QFileInfo target(path);
    const auto canonical = target.canonicalFilePath();
    const auto absolute = canonical.isEmpty() ? target.absoluteFilePath() : canonical;
    for (auto it = books_.cbegin(); it != books_.cend(); ++it)
        if (it->path.compare(absolute, Qt::CaseInsensitive) == 0) return it.key();
    return -1;
}

int WorkbookWindow::bookId(const QWidget* page) const {
    for (auto it = books_.cbegin(); it != books_.cend(); ++it)
        if (it->widget == page) return it.key();
    return -1;
}

int WorkbookWindow::visibleBookId() const {
    auto* page = tabs_.currentWidget();
    return bookId(workspacePage_ && page == workspacePage_ ? workspaceTabs_->currentWidget() : page);
}

void WorkbookWindow::focusBook(int id) {
    const auto book = books_.value(id);
    if (book.tabs == workspaceTabs_) {
        if (workspaceRoot_ != book.root) selectWorkspace(book.root, !quitRequested_);
        tabs_.setCurrentWidget(workspacePage_);
    }
    book.tabs->setCurrentWidget(book.widget);
}

void WorkbookWindow::updateBookTitles() {
    QHash<QString, int> names;
    for (const auto& book : books_) {
        const auto name = QFileInfo(book.path).fileName();
        if (!book.root.isEmpty()) ++names[book.root + "/" + name.toCaseFolded()];
    }
    for (const auto& book : books_) {
        QString title = QFileInfo(book.path).fileName();
        if (!book.root.isEmpty() && names.value(book.root + "/" + title.toCaseFolded()) > 1)
            title = QDir::toNativeSeparators(QDir(book.root).relativeFilePath(book.path));
        if (book.modified) title += '*';
        const int index = book.tabs->indexOf(book.widget);
        if (book.tabs->tabText(index) != title) book.tabs->setTabText(index, title);
    }
}

void WorkbookWindow::openBook(const QString& path, bool inWorkspace, bool restoring) {
    if (quitRequested_ || closing_) return;
    const QFileInfo info(path);
    if (!info.isFile() || info.suffix().compare("xlsx", Qt::CaseInsensitive) != 0) {
        if (!restoring) QMessageBox::warning(this, QStringLiteral("无法打开"), QStringLiteral("请选择现有的本地 XLSX 文件。\n") + path);
        return;
    }
    const auto absolute = info.canonicalFilePath();
    const int existing = bookId(absolute);
    auto* host = inWorkspace ? workspaceTabs_ : &tabs_;
    const auto& t = ExcelUi::currentTheme();
    const QIcon bookIcon = ExcelUi::themedXlsxIcon(t.accent, t.dark, 18);
    if (existing >= 0) {
        auto& book = books_[existing];
        if (inWorkspace && (book.tabs != host || book.root != workspaceRoot_)) {
            const int index = book.tabs->indexOf(book.widget);
            const auto label = book.tabs->tabText(index);
            book.tabs->removeTab(index);
            book.root = workspaceRoot_;
            book.tabs = host;
            host->setTabToolTip(host->addTab(book.widget, bookIcon, label), absolute);
            if (!restoring) {
                updateBookTitles();
                refreshWorkspaceTabs();
            }
        }
        if (!restoring && loadBook(existing)) focusBook(existing);
        return;
    }
    auto* widget = new QCefView(host);
    const int index = host->addTab(widget, bookIcon, info.fileName());
    host->setTabToolTip(index, QDir::toNativeSeparators(absolute));
    const int id = nextBookId_++;
    books_.insert(id, Book{widget, host, absolute, inWorkspace ? workspaceRoot_ : QString(), {}});
    if (restoring) return;
    if (!loadBook(id)) return;
    updateBookTitles();
    if (inWorkspace) refreshWorkspaceTabs();
    focusBook(id);
}

bool WorkbookWindow::loadBook(int id) {
    auto& book = books_[id];
    if (book.editor()) return true;
    const auto path = book.path;
    const auto source = path.toStdWString();
    const int format = CCefViewEditor::GetFileFormat(source);
    if (format != AVS_OFFICESTUDIO_FILE_SPREADSHEET_XLSX || !QFileInfo(path).isFile()) {
        removeBook(id);
        QMessageBox::warning(this, QStringLiteral("无法打开"), QStringLiteral("无法读取 XLSX 工作簿。\n") + path);
        return false;
    }
    book.widget->Create(&manager_, cvwtEditor);
    auto* view = book.editor();
    bookByViewId_.insert(view->GetId(), id);
    ++editorSaveGeneration_;
    const std::wstring openParams = ExcelUi::currentTheme().dark
        ? L"lang=zh-CN&uitheme=theme-dark"
        : L"lang=zh-CN&uitheme=theme-white";
    view->OpenLocalFile(source, format, openParams);
    return true;
}

void WorkbookWindow::editorClosed(int id) {
    const bool quit = quitRequested_;
    const bool requested = id == closingBook_;
    if (requested) {
        closeCheck_.stop();
        closeState_ = CloseState::Idle;
        closingBook_ = -1;
    }
    ++editorSaveGeneration_;
    removeBook(id);
    if (quit) {
        pendingTabCloses_.clear();
        continueQuit();
    } else if (requested) {
        closeNextWorkspaceTab();
    }
}

void WorkbookWindow::removeBook(int id) {
    const auto book = books_.take(id);
    book.tabs->removeTab(book.tabs->indexOf(book.widget));
    book.widget->deleteLater();
    updateBookTitles();
    if (workspacePage_) refreshWorkspaceTabs();
}

void WorkbookWindow::requestClose(int id, bool quit) {
    if (!books_.contains(id)) return;
    if (closeState_ != CloseState::Idle || (!quit && quitRequested_)) return;
    if (!books_[id].editor()) {
        removeBook(id);
        if (!pendingTabCloses_.isEmpty()) QTimer::singleShot(0, this, &WorkbookWindow::closeNextWorkspaceTab);
        return;
    }
    closingBook_ = id;
    if (!quit) focusBook(id);
    closeState_ = CloseState::Checking;
    traceLifecycle(quit ? "request window close" : "request editor close", closingBook_);
    closeStarted_.start();
    if (!quit) books_[id].widget->setEnabled(false);
    closeCheck_.start();
}

void WorkbookWindow::checkClose() {
    if (!books_.contains(closingBook_) || (closeState_ != CloseState::Checking && closeState_ != CloseState::Saving)) return;
    auto& book = books_[closingBook_];
    auto* view = book.editor();
    if (closeStarted_.hasExpired(60000)) {
        cancelClose();
        QMessageBox::information(this, QStringLiteral("等待保存"), QStringLiteral("尚未收到操作完成的确认，已保留当前工作簿。"));
        return;
    }
    // The conversion can finish before the renderer publishes its modified state.
    const bool dirty = view->GetModified() || view->IsSaveLocked();
    if (closeState_ == CloseState::Saving || view->IsBuilding() ||
            (dirty && book.lastSave.isValid() && !book.lastSave.hasExpired(750))) {
        closeCheck_.start();
        return;
    }
    if (!dirty) {
        finishClose();
        return;
    }
    closeState_ = CloseState::Prompting;
    traceLifecycle("prompt for changes", closingBook_);
    const auto answer = QMessageBox::question(this, QStringLiteral("未保存的修改"),
        QStringLiteral("保存对 %1 的修改？").arg(QFileInfo(book.path).fileName()),
        QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel, QMessageBox::Save);
    if (answer == QMessageBox::Discard) {
        if (quitRequested_) discardedOnQuit_.insert(closingBook_);
        finishClose();
    } else if (answer == QMessageBox::Save) {
        closeState_ = CloseState::Saving;
        closeStarted_.restart();
        view->Apply(new CAscMenuEvent(ASC_MENU_EVENT_TYPE_CEF_SAVE));
        closeCheck_.start();
    } else {
        cancelClose();
    }
}

void WorkbookWindow::cancelClose() {
    pendingTabCloses_.clear();
    closeCheck_.stop();
    closeState_ = CloseState::Idle;
    if (quitRequested_) tabs_.setEnabled(true);
    quitRequested_ = false;
    discardedOnQuit_.clear();
    if (books_.contains(closingBook_)) books_[closingBook_].widget->setEnabled(true);
    closingBook_ = -1;
    if (workspacePage_) QTimer::singleShot(0, this, &WorkbookWindow::revealWorkspaceBook);
}

void WorkbookWindow::finishClose() {
    closeCheck_.stop();
    if (quitRequested_) {
        closeState_ = CloseState::Idle;
        books_[closingBook_].widget->setEnabled(true);
        closingBook_ = -1;
        continueQuit();
        return;
    }
    closeState_ = CloseState::ClosingEditor;
    // CEF releases its child HWND asynchronously. Keep the Qt parent until DESTROYWINDOW.
    traceLifecycle("destroy editor", closingBook_);
    manager_.DestroyCefView(books_[closingBook_].editor()->GetId(), true);
}

void WorkbookWindow::askToCloseDuringExport() {
    if (exportClosePrompt_) { exportClosePrompt_->raise(); return; }
    auto* prompt = new QMessageBox(QMessageBox::Question, QStringLiteral("导出尚未完成"),
        QStringLiteral("正在准备或写入结果文件，何时退出 Excel Utils？"), QMessageBox::NoButton, this);
    exportClosePrompt_ = prompt;
    auto* wait = prompt->addButton(QStringLiteral("完成后退出"), QMessageBox::AcceptRole);
    auto* stop = prompt->addButton(QStringLiteral("取消任务并退出"), QMessageBox::DestructiveRole);
    auto* stay = prompt->addButton(QStringLiteral("继续使用"), QMessageBox::RejectRole);
    prompt->setDefaultButton(wait);
    prompt->setEscapeButton(stay);
    connect(prompt, &QMessageBox::finished, this, [this, prompt, wait, stop] {
        exportClosePrompt_ = nullptr;
        prompt->deleteLater();
        if (exportingTool_.isEmpty()) return;
        if (prompt->clickedButton() == wait) exportExit_ = ExportExit::AfterSave;
        else if (prompt->clickedButton() == stop) {
            exportExit_ = ExportExit::AfterCancel;
            if (!cancelFinanceSnapshot(exportingTool_) && headerJob_) {
                headerJob_->setProperty("cancelled", true);
                headerJob_->requestInterruption();
            }
        } else exportExit_ = ExportExit::Stay;
    });
    prompt->open();
}

void WorkbookWindow::closeEvent(QCloseEvent* event) {
    event->ignore();
    if (closing_) return;
    if (!exportingTool_.isEmpty()) {
        if (exportExit_ != ExportExit::AfterCancel) askToCloseDuringExport();
        return;
    }
    if (quitRequested_) return;
    quitRequested_ = true;
    pendingTabCloses_.clear();
    tabs_.setEnabled(false);
    // Give the active editor one event turn to report its last edit before checking all views.
    QTimer::singleShot(closeCheck_.interval(), this, &WorkbookWindow::continueQuit);
}

void WorkbookWindow::continueQuit() {
    if (!quitRequested_ || closing_ || closeState_ != CloseState::Idle) return;
    for (auto it = books_.cbegin(); it != books_.cend(); ++it) {
        auto* view = it->editor();
        if (!view || discardedOnQuit_.contains(it.key())) continue;
        if (view->GetModified() || view->IsSaveLocked() || view->IsBuilding()) {
            requestClose(it.key(), true);
            return;
        }
    }
    saveWorkspaceSessions();
    closing_ = true;
    hide();
    // Release all confirmed editors without waiting for each separate DESTROYWINDOW.
    // Their Qt parents stay alive until the SDK message loop has exited.
    QTimer::singleShot(0, this, [this] {
        for (int viewId : bookByViewId_.keys()) manager_.DestroyCefView(viewId, true);
        traceLifecycle("destroy remaining views");
        manager_.DestroyCefView(-1);
    });
}

void WorkbookWindow::homeCommand(const QString& command, const QString& argument) {
    const auto params = QJsonDocument::fromJson(argument.toUtf8()).object();
    if (command == "workspace:show") showWorkspace();
    else if (command == "app:settings") openThemeSettings();
    else if (command == "app:theme-ready") syncHomeTheme();
    else if (command == "workspace:tool-menu") {
        workspaceToolCatalog_ = params;
        if (workspaceToolsButton_) workspaceToolsButton_->setEnabled(!params.value("tools").toArray().isEmpty());
    }
    else if (command == "open:folder") chooseWorkbook(argument);
    else if (command == "finance:pick") chooseFinanceSources(params.value("directory").toString());
    else if (command == "finance:export") exportFinanceResult(params);
    else if (command.startsWith("header:")) headerMergeCommand(command, params);
    else if (command.startsWith("research:")) researchCommand(command, params);
    else if (command == "app:license") {
        const auto notice = QDir(QCoreApplication::applicationDirPath()).filePath("NOTICE.txt");
        QDesktopServices::openUrl(QUrl::fromLocalFile(notice));
    }
    else if (command == "open:recent") openWorkbook(params.value("path").toString());
    else if (command == "open:output") {
        const QFileInfo file(params.value("path").toString());
        if (file.suffix().compare("zip", Qt::CaseInsensitive) == 0) {
            if (!file.isFile() || !QDesktopServices::openUrl(QUrl::fromLocalFile(file.absoluteFilePath())))
                QMessageBox::warning(home_->window(), QStringLiteral("无法打开压缩包"), file.filePath());
        } else if (workspaceToolDialog_) {
            workspaceToolDialog_->accept();
            openBook(file.filePath(), !workspaceRoot_.isEmpty());
        } else {
            openWorkbook(file.filePath());
        }
    }
    else if (command == "recent:pinned") manager_.SetRecentPin(params.value("id").toInt(), params.value("pinned").toBool());
    else if (command == "files:explore") {
        const QFileInfo file(params.value("path").toString());
        if (file.isFile()) QDesktopServices::openUrl(QUrl::fromLocalFile(file.absolutePath()));
    }
}

void WorkbookWindow::financeReply(const QString& command, const QJsonObject& payload) {
    auto* data = new CAscExecCommandJS;
    data->put_Command(command.toStdWString());
    data->put_Param(QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)).toStdWString());
    auto* event = new CAscMenuEvent(ASC_MENU_EVENT_TYPE_CEF_EXECUTE_COMMAND_JS);
    event->m_pData = data;
    home_->GetCefView()->Apply(event);
    if (!exportingTool_.isEmpty() && command == exportingTool_ + ":result") {
        const auto intent = exportExit_;
        exportingTool_.clear();
        exportExit_ = ExportExit::Stay;
        if (exportClosePrompt_) exportClosePrompt_->reject();
        const auto type = payload.value("type").toString();
        if ((intent == ExportExit::AfterSave && type == "done" && !payload.value("path").toString().isEmpty()) ||
            (intent == ExportExit::AfterCancel && type == "cancelled"))
            QTimer::singleShot(0, this, [this] { close(); });
    }
}

namespace {
// The SDK owns a READ|WRITE handle with FILE_SHARE_READ. A reader must share
// the existing writer, and must release that handle before processing the ZIP.
QString copySavedWorkbook(const QString& path, const QString& destination) {
    std::unique_ptr<FILE, decltype(&fclose)> handle(
        _wfsopen(reinterpret_cast<const wchar_t*>(path.utf16()), L"rb", _SH_DENYNO), &fclose);
    QFile source;
    QFile snapshot(destination);
    if (!handle || !source.open(handle.get(), QIODevice::ReadOnly))
        return QStringLiteral("无法读取 %1 的已保存版本，请检查文件是否仍然存在或被其他程序独占。").arg(QFileInfo(path).fileName());
    if (!snapshot.open(QIODevice::ReadWrite | QIODevice::NewOnly))
        return QStringLiteral("无法创建工作簿快照。%1").arg(snapshot.errorString());
    QByteArray chunk(1024 * 1024, Qt::Uninitialized);
    auto copy = [&](bool verify) {
        while (!QThread::currentThread()->isInterruptionRequested()) {
            const qint64 count = source.read(chunk.data(), chunk.size());
            if (count < 0) return false;
            if (count == 0) return !verify || snapshot.atEnd();
            if (verify) {
                const auto saved = snapshot.read(count);
                if (saved.size() != count || memcmp(saved.constData(), chunk.constData(), size_t(count)) != 0) return false;
            } else if (snapshot.write(chunk.constData(), count) != count) return false;
        }
        return false;
    };
    if (!copy(false) || !snapshot.flush())
        return QStringLiteral("复制已保存版本失败，请检查文件和临时目录的可用空间。");
    // The SDK saves in place through its existing handle. Verify the copy
    // against a second read in case a save finished before its Qt notification.
    if (!source.seek(0) || !snapshot.seek(0) || !copy(true))
        return QStringLiteral("读取期间工作簿发生变化，请重新添加。");
    return {};
}
}

void WorkbookWindow::prepareFinanceInputs(const QStringList& paths, PreparedInputs ready,
                                          const QString& tool, QDeadlineTimer deadline, quint64 token) {
    if (token && financePreparations_.value(tool) != token) return;
    if (!token) {
        token = ++nextFinancePreparation_;
        financePreparations_[tool] = token;
    }
    auto finish = [=](const QJsonObject& mapping, const QString& error) {
        if (financePreparations_.value(tool) != token) return;
        financePreparations_.remove(tool);
        ready(mapping, error);
    };
    if (deadline.hasExpired()) {
        finish({}, QStringLiteral("工作簿仍在保存，请在编辑器完成保存后重新添加。")); return;
    }
    auto retry = [=] { prepareFinanceInputs(paths, ready, tool, deadline, token); };
    const auto generation = editorSaveGeneration_;
    QStringList opened;
    for (const auto& path : paths) {
        const int id = bookId(path);
        if (id < 0 || !books_[id].editor() || opened.contains(path)) continue;
        if (books_[id].editor()->IsBuilding()) {
            QTimer::singleShot(120, this, retry); return;
        }
        opened.append(path);
    }
    if (opened.isEmpty()) { finish({}, {}); return; }
    auto workspace = std::make_shared<QTemporaryDir>();
    if (!workspace->isValid()) { finish({}, workspace->errorString()); return; }
    QJsonObject mapping;
    for (int i = 0; i < opened.size(); ++i)
        mapping[opened[i]] = workspace->filePath(QString::number(i) + ".xlsx");
    const auto error = std::make_shared<QString>();
    auto* job = QThread::create([=] {
        for (const auto& path : opened) {
            *error = copySavedWorkbook(path, mapping.value(path).toString());
            if (!error->isEmpty()) return;
        }
    });
    job->setParent(this);
    job->setProperty("financeTool", tool);
    financeCopyJobs_.insert(job);
    connect(job, &QThread::finished, this, [=] {
        financeCopyJobs_.remove(job);
        job->deleteLater();
        if (closing_ || financePreparations_.value(tool) != token) return;
        bool changed = generation != editorSaveGeneration_;
        for (const auto& path : opened) {
            const int id = bookId(path);
            if (id < 0 || !books_[id].editor() || books_[id].editor()->IsBuilding()) changed = true;
        }
        if (changed) { QTimer::singleShot(120, this, retry); return; }
        if (!error->isEmpty()) { finish({}, *error); return; }
        for (const auto& path : opened) financeSnapshots_.insert(tool + "/" + path, workspace);
        finish(mapping, {});
    });
    job->start();
}

void WorkbookWindow::stopFinanceSnapshots() {
    for (auto* job : financeCopyJobs_) job->requestInterruption();
    for (auto* job : financeCopyJobs_) job->wait();
}

bool WorkbookWindow::cancelFinanceSnapshot(const QString& tool) {
    if (!financePreparations_.remove(tool)) return false;
    for (auto* job : financeCopyJobs_) {
        if (job->property("financeTool").toString() == tool) job->requestInterruption();
    }
    financeReply(tool + ":result", {{"type", "cancelled"}});
    return true;
}

void WorkbookWindow::registerFinanceReadPaths(const QStringList& paths, const QJsonObject& mapping, const QString& tool) {
    auto& registered = tool == "research" ? researchReadPaths_ : headerReadPaths_;
    for (const auto& path : paths) {
        if (mapping.contains(path)) registered[path] = mapping.value(path);
        else {
            registered.remove(path);
            financeSnapshots_.remove(tool + "/" + path);
        }
    }
}

bool WorkbookWindow::snapshotNewlyOpenedSource(const QString& mode, const QJsonObject& request, const QString& destination) {
    if (books_.isEmpty()) return false;
    const bool research = mode.startsWith("research-");
    const QString tool = research ? "research" : "header";
    const auto& registered = research ? researchReadPaths_ : headerReadPaths_;
    QStringList needed;
    auto include = [&](const QString& path) {
        const int id = bookId(path);
        if (!path.isEmpty() && !registered.contains(path) && id >= 0 && books_[id].editor()) needed.append(path);
    };
    for (const auto& item : request.value("paths").toArray()) include(item.toString());
    for (const auto& item : request.value("sources").toArray()) include(item.toObject().value("path").toString());
    if (needed.isEmpty()) return false;
    const QFileInfo target(destination);
    const bool existed = !destination.isEmpty() && target.exists();
    const auto modified = existed ? target.lastModified() : QDateTime();
    const auto size = existed ? target.size() : 0;
    prepareFinanceInputs(needed, [=](const QJsonObject& mapping, const QString& error) {
        if (!error.isEmpty()) { financeReply(tool + ":result", {{"error", error}}); return; }
        const QFileInfo current(destination);
        if (!destination.isEmpty() && (existed != current.exists() ||
            (existed && (current.size() != size || current.lastModified() != modified)))) {
            financeReply(tool + ":result", {{"error", QStringLiteral("准备来源期间目标文件发生变化，请重新选择导出位置。")}});
            return;
        }
        registerFinanceReadPaths(needed, mapping, tool);
        startHeaderJob(mode, request, destination);
    }, tool);
    return true;
}

QStringList WorkbookWindow::pickToolWorkbooks(const QString& title, const QString& directory, bool single) {
    const QFileInfo requested(directory);
    const auto start = requested.isAbsolute() && requested.isDir() ? requested.absoluteFilePath() : toolDirectory_;
    QFileDialog dialog(home_->window(), title, start, QStringLiteral("Excel 工作簿 (*.xlsx)"));
    dialog.setFileMode(single ? QFileDialog::ExistingFile : QFileDialog::ExistingFiles);
    if (dialog.exec() != QDialog::Accepted) return {};
    const auto files = dialog.selectedFiles();
    if (!files.isEmpty())
        financeReply("tools:source-folder", {{"directory", QFileInfo(files.first()).absolutePath()}});
    return files;
}

void WorkbookWindow::chooseFinanceSources(const QString& directory) {
    const auto paths = pickToolWorkbooks(QStringLiteral("添加财务工作簿"), directory);
    prepareFinanceInputs(paths, [this, paths](const QJsonObject& mapping, const QString& error) {
        QJsonObject reply;
        if (!error.isEmpty()) reply["error"] = error;
        else {
            for (const auto& path : paths) {
                const QString readPath = mapping.value(path).toString(path);
                manager_.AddFileToLocalResolver(readPath.toStdWString());
            }
            reply["paths"] = QJsonArray::fromStringList(paths);
            reply["readPaths"] = mapping;
            if (!mapping.isEmpty()) reply["notice"] = QStringLiteral("当前打开的工作簿已取添加时的已保存版本。要使用后续修改，请保存后重新添加。");
        }
        financeReply("finance:sources", reply);
    }, "finance");
}

void WorkbookWindow::exportFinanceResult(const QJsonObject& params) {
    const auto name = QFileInfo(params.value("name").toString()).fileName();
    QFileDialog dialog(home_->window(), QStringLiteral("导出财务结果"), name, QStringLiteral("Excel 工作簿 (*.xlsx)"));
    dialog.setAcceptMode(QFileDialog::AcceptSave);
    dialog.setDefaultSuffix("xlsx");
    QJsonObject reply;
    if (dialog.exec() == QDialog::Accepted) {
        const auto path = dialog.selectedFiles().value(0);
        const QFileInfo target(path);
        bool source = bookId(target.absoluteFilePath()) >= 0;
        for (const auto& item : params.value("sources").toArray()) {
            if (target == QFileInfo(item.toString())) source = true;
        }
        if (source) reply["error"] = QStringLiteral("目标是来源或正在编辑的工作簿。请另选文件名。");
        else if (target.suffix().compare("xlsx", Qt::CaseInsensitive) != 0)
            reply["error"] = QStringLiteral("请使用 .xlsx 扩展名。");
        else {
            const auto bytes = QByteArray::fromBase64(params.value("data").toString().toLatin1(), QByteArray::AbortOnBase64DecodingErrors);
            QSaveFile file(path);
            if (bytes.isEmpty()) reply["error"] = QStringLiteral("导出内容为空，请重新预览。");
            else if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit())
                reply["error"] = QStringLiteral("无法保存 %1。%2").arg(target.fileName(), file.errorString());
            else reply["path"] = path;
        }
    }
    financeReply("finance:exported", reply);
}

void WorkbookWindow::chooseSavePath(CAscLocalSaveFileDialog* data) {
    QFileDialog dialog(this, QStringLiteral("另存为"), QString::fromStdWString(data->get_Path()),
        QStringLiteral("Excel 工作簿 (*.xlsx)"));
    dialog.setAcceptMode(QFileDialog::AcceptSave);
    dialog.setDefaultSuffix("xlsx");
    auto* result = new CAscLocalSaveFileDialog;
    result->put_Id(data->get_Id());
    while (dialog.exec() == QDialog::Accepted) {
        const auto path = dialog.selectedFiles().value(0);
        if (QFileInfo(path).suffix().compare("xlsx", Qt::CaseInsensitive) != 0) {
            QMessageBox::warning(this, QStringLiteral("另存为"), QStringLiteral("文件名请使用 .xlsx 扩展名。"));
            continue;
        }
        const int other = bookId(path);
        if (other >= 0 && other != bookByViewId_.value(data->get_Id(), -1)) {
            QMessageBox::warning(this, QStringLiteral("另存为"), QStringLiteral("该工作簿已打开，请另选文件名。"));
            continue;
        }
        result->put_Path(path.toStdWString());
        result->put_FileType(AVS_OFFICESTUDIO_FILE_SPREADSHEET_XLSX);
        break;
    }
    auto* response = new CAscMenuEvent(ASC_MENU_EVENT_TYPE_CEF_LOCALFILE_SAVE_PATH);
    response->m_pData = result;
    manager_.Apply(response);
}

void WorkbookWindow::OnEvent(CAscCefMenuEvent* event) {
    // SDK callbacks can arrive on a CEF thread. Keep the payload alive until Qt consumes it.
    if (event->m_nType == ASC_MENU_EVENT_TYPE_CEF_DESTROYWINDOW)
        traceLifecycle("SDK destroyed view", event->get_SenderId());
    const std::shared_ptr<CAscCefMenuEvent> held(event, [](CAscCefMenuEvent* e) { e->Release(); });
    QMetaObject::invokeMethod(this, [this, held] { handleEvent(held.get()); }, Qt::QueuedConnection);
}

void WorkbookWindow::handleEvent(CAscCefMenuEvent* event) {
    const auto type = event->m_nType;
    if (type == ASC_MENU_EVENT_TYPE_UI_THREAD_MESSAGE) {
        event->AddRef();
        manager_.Apply(event);
        return;
    }
    if (closing_) return;
    const int viewId = event->get_SenderId();
    const int sender = bookByViewId_.value(viewId, -1);
    if (type == ASC_MENU_EVENT_TYPE_CEF_DESTROYWINDOW && sender >= 0) {
        bookByViewId_.remove(viewId);
        editorClosed(sender);
        return;
    }
    if (type == ASC_MENU_EVENT_TYPE_CEF_CHECK_KEYBOARD) { manager_.CheckKeyboard(); return; }
    if (type == ASC_MENU_EVENT_TYPE_CEF_EXECUTE_COMMAND && event->get_SenderId() == home_->GetCefView()->GetId()) {
        auto* data = static_cast<CAscExecCommand*>(event->m_pData);
        homeCommand(QString::fromStdWString(data->get_Command()), QString::fromStdWString(data->get_Param()));
        return;
    }
    if (type == ASC_MENU_EVENT_TYPE_CEF_LOCALFILES_OPEN) {
        const auto& files = static_cast<CAscLocalOpenFiles*>(event->m_pData)->get_Files();
        for (const auto& file : files) {
            const auto path = QString::fromStdWString(file);
            if (QFileInfo(path).suffix().compare("xlsx", Qt::CaseInsensitive) == 0) {
                openWorkbook(path);
                return;
            }
        }
        if (!files.empty()) openWorkbook(QString::fromStdWString(files.front()));
        return;
    }
    if (!books_.contains(sender) || (sender == closingBook_ && closeState_ == CloseState::ClosingEditor)) return;
    auto& book = books_[sender];
    const int index = book.tabs->indexOf(book.widget);
    auto* view = static_cast<CCefViewEditor*>(book.widget->GetCefView());
    switch (type) {
    case ASC_MENU_EVENT_TYPE_CEF_ONKEYBOARDDOWN: {
        auto* key = static_cast<CAscKeyboardDown*>(event->m_pData);
        if (book.tabs == workspaceTabs_ && visibleBookId() == sender && key->get_IsCtrl() && !key->get_IsAlt()) {
            if (key->get_KeyCode() == Qt::Key_F && key->get_IsShift()) setWorkspaceView(true);
            else if (key->get_KeyCode() == Qt::Key_E && key->get_IsShift()) setWorkspaceView(false);
            else if (key->get_KeyCode() == Qt::Key_O && key->get_IsShift()) quickOpenWorkbook();
            else if (key->get_KeyCode() == VK_TAB) cycleWorkspaceTab(key->get_IsShift());
        }
        break;
    }
    case ASC_MENU_EVENT_TYPE_CEF_EXECUTE_COMMAND: {
        auto* data = static_cast<CAscExecCommand*>(event->m_pData);
        if (data->get_Command() == L"workspace:located" && locateTimer_ && visibleBookId() == sender) {
            const auto reply = QJsonDocument::fromJson(QString::fromStdWString(data->get_Param()).toUtf8()).object();
            if (reply["token"].toString() == QString::number(locateRequest_)) {
                locateTimer_->stop();
                if (reply["status"].toString() == "unavailable")
                    workspaceSearch_->showMessage(QStringLiteral("工作表已隐藏或更名，请刷新索引。"));
            }
        } else if (data->get_Command() == L"editor:event") {
            const auto params = QString::fromStdWString(data->get_Param()).toUtf8();
            const auto action = QJsonDocument::fromJson(params).object().value("action").toString();
            if (action == "file:open") chooseWorkbook(QFileInfo(book.path).absolutePath());
            else if (action == "file:close") requestClose(sender, false);
        }
        break;
    }
    case ASC_MENU_EVENT_TYPE_CEF_TABEDITORTYPE:
        view->SetEditorType(AscEditorType::etSpreadsheet);
        break;
    case ASC_MENU_EVENT_TYPE_CEF_DOCUMENT_NAME: {
        const auto path = QString::fromStdWString(static_cast<CAscDocumentName*>(event->m_pData)->get_Path());
        if (!path.isEmpty() && book.path != QDir::fromNativeSeparators(path)) {
            book.path = QDir::fromNativeSeparators(path);
            ++editorSaveGeneration_;
        }
        book.modified = view->GetModified();
        updateBookTitles();
        book.tabs->setTabToolTip(index, QDir::toNativeSeparators(book.path));
        break;
    }
    case ASC_MENU_EVENT_TYPE_CEF_MODIFY_CHANGED: {
        book.modified = static_cast<CAscDocumentModifyChanged*>(event->m_pData)->get_Changed();
        updateBookTitles();
        break;
    }
    case ASC_MENU_EVENT_TYPE_CEF_LOCALFILE_SAVE:
        chooseSavePath(static_cast<CAscLocalSaveFileDialog*>(event->m_pData));
        break;
    case ASC_MENU_EVENT_TYPE_DOCUMENTEDITORS_SAVE_YES_NO: {
        const auto answer = QMessageBox::question(this, QStringLiteral("保存工作簿"),
            QStringLiteral("此操作需要先保存工作簿。现在保存吗？"), QMessageBox::Yes | QMessageBox::No, QMessageBox::No);
        auto* result = new CAscEditorSaveQuestion;
        result->put_Value(answer == QMessageBox::Yes);
        auto* response = new CAscMenuEvent(type);
        response->m_pData = result;
        view->Apply(response);
        break;
    }
    case ASC_MENU_EVENT_TYPE_CEF_ONSAVE:
        ++editorSaveGeneration_;
        if (static_cast<CAscDocumentOnSaveData*>(event->m_pData)->get_IsCancel()) {
            traceLifecycle("save cancelled or failed", sender);
            if (sender == closingBook_ && closeState_ != CloseState::Idle && closeState_ != CloseState::Prompting) cancelClose();
        } else {
            traceLifecycle("save completed", sender);
            if (workspaceSearch_ && !quitRequested_) workspaceSearch_->fileSaved(book.path);
            book.lastSave.start();
            if (sender == closingBook_ && closeState_ == CloseState::Saving) closeState_ = CloseState::Checking;
        }
        break;
    }
}
