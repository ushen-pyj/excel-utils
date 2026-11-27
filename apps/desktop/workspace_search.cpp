#include "workspace_search.h"
#include "workspace_ui.h"
#include <QApplication>
#include <QClipboard>
#include <QDir>
#include <QFileInfo>
#include <QHBoxLayout>
#include <QHeaderView>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QKeyEvent>
#include <QLabel>
#include <QLineEdit>
#include <QPainter>
#include <QProcess>
#include <QPushButton>
#include <QShortcut>
#include <QStandardPaths>
#include <QStyledItemDelegate>
#include <QTextLayout>
#include <QToolButton>
#include <QTreeWidget>
#include <QVBoxLayout>
#include <memory>

namespace {
QString hitLocation(const QJsonObject& hit) {
    return hit["sheet"].toString() + "!" + hit["address"].toString();
}

QString hitCaption(const QJsonObject& hit) {
    return (hit["hidden"].toBool() ? QStringLiteral("隐藏工作表 · ") : QString()) + hitLocation(hit);
}

QString hitSnippet(const QJsonObject& hit) {
    auto snippet = hit["snippet"].toString();
    for (auto& character : snippet)
        if (character.isSpace()) character = QLatin1Char(' ');
    return snippet;
}

// Emerald Ledger search hit renderer: crisp count pills, warm amber match highlights, clean address badges.
class HitDelegate final : public QStyledItemDelegate {
public:
    using QStyledItemDelegate::QStyledItemDelegate;
    void paint(QPainter* painter, const QStyleOptionViewItem& option, const QModelIndex& index) const override {
        if (!index.parent().isValid()) {
            if (index.column() == 1) {
                QStyleOptionViewItem opt(option);
                initStyleOption(&opt, index);
                const QString countText = opt.text;
                opt.text.clear();
                opt.widget->style()->drawControl(QStyle::CE_ItemViewItem, &opt, painter, opt.widget);
                if (!countText.isEmpty()) {
                    painter->save();
                    painter->setRenderHint(QPainter::Antialiasing, true);
                    QFont badgeFont = opt.font;
                    badgeFont.setPointSizeF(qMax(8.5, badgeFont.pointSizeF() - 1.5));
                    badgeFont.setWeight(QFont::DemiBold);
                    painter->setFont(badgeFont);
                    const QFontMetrics fm(badgeFont);
                    const int w = qMax(22, fm.horizontalAdvance(countText) + 12);
                    const int h = qMin(opt.rect.height() - 6, fm.height() + 4);
                    const QRect pill(opt.rect.right() - w - 6, opt.rect.center().y() - h / 2, w, h);
                    const bool selected = opt.state & QStyle::State_Selected;
                    const auto& t = ExcelUi::currentTheme();
                    painter->setPen(Qt::NoPen);
                    painter->setBrush(selected ? t.accentSoftHover : t.bgHover);
                    painter->drawRoundedRect(pill, h / 2.0, h / 2.0);
                    painter->setPen(selected ? t.accentText : t.textSecondary);
                    painter->drawText(pill, Qt::AlignCenter, countText);
                    painter->restore();
                }
                return;
            }
            QStyledItemDelegate::paint(painter, option, index);
            return;
        }
        if (index.column() != 0) {
            QStyledItemDelegate::paint(painter, option, index);
            return;
        }
        QStyleOptionViewItem opt(option);
        initStyleOption(&opt, index);
        const auto hit = index.data(Qt::UserRole).toJsonObject();
        const bool selected = opt.state & QStyle::State_Selected;
        const bool hovered = opt.state & QStyle::State_MouseOver;
        const auto& t = ExcelUi::currentTheme();

        painter->save();
        painter->setRenderHint(QPainter::Antialiasing, true);
        const QRect bgRect = opt.rect.adjusted(4, 1, -4, -1);
        if (selected) {
            painter->setPen(Qt::NoPen);
            painter->setBrush(t.accentSoft);
            painter->drawRoundedRect(bgRect, 6, 6);
            painter->setBrush(t.accent);
            painter->drawRoundedRect(QRect(bgRect.left() + 1, bgRect.top() + 7, 3, bgRect.height() - 14), 1.5, 1.5);
        } else if (hovered) {
            painter->setPen(Qt::NoPen);
            painter->setBrush(t.bgHover);
            painter->drawRoundedRect(bgRect, 6, 6);
        }

        const QRect rect = bgRect.adjusted(10, 5, -8, -5);
        auto snippet = hitSnippet(hit);
        const auto matches = hit["matches"].toArray();
        int skipped = 0;
        if (!matches.isEmpty()) {
            const auto first = matches.first().toObject();
            const int start = first["start"].toInt();
            if (start > 0 && opt.fontMetrics.horizontalAdvance(snippet.left(start + first["length"].toInt())) > rect.width()) {
                snippet = QStringLiteral("…") + snippet.mid(start);
                skipped = start - 1;
            }
        }
        const auto preview = opt.fontMetrics.elidedText(snippet, Qt::ElideRight, rect.width());
        const int visibleEnd = preview == snippet ? preview.size() : preview.size() - 1;
        QTextLayout line(preview, opt.font);
        QVector<QTextLayout::FormatRange> highlights;
        QTextCharFormat mark;
        mark.setBackground(t.matchBg);
        mark.setForeground(t.matchFg);
        mark.setFontWeight(QFont::DemiBold);
        for (const auto& value : matches) {
            const auto match = value.toObject();
            const int start = match["start"].toInt() - skipped;
            const int length = qMin(match["length"].toInt(), visibleEnd - start);
            if (length > 0) highlights.append({start, length, mark});
        }
        line.setFormats(highlights);
        line.beginLayout();
        auto row = line.createLine();
        if (row.isValid()) row.setLineWidth(rect.width());
        line.endLayout();

        painter->setClipRect(rect);
        painter->setPen(selected ? t.accentText : t.textBody);
        line.draw(painter, rect.topLeft());

        QFont captionFont = opt.font;
        captionFont.setPointSizeF(qMax(8.5, captionFont.pointSizeF() - 1.0));
        painter->setFont(captionFont);
        const bool hidden = hit["hidden"].toBool();
        painter->setPen(hidden ? QColor(t.dark ? "#F59E0B" : "#B45309") : (selected ? t.accentMutedText : t.textMuted));
        const QString address = hitCaption(hit);
        const QFontMetrics cfm(captionFont);
        painter->drawText(rect, Qt::AlignLeft | Qt::AlignBottom, cfm.elidedText(address, Qt::ElideRight, rect.width()));
        painter->restore();
    }
    QSize sizeHint(const QStyleOptionViewItem& option, const QModelIndex& index) const override {
        auto size = QStyledItemDelegate::sizeHint(option, index);
        if (index.parent().isValid()) size.setHeight(2 * option.fontMetrics.height() + 14);
        else size.setHeight(30);
        return size;
    }
};
}

