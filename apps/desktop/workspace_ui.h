#pragma once
#include <QColor>
#include <QDialog>
#include <QFileSystemModel>
#include <QIcon>
#include <QJsonObject>
#include <QModelIndex>
#include <QPushButton>
#include <QSet>
#include <QSortFilterProxyModel>
#include <QStackedWidget>
#include <QStringList>
#include <QStyledItemDelegate>
#include <QTreeView>
#include <QVariantAnimation>
#include <QVector>
#include <QWidget>
#include <functional>

class QToolButton;
class QLabel;
class QHBoxLayout;
class QVBoxLayout;
class QGridLayout;

namespace ExcelUi {

double scaleFor(const QWidget* widget);
int scaled(const QWidget* widget, int px);
bool motionEnabled();

struct AccentPreset {
    QString id;
    QString label;
    QColor lightColor;
    QColor darkColor;
};

struct ThemePalette {
    bool dark = false;
    QString accentId = QStringLiteral("emerald");
    QString accentLabel = QStringLiteral("翡翠绿");
    QColor accent;
    QColor accentHover;
    QColor accentPressed;
    QColor accentSoft;
    QColor accentSoftHover;
    QColor accentBorder;
    QColor accentText;
    QColor accentMutedText;

    QColor bgChrome;
    QColor bgToolbar;
    QColor bgRail;
    QColor bgSidebar;
    QColor bgSurface;
    QColor bgCanvas;
    QColor bgCanvasDot;
    QColor bgCard;
    QColor bgInput;
    QColor bgHover;
    QColor bgSelected;
    QColor bgStatusBar;
    QColor bgTabStrip;
    QColor border;
    QColor borderControl;

    QColor textPrimary;
    QColor textBody;
    QColor textSecondary;
    QColor textMuted;
    QColor textFaint;
    QColor iconNormal;

    QColor kbdBg;
    QColor kbdBorder;
    QColor kbdText;
    QColor matchBg;
    QColor matchFg;
    QColor tooltipBg;
    QColor tooltipFg;
    QColor tooltipBorder;
    QColor danger;
    QColor liveDot;

    QJsonObject toWebPayload() const;
};

const QVector<AccentPreset>& accentPresets();
const ThemePalette& currentTheme();
void setCurrentTheme(bool dark, const QString& accentIdOrHex);
QString applyThemeTokens(const QString& qssTemplate);
QIcon tintedIcon(const QString& resourcePath, const QColor& color, int px = 24);
QIcon themedXlsxIcon(const QColor& accent, bool dark, int px = 20);

// Sleek 3px themed indeterminate scanning indicator with smooth fade in/out.
class AnimatedScanBar final : public QWidget {
public:
    explicit AnimatedScanBar(QWidget* parent = nullptr);
    void setRunning(bool running);
    bool isRunning() const { return running_; }

protected:
    void paintEvent(QPaintEvent* event) override;

private:
    bool running_ = false;
    qreal phase_ = 0.0;
    qreal opacity_ = 0.0;
    QVariantAnimation* sweep_ = nullptr;
    QVariantAnimation* fade_ = nullptr;
};

// Activity rail with a gliding accent indicator pill, sidebar toggle, and bottom-left settings button.
class AnimatedActivityRail final : public QWidget {
public:
    explicit AnimatedActivityRail(QWidget* parent = nullptr);
    void registerViewButton(int id, QToolButton* button);
    void setActiveId(int id, bool animate = true);
    void setToggleButton(QToolButton* button);
    void setSettingsButton(QToolButton* button);
    QToolButton* settingsButton() const { return settingsButton_; }
    void updateScale();
    void applyTheme();

protected:
    void paintEvent(QPaintEvent* event) override;
    void resizeEvent(QResizeEvent* event) override;

private:
    qreal targetYFor(int id) const;
    QVBoxLayout* layout_ = nullptr;
    QHash<int, QToolButton*> buttons_;
    QToolButton* toggleButton_ = nullptr;
    QToolButton* settingsButton_ = nullptr;
    int activeId_ = 0;
    qreal indicatorY_ = -1.0;
    QVariantAnimation* slideAnim_ = nullptr;
};

// Cross-fade + subtle horizontal slide transition for sidebar views.
class AnimatedSidebarStack final : public QStackedWidget {
public:
    explicit AnimatedSidebarStack(QWidget* parent = nullptr);
    void animateToIndex(int index);

private:
    class TransitionOverlay;
    TransitionOverlay* overlay_ = nullptr;
    QVariantAnimation* anim_ = nullptr;
};

// Custom-painted Command Center quick-open pill with keycap badge and smooth hover glow.
class CommandSearchPill final : public QPushButton {
public:
    explicit CommandSearchPill(QWidget* parent = nullptr);
    void setPlaceholder(const QString& text);
    void setShortcutHint(const QString& hint);
    void applyTheme();
    QSize sizeHint() const override;

protected:
    void paintEvent(QPaintEvent* event) override;
    void enterEvent(QEvent* event) override;
    void leaveEvent(QEvent* event) override;

private:
    QString placeholder_;
    QString shortcutHint_;
    QIcon searchIcon_;
    qreal hover_ = 0.0;
    QVariantAnimation* hoverAnim_ = nullptr;
};

// Smooth animated collapsible container for inline forms (e.g., new workbook creation).
class CollapsiblePanel final : public QWidget {
public:
    explicit CollapsiblePanel(QWidget* content, QWidget* parent = nullptr);
    void setExpanded(bool expanded, bool animate = true);
    bool isExpanded() const { return expanded_; }

private:
    QWidget* content_ = nullptr;
    bool expanded_ = false;
    QVariantAnimation* heightAnim_ = nullptr;
};

// Interactive welcome action card with animated accent hover glow and keycap badge.
class WelcomeActionCard final : public QPushButton {
public:
    WelcomeActionCard(const QString& iconPath, const QString& title,
                      const QString& subtitle, const QString& shortcut,
                      bool accentIcon = false, QWidget* parent = nullptr);
    void applyTheme();
    QSize sizeHint() const override;

protected:
    void paintEvent(QPaintEvent* event) override;
    void enterEvent(QEvent* event) override;
    void leaveEvent(QEvent* event) override;

private:
    QString iconPath_;
    bool accentIcon_ = false;
    QIcon icon_;
    QString title_;
    QString subtitle_;
    QString shortcut_;
    qreal hover_ = 0.0;
    QVariantAnimation* hoverAnim_ = nullptr;
};

// Rich architectural dot-grid welcome canvas replacing the plain QLabel empty state.
class WorkspaceWelcomeWidget final : public QWidget {
public:
    struct Callbacks {
        std::function<void()> openFolder;
        std::function<void(const QString&)> openRecentWorkspace;
        std::function<void()> quickOpen;
        std::function<void()> openSearch;
        std::function<void()> newWorkbook;
        std::function<void()> openTools;
        std::function<void()> revealFolder;
    };

