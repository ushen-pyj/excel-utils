#pragma once
#include <QJsonObject>
#include <QSet>
#include <QThread>
#include <QTimer>
#include <QWidget>
#include <functional>

class QLabel;
class QLineEdit;
class QTreeWidget;
class QPushButton;
class QToolButton;
namespace ExcelUi { class AnimatedScanBar; }

class WorkspaceSearch final : public QWidget {
public:
    using OpenCell = std::function<void(const QString&, const QString&, const QString&, bool)>;
    WorkspaceSearch(OpenCell open, std::function<void()> showFiles, QWidget* parent);
    ~WorkspaceSearch() override;
    void setRoot(const QString& root);
    void fileSaved(const QString& path);
    void focusSearch();
    void showMessage(const QString& message);
    void applyTheme();
private:
    bool eventFilter(QObject* object, QEvent* event) override;
    QString queryText() const;
    void openSelectedResult();
    void schedule();
    void run();
    void applyReply(const QJsonObject& reply);
    QString root_;
    OpenCell open_;
    std::function<void()> showFiles_;
    QLineEdit* input_;
    QToolButton* regex_;
    ExcelUi::AnimatedScanBar* scanBar_;
    QLabel* status_;
    QTreeWidget* results_;
    QToolButton *refreshBtn_ = nullptr, *collapseBtn_ = nullptr;
    QPushButton *previous_, *next_;
    QWidget* pages_;
    QThread* worker_ = nullptr;
    QTimer debounce_;
    quint64 revision_ = 0;
    qint64 offset_ = 0;
    int pageSize_ = 100;
    bool queued_ = false;
    bool rebuild_ = false;
    QSet<QString> savedPaths_;
};