WorkspaceSearch::WorkspaceSearch(OpenCell open, std::function<void()> showFiles, QWidget* parent)
    : QWidget(parent), open_(std::move(open)), showFiles_(std::move(showFiles)) {
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(10, 8, 10, 8);
    layout->setSpacing(6);
    auto* bar = new QHBoxLayout;
    bar->setContentsMargins(2, 0, 0, 0);
    auto* title = new QLabel(QStringLiteral("工作区搜索"));
    title->setObjectName("workspaceRootName");
    bar->addWidget(title, 1);
    auto addAction = [&](const QString& icon, const QString& label) {
        auto* button = new QToolButton;
        const double s = ExcelUi::scaleFor(this);
        button->setIcon(ExcelUi::tintedIcon(":/window-chrome/" + icon + ".svg", ExcelUi::currentTheme().iconNormal, 18));
        button->setIconSize(QSize(qRound(15 * s), qRound(15 * s)));
        button->setCursor(Qt::PointingHandCursor);
        button->setAccessibleName(label);
        button->setToolTip(label);
        bar->addWidget(button);
        return button;
    };
    refreshBtn_ = addAction("refresh", QStringLiteral("刷新工作区索引"));
    collapseBtn_ = addAction("collapse", QStringLiteral("折叠所有搜索结果"));
    auto* refresh = refreshBtn_;
    auto* collapse = collapseBtn_;
    layout->addLayout(bar);

    input_ = new QLineEdit;
    input_->setPlaceholderText(QStringLiteral("搜索工作区中的单元格…"));
    input_->setAccessibleName(QStringLiteral("搜索工作区中的单元格"));
    input_->setClearButtonEnabled(true);
    input_->setToolTip(QStringLiteral("工作区搜索（Ctrl+Shift+F）"));
    input_->installEventFilter(this);
    regex_ = new QToolButton;
    regex_->setObjectName("workspaceRegexToggle");
    regex_->setText(QStringLiteral(".*"));
    regex_->setToolButtonStyle(Qt::ToolButtonTextOnly);
    regex_->setCheckable(true);
    regex_->setFocusPolicy(Qt::TabFocus);
    regex_->setAccessibleName(QStringLiteral("使用正则表达式"));
    regex_->setToolTip(QStringLiteral("使用正则表达式"));
    regex_->setCursor(Qt::PointingHandCursor);
    regex_->installEventFilter(this);
    auto* queryRow = new QHBoxLayout;
    queryRow->setSpacing(6);
    queryRow->addWidget(input_, 1);
    queryRow->addWidget(regex_);
    layout->addLayout(queryRow);

    scanBar_ = new ExcelUi::AnimatedScanBar(this);
    layout->addWidget(scanBar_);

    status_ = new QLabel;
    status_->setObjectName("searchStatus");
    status_->setTextFormat(Qt::PlainText);
    status_->setWordWrap(true);
    layout->addWidget(status_);

    results_ = new QTreeWidget;
    results_->setObjectName("searchResultsTree");
    results_->setColumnCount(2);
    results_->setHeaderHidden(true);
    results_->header()->setStretchLastSection(false);
    results_->header()->setSectionResizeMode(0, QHeaderView::Stretch);
    results_->header()->setSectionResizeMode(1, QHeaderView::ResizeToContents);
    results_->setIndentation(12);
    results_->setMouseTracking(true);
    results_->setVerticalScrollMode(QAbstractItemView::ScrollPerPixel);
    results_->setItemDelegate(new HitDelegate(results_));
    connect(collapse, &QToolButton::clicked, results_, &QTreeWidget::collapseAll);
    results_->setAccessibleName(QStringLiteral("工作区搜索结果"));
    results_->setTextElideMode(Qt::ElideRight);
    results_->installEventFilter(this);
    layout->addWidget(results_, 1);

    auto* copy = new QPushButton(QStringLiteral("复制位置"));
    copy->setToolTip(QStringLiteral("复制工作簿路径、工作表和单元格（Ctrl+C）"));
    copy->setCursor(Qt::PointingHandCursor);
    copy->setEnabled(false);
    layout->addWidget(copy);
    connect(results_, &QTreeWidget::currentItemChanged, this, [copy](QTreeWidgetItem* item) {
        copy->setEnabled(item && item->parent());
    });
    connect(copy, &QPushButton::clicked, this, [this] {
        auto* item = results_->currentItem();
        if (!item || !item->parent()) return;
        const auto hit = item->data(0, Qt::UserRole).toJsonObject();
        QApplication::clipboard()->setText(QDir::toNativeSeparators(hit["path"].toString()) + "\t" + hitLocation(hit));
        showMessage(QStringLiteral("已复制位置：%1").arg(hitLocation(hit)));
    });
    auto* copyShortcut = new QShortcut(QKeySequence::Copy, results_);
    copyShortcut->setContext(Qt::WidgetShortcut);
    connect(copyShortcut, &QShortcut::activated, copy, &QPushButton::click);

    pages_ = new QWidget;
    auto* buttons = new QHBoxLayout(pages_);
    buttons->setContentsMargins(0, 0, 0, 0);
    buttons->setSpacing(6);
    previous_ = new QPushButton(QStringLiteral("上一页"));
    next_ = new QPushButton(QStringLiteral("下一页"));
    previous_->setCursor(Qt::PointingHandCursor);
    next_->setCursor(Qt::PointingHandCursor);
    buttons->addWidget(previous_); buttons->addWidget(next_);
    pages_->hide();
    layout->addWidget(pages_);

    debounce_.setSingleShot(true);
    connect(&debounce_, &QTimer::timeout, this, &WorkspaceSearch::run);
    connect(input_, &QLineEdit::textChanged, this, [this] { offset_ = 0; schedule(); });
    connect(regex_, &QToolButton::toggled, this, [this](bool enabled) {
        input_->setPlaceholderText(enabled ? QStringLiteral("输入正则表达式…")
                                           : QStringLiteral("搜索工作区中的单元格…"));
        offset_ = 0;
        schedule();
    });
    connect(refresh, &QToolButton::clicked, this, [this] { rebuild_ = true; offset_ = 0; schedule(); });
    connect(previous_, &QPushButton::clicked, this, [this] { offset_ = qMax<qint64>(0, offset_ - pageSize_); schedule(); });
    connect(next_, &QPushButton::clicked, this, [this] { offset_ += pageSize_; schedule(); });
    connect(input_, &QLineEdit::returnPressed, this, &WorkspaceSearch::openSelectedResult);
    connect(results_, &QTreeWidget::itemClicked, this, &WorkspaceSearch::openSelectedResult);
}

