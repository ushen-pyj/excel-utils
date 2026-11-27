#pragma once
#include <QElapsedTimer>
#include <QDeadlineTimer>
#include <QHash>
#include <QJsonObject>
#include <QMainWindow>
#include <QSet>
#include <QTabWidget>
#include <QTimer>
#include <qcefview.h>
#include <functional>
#include <memory>

class QComboBox;
class QDialog;
class QVBoxLayout;
class QPushButton;
class WorkspaceSearch;
class QFileSystemModel;
class QLabel;
class QLineEdit;
class QMessageBox;
class QSplitter;
class QToolButton;
class QButtonGroup;
class QThread;
class QTemporaryDir;

namespace ExcelUi {
class AnimatedActivityRail;
class AnimatedSidebarStack;
class CollapsiblePanel;
class CommandSearchPill;
class ThemeSettingsDialog;
class WorkspaceFilterProxy;
class WorkspaceTreeView;
class WorkspaceWelcomeWidget;
}

void traceLifecycle(const char* message, int viewId = -1);

class WorkbookWindow final : public QMainWindow, public NSEditorApi::CAscCefMenuEventListener {
public:
    explicit WorkbookWindow(CAscApplicationManager& manager);
    ~WorkbookWindow() override;
    void openWorkbook(const QString& path);
    void showWorkspace(const QString& initialRoot = {});
    void restoreWorkspaceOnStartup();
    void OnEvent(NSEditorApi::CAscCefMenuEvent* event) override;
    QString updateInstaller() const { return closing_ ? updateInstaller_ : QString(); }
protected:
    void closeEvent(QCloseEvent* event) override;
    void changeEvent(QEvent* event) override;
    bool nativeEvent(const QByteArray& type, void* message, long* result) override;
    bool eventFilter(QObject* watched, QEvent* event) override;
private:
    void setupWindowChrome();
    void loadSavedTheme();
    void applyTheme(bool dark, const QString& accent, bool persist = true);
    void syncHomeTheme();
    void updateCaptionIcons();
    void openThemeSettings(const QPoint& anchorGlobal = {});
    void checkForAppUpdate();
    QString updateInstaller_;
    void updateChromeScale();
    bool isCaptionSpace(const QPoint& position) const;
    void toggleMaximized();
    void handleEvent(NSEditorApi::CAscCefMenuEvent* event);
    void homeCommand(const QString& command, const QString& argument);
    QStringList pickToolWorkbooks(const QString& title, const QString& directory, bool single = false);
    void chooseFinanceSources(const QString& directory);
    using PreparedInputs = std::function<void(const QJsonObject&, const QString&)>;
    void prepareFinanceInputs(const QStringList& paths, PreparedInputs ready, const QString& tool = "header",
                              QDeadlineTimer deadline = QDeadlineTimer(60000), quint64 token = 0);
    void registerFinanceReadPaths(const QStringList& paths, const QJsonObject& readPaths, const QString& tool = "header");
    bool snapshotNewlyOpenedSource(const QString& mode, const QJsonObject& request, const QString& destination);
    void stopFinanceSnapshots();
    bool cancelFinanceSnapshot(const QString& tool);
    void researchCommand(const QString& command, const QJsonObject& params);
    void exportFinanceResult(const QJsonObject& params);
    void financeReply(const QString& command, const QJsonObject& payload);
    void headerMergeCommand(const QString& command, const QJsonObject& params);
    void startHeaderJob(const QString& mode, QJsonObject request, const QString& destination = {});
    void askToCloseDuringExport();
    QString exportingTool_;
    QMessageBox* exportClosePrompt_ = nullptr;
    enum class ExportExit { Stay, AfterSave, AfterCancel };
    ExportExit exportExit_ = ExportExit::Stay;
    QThread* headerJob_ = nullptr;
    QSet<QString> headerPaths_;
    QJsonObject headerReadPaths_, researchReadPaths_;
    QHash<QString, std::shared_ptr<QTemporaryDir>> financeSnapshots_;
    QSet<QThread*> financeCopyJobs_;
    QHash<QString, quint64> financePreparations_;
    quint64 nextFinancePreparation_ = 0;
    quint64 editorSaveGeneration_ = 0;
    struct Book {
        QCefView* widget;
        QTabWidget* tabs;
        QString path;
        QString root;
        QElapsedTimer lastSave;
        bool modified = false;
        CCefViewEditor* editor() const { return static_cast<CCefViewEditor*>(widget->GetCefView()); }
    };
    QHash<int, Book> books_;
    int nextBookId_ = 0;
    QHash<int, int> bookByViewId_;
    int bookId(const QString& path) const;
    int bookId(const QWidget* page) const;
    int visibleBookId() const;
    void updateBookTitles();
    void focusBook(int id);
    void openBook(const QString& path, bool inWorkspace, bool restoring = false);
    bool loadBook(int id);
    void removeBook(int id);
    void selectWorkspace(const QString& path, bool remember = true);
    void refreshWorkspaceTabs();
    void cycleWorkspaceTab(bool previous);
    void showWorkspaceTabMenu(const QPoint& position);
    void closeNextWorkspaceTab();
    void quickOpenWorkbook();
    QWidget* makeWorkspaceExplorer();
    void setWorkspaceView(bool search);
    void toggleWorkspaceSidebar();
    void syncWorkspaceTreeIndicators();
    void showExplorerContextMenu(const QPoint& position);
    void revealWorkspaceBook();
    void openSearchHit(const QString& path, const QString& sheet, const QString& address, bool hidden);
    void rememberWorkspaceTab();
    void saveWorkspaceSessions();
    void launchWorkspaceTool(const QString& mode, const QString& title);
    QJsonObject workspaceToolCatalog_;
    QToolButton* workspaceToolsButton_ = nullptr;
    QPushButton* workspaceBrowseButton_ = nullptr;
    QToolButton* explorerCreateBtn_ = nullptr;
    QToolButton* explorerCollapseBtn_ = nullptr;
    ExcelUi::ThemeSettingsDialog* themeDialog_ = nullptr;
    QDialog* workspaceToolDialog_ = nullptr;
    QWidget* workspacePage_ = nullptr;
    QComboBox* workspacePicker_ = nullptr;
    ExcelUi::CommandSearchPill* quickOpenButton_ = nullptr;
    QDialog* quickOpenDialog_ = nullptr;
    QFileSystemModel* workspaceModel_ = nullptr;
    ExcelUi::WorkspaceFilterProxy* workspaceProxy_ = nullptr;
    ExcelUi::WorkspaceTreeView* workspaceTree_ = nullptr;
    QLineEdit* workspaceFilterInput_ = nullptr;
    ExcelUi::AnimatedActivityRail* workspaceRail_ = nullptr;
    ExcelUi::AnimatedSidebarStack* workspaceSidebar_ = nullptr;
    QSplitter* workspaceSplitter_ = nullptr;
    QButtonGroup* workspaceViews_ = nullptr;
    QLabel* workspaceRootLabel_ = nullptr;
    ExcelUi::CollapsiblePanel* newWorkbookPanel_ = nullptr;
    QWidget* newWorkbookForm_ = nullptr;
    QString newWorkbookDirectory_;
    std::function<void(const QString&)> openNewWorkbookForm_;
    WorkspaceSearch* workspaceSearch_ = nullptr;
    QTimer* locateTimer_ = nullptr;
    quint64 locateRequest_ = 0;
    QTabWidget* workspaceTabs_ = nullptr;
    ExcelUi::WorkspaceWelcomeWidget* workspaceWelcome_ = nullptr;
    QLabel* workspaceStatusLabel_ = nullptr;
    QLabel* workspaceOpenCountLabel_ = nullptr;
    int savedSidebarWidth_ = 276;
    bool sidebarCollapsed_ = false;
    QString workspaceRoot_, toolDirectory_;
    QStringList recentWorkspaces_;
    QSet<QString> loadedWorkspaces_;
    QHash<QString, int> activeWorkspaceBooks_;
    void requestClose(int id, bool quit);
    void checkClose();
    void cancelClose();
    void finishClose();
    void continueQuit();
    void editorClosed(int id);
    void chooseWorkbook(const QString& directory);
    void chooseSavePath(NSEditorApi::CAscLocalSaveFileDialog* data);
    CAscApplicationManager& manager_;
    QTabWidget tabs_;
    QWidget* captionControls_ = nullptr;
    QToolButton* minimizeButton_ = nullptr;
    QToolButton* maximizeButton_ = nullptr;
    QToolButton* closeButton_ = nullptr;
    QCefView* home_ = nullptr;
    QVBoxLayout* homeLayout_ = nullptr;
    int closingBook_ = -1;
    QList<int> pendingTabCloses_;
    enum class CloseState { Idle, Checking, Prompting, Saving, ClosingEditor };
    CloseState closeState_ = CloseState::Idle;
    QTimer closeCheck_;
    QElapsedTimer closeStarted_;
    bool quitRequested_ = false;
    QSet<int> discardedOnQuit_;
    bool closing_ = false;
};