    explicit WorkspaceWelcomeWidget(Callbacks callbacks, QWidget* parent = nullptr);
    void setWorkspaceState(const QString& root, bool valid, const QStringList& recent);
    void applyTheme();

protected:
    void paintEvent(QPaintEvent* event) override;

private:
    Callbacks callbacks_;
    QString root_;
    bool valid_ = false;
    QLabel* titleLabel_ = nullptr;
    QLabel* subtitleLabel_ = nullptr;
    QPushButton* pathButton_ = nullptr;
    QWidget* actionsGridWrap_ = nullptr;
    QWidget* emptyActionsWrap_ = nullptr;
    QWidget* recentWrap_ = nullptr;
    QHBoxLayout* recentLayout_ = nullptr;
    QPushButton* openFolderBtn_ = nullptr;
    QVector<WelcomeActionCard*> cards_;
};

// Filter proxy for QFileSystemModel that keeps directories containing matching .xlsx files.
class WorkspaceFilterProxy final : public QSortFilterProxyModel {
public:
    explicit WorkspaceFilterProxy(QObject* parent = nullptr);
    void setRootDirectory(const QString& rootPath);
    void setFilterQuery(const QString& query);
    QString filterQuery() const { return query_; }

protected:
    bool filterAcceptsRow(int sourceRow, const QModelIndex& sourceParent) const override;
    bool lessThan(const QModelIndex& left, const QModelIndex& right) const override;

private:
    bool directoryHasMatch(const QString& dirPath, int depth) const;
    QString rootPath_;
    QString query_;
    mutable QHash<QString, bool> dirMatchCache_;
};

// Custom-painted Explorer tree view eliminating Qt's ugly split-branch selection artifacts.
class WorkspaceTreeView final : public QTreeView {
public:
    explicit WorkspaceTreeView(QWidget* parent = nullptr);
    void setOpenBooks(const QSet<QString>& openCanonicalPaths, const QString& activeCanonicalPath);
    void applyTheme();
    bool isOpenBook(const QString& canonicalPath) const;
    bool isActiveBook(const QString& canonicalPath) const;
    QModelIndex hoveredIndex() const { return hoveredIndex_; }
    qreal hoverOpacity() const { return hoverOpacity_; }

protected:
    void drawRow(QPainter* painter, const QStyleOptionViewItem& options, const QModelIndex& index) const override;
    void drawBranches(QPainter*, const QRect&, const QModelIndex&) const override {}
    void mouseMoveEvent(QMouseEvent* event) override;
    void leaveEvent(QEvent* event) override;

private:
    QString filePathFor(const QModelIndex& index) const;
    bool isDirFor(const QModelIndex& index) const;
    QSet<QString> openPaths_;
    QString activePath_;
    QModelIndex hoveredIndex_;
    qreal hoverOpacity_ = 0.0;
    QVariantAnimation* hoverAnim_ = nullptr;
    QIcon chevronRight_;
    QIcon chevronDown_;
    QIcon folderIcon_;
    QIcon folderOpenIcon_;
    QIcon xlsxIcon_;
};

// Floating Appearance Settings popover (Light/Dark mode cards + Theme Accent Color swatches + Custom Color).
class ThemeSettingsDialog final : public QDialog {
public:
    using OnThemeChanged = std::function<void(bool dark, const QString& accent)>;
    ThemeSettingsDialog(OnThemeChanged onChanged, std::function<void()> onCheckUpdate, QWidget* parent = nullptr);
    void popupNear(const QPoint& globalBottomLeft);
    void syncFromTheme();

protected:
    void changeEvent(QEvent* event) override;

private:
    class ModeCard;
    class SwatchButton;
    OnThemeChanged onChanged_;
    bool pickingColor_ = false;
    bool wasActive_ = false;
    ModeCard* lightCard_ = nullptr;
    ModeCard* darkCard_ = nullptr;
    QLabel* accentBadge_ = nullptr;
    QVector<SwatchButton*> swatches_;
    SwatchButton* customSwatch_ = nullptr;
    QToolButton* closeBtn_ = nullptr;
};

} // namespace ExcelUi