void WorkspaceSearch::openSelectedResult() {
    auto* item = results_->currentItem();
    if (!item || !item->parent()) return;
    const auto hit = item->data(0, Qt::UserRole).toJsonObject();
    open_(hit["path"].toString(), hit["sheet"].toString(), hit["address"].toString(), hit["hidden"].toBool());
}

void WorkspaceSearch::focusSearch() {
    input_->setFocus(Qt::ShortcutFocusReason);
    input_->selectAll();
}

bool WorkspaceSearch::eventFilter(QObject* object, QEvent* event) {
    if (event->type() == QEvent::KeyPress) {
        const auto* key = static_cast<QKeyEvent*>(event);
        if (key->key() == Qt::Key_Escape) {
            showFiles_();
            return true;
        }
        if (object == results_ && (key->key() == Qt::Key_Return || key->key() == Qt::Key_Enter)) {
            if (auto* item = results_->currentItem()) {
                if (item->parent()) openSelectedResult();
                else item->setExpanded(!item->isExpanded());
            }
            return true;
        }
        if (object == input_ && key->key() == Qt::Key_Down && results_->topLevelItemCount()) {
            results_->setFocus(Qt::ShortcutFocusReason);
            return true;
        }
    }
    return QWidget::eventFilter(object, event);
}

WorkspaceSearch::~WorkspaceSearch() {
    if (worker_) {
        worker_->requestInterruption();
        worker_->wait();
    }
}

void WorkspaceSearch::setRoot(const QString& root) {
    if (root == root_ && revision_) return;
    root_ = root;
    savedPaths_.clear();
    rebuild_ = false;
    input_->clear();
    offset_ = 0;
    setEnabled(!root_.isEmpty());
    schedule();
    if (worker_) worker_->requestInterruption();
}

void WorkspaceSearch::fileSaved(const QString& path) {
    if (root_.isEmpty()) return;
    const auto relative = QDir(root_).relativeFilePath(path);
    if (!QDir::isAbsolutePath(relative) && !relative.startsWith("../")) {
        savedPaths_.insert(QDir::toNativeSeparators(path));
        schedule();
    }
}

void WorkspaceSearch::showMessage(const QString& message) {
    status_->setText(message);
    status_->setToolTip(message);
}

void WorkspaceSearch::applyTheme() {
    const auto& t = ExcelUi::currentTheme();
    if (refreshBtn_) refreshBtn_->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/refresh.svg"), t.iconNormal, 18));
    if (collapseBtn_) collapseBtn_->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/collapse.svg"), t.iconNormal, 18));
    const QIcon bookIcon = ExcelUi::themedXlsxIcon(t.accent, t.dark, 18);
    for (int i = 0; i < results_->topLevelItemCount(); ++i) {
        results_->topLevelItem(i)->setIcon(0, bookIcon);
    }
    if (scanBar_) scanBar_->update();
    results_->viewport()->update();
}

QString WorkspaceSearch::queryText() const {
    const auto text = input_->text();
    return regex_->isChecked() ? text : text.trimmed();
}

void WorkspaceSearch::schedule() {
    ++revision_;
    const bool search = !queryText().isEmpty();
    results_->clear();
    pages_->hide();
    queued_ = !root_.isEmpty();
    scanBar_->setRunning(queued_);
    showMessage(queued_ ? (search ? QStringLiteral("正在搜索…") : QStringLiteral("正在检查索引…")) : QString());
    if (queued_) debounce_.start(220);
    else debounce_.stop();
}

void WorkspaceSearch::run() {
    if (!queued_ || worker_) return;
    queued_ = false;
    scanBar_->setRunning(true);
    const auto generation = revision_;
    const auto profile = qEnvironmentVariable("EXCELUTILS_PROFILE",
        QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation));
    const QJsonObject request{{"root", root_}, {"cache", QDir(profile).filePath("search-index")},
        {"query", queryText()}, {"regex", regex_->isChecked()}, {"offset", double(offset_)}, {"rebuild", rebuild_},
        {"saved", QJsonArray::fromStringList(savedPaths_.values())}};
    rebuild_ = false;
    savedPaths_.clear();
    const auto program = QDir(QApplication::applicationDirPath()).filePath("WorkspaceIndex.exe");
    auto result = std::make_shared<QJsonObject>();
    // CEF owns the main message loop. Drive Windows process pipes on the worker thread.
    worker_ = QThread::create([=] {
        QProcess process;
        process.start(program, QStringList());
        if (!process.waitForStarted()) {
            *result = {{"type","error"}, {"message",QStringLiteral("无法启动索引程序：") + process.errorString()}};
            return;
        }
        process.write(QJsonDocument(request).toJson(QJsonDocument::Compact));
        process.closeWriteChannel();
        do {
            if (QThread::currentThread()->isInterruptionRequested()) {
                process.kill(); process.waitForFinished(); return;
            }
            process.waitForFinished(100);
            while (process.canReadLine()) {
                const auto reply = QJsonDocument::fromJson(process.readLine()).object();
                if (reply["type"] == "progress") {
                    QMetaObject::invokeMethod(this, [this, generation, reply] {
                        if (generation == revision_) applyReply(reply);
                    }, Qt::QueuedConnection);
                } else *result = reply;
            }
        } while (process.state() != QProcess::NotRunning);
    });
    worker_->setParent(this);
    connect(worker_, &QThread::finished, this, [this, result, generation] {
        worker_->deleteLater();
        worker_ = nullptr;
        if (generation == revision_) {
            scanBar_->setRunning(false);
            if (result->isEmpty()) showMessage(QStringLiteral("索引进程已退出，点击刷新重试。"));
            else applyReply(*result);
        }
        if (queued_ && !debounce_.isActive()) run();
    });
    worker_->start();
}

void WorkspaceSearch::applyReply(const QJsonObject& reply) {
    const auto type = reply["type"].toString();
    if (type == "progress") {
        showMessage(QStringLiteral("正在索引 %1 / %2 · %3").arg(reply["done"].toInt()+1)
            .arg(reply["total"].toInt()).arg(reply["name"].toString()));
        return;
    }
    if (type == "error") { showMessage(reply["message"].toString()); return; }
    const auto total = static_cast<qint64>(reply["total"].toDouble());
    pageSize_ = reply["pageSize"].toInt(100);
    if (offset_ > 0 && offset_ >= total) { offset_ = 0; schedule(); return; }
    QString summary;
    if (queryText().isEmpty()) summary = QStringLiteral("已索引 %1 个工作簿").arg(reply["files"].toInt());
    else {
        QTreeWidgetItem* group = nullptr;
        QString previousPath;
        const auto counts = reply["groupCounts"].toObject();
        for (const auto& value : reply["hits"].toArray()) {
            const auto hit = value.toObject();
            const auto path = hit["path"].toString();
            const auto relative = QDir(root_).relativeFilePath(path);
            if (!group || previousPath != path) {
                const QFileInfo info(relative);
                const auto label = info.path() == "." ? info.fileName() : info.fileName() + "  ·  " + info.path();
                group = new QTreeWidgetItem(results_, {label, QString::number(qint64(counts.value(path).toDouble()))});
                group->setIcon(0, ExcelUi::themedXlsxIcon(ExcelUi::currentTheme().accent, ExcelUi::currentTheme().dark, 18));
                group->setToolTip(0, relative);
                group->setTextAlignment(1, Qt::AlignRight | Qt::AlignVCenter);
                previousPath = path;
            }
            const auto location = hitCaption(hit);
            const auto snippet = hitSnippet(hit);
            auto* item = new QTreeWidgetItem(group, {snippet + "\n" + location});
            item->setFirstColumnSpanned(true);
            item->setToolTip(0, relative + "\n" + location + "\n" + snippet);
            item->setData(0, Qt::UserRole, hit);
        }
        results_->expandAll();
        if (results_->topLevelItemCount()) results_->setCurrentItem(results_->topLevelItem(0)->child(0));
        summary = total ? QStringLiteral("%1 处匹配，分布在 %2 个工作簿").arg(total).arg(reply["matchedFiles"].toInt())
                        : QStringLiteral("没有找到匹配的单元格");
        if (total > pageSize_) {
            summary += QStringLiteral(" · 第 %1–%2 条").arg(offset_ + 1).arg(qMin(total, offset_ + pageSize_));
            previous_->setEnabled(offset_ > 0);
            next_->setEnabled(offset_ + pageSize_ < total);
            pages_->show();
        }
    }
    if (reply["skipped"].toInt()) summary += QStringLiteral(" · %1 项未读取").arg(reply["skipped"].toInt());
    showMessage(summary);
    QStringList errors;
    for (const auto& e : reply["errors"].toArray()) errors << e.toString();
    if (!errors.isEmpty()) status_->setToolTip(errors.join("\n"));
}
