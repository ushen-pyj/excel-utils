#include "workbook_window.h"
#include "workspace_ui.h"
#include <QAbstractListModel>
#include <QApplication>
#include <QCollator>
#include <QDialog>
#include <QDirIterator>
#include <QEasingCurve>
#include <QFrame>
#include <QGraphicsDropShadowEffect>
#include <QHBoxLayout>
#include <QIcon>
#include <QLabel>
#include <QLineEdit>
#include <QListView>
#include <QPainter>
#include <QParallelAnimationGroup>
#include <QPropertyAnimation>
#include <QShortcut>
#include <QStyledItemDelegate>
#include <QTextLayout>
#include <QThread>
#include <QToolButton>
#include <QVBoxLayout>
#include <algorithm>

namespace {
class QuickOpenDialog final : public QDialog {
public:
    explicit QuickOpenDialog(QWidget* parent) : QDialog(parent, Qt::Tool | Qt::FramelessWindowHint) {
        setAttribute(Qt::WA_DeleteOnClose);
        setAttribute(Qt::WA_TranslucentBackground);
    }

    bool scanning = true;

protected:
    void changeEvent(QEvent* event) override {
        QDialog::changeEvent(event);
        if (event->type() == QEvent::ActivationChange && isVisible() && !isActiveWindow()) reject();
    }
};

struct FileEntry {
    QString relative;
    QString name;
    QString folder;
    bool opened;
};

constexpr int NameRole = Qt::UserRole + 1;
constexpr int FolderRole = Qt::UserRole + 2;
constexpr int OpenedRole = Qt::UserRole + 3;
constexpr int QueryRole = Qt::UserRole + 4;

class FileMatches final : public QAbstractListModel {
public:
    using QAbstractListModel::QAbstractListModel;
    int rowCount(const QModelIndex& parent = {}) const override {
        return parent.isValid() ? 0 : matches_.size();
    }
    QVariant data(const QModelIndex& index, int role) const override {
        if (!index.isValid() || index.row() >= matches_.size()) return {};
        const auto& file = files_[matches_[index.row()]];
        if (role == Qt::UserRole || role == Qt::ToolTipRole) return file.relative;
        if (role == Qt::DisplayRole) return file.name + "\n" + file.folder;
        if (role == NameRole) return file.name;
        if (role == FolderRole) return file.folder == "." ? QString() : file.folder;
        if (role == OpenedRole) return file.opened;
        if (role == QueryRole) return query_;
        return {};
    }

    void setFiles(QVector<FileEntry> entries) {
        beginResetModel();
        files_ = std::move(entries);
        updateMatches();
        endResetModel();
    }

    void filter(const QString& input) {
        beginResetModel();
        query_ = QDir::fromNativeSeparators(input).simplified();
        updateMatches();
        endResetModel();
    }
private:
    void updateMatches() {
        const auto words = query_.split(' ', Qt::SkipEmptyParts);
        QVector<int> groups[5];
        for (int i = 0; i < files_.size(); ++i) {
            const auto& file = files_[i];
            if (!std::all_of(words.begin(), words.end(), [&](const QString& word) {
                return file.relative.contains(word, Qt::CaseInsensitive);
            })) continue;
            int rank = 4;
            if (query_.isEmpty()) rank = file.opened ? 0 : 1;
            else if (file.name.compare(query_, Qt::CaseInsensitive) == 0 ||
                     file.name.chopped(5).compare(query_, Qt::CaseInsensitive) == 0) rank = 0;
            else if (file.name.startsWith(query_, Qt::CaseInsensitive)) rank = 1;
            else if (file.name.contains(query_, Qt::CaseInsensitive)) rank = 2;
            else if (file.opened) rank = 3;
            groups[rank].append(i);
        }
        matches_.clear();
        for (const auto& group : groups) matches_ += group;
    }
    QString query_;
    QVector<FileEntry> files_;
    QVector<int> matches_;
};

// Craft-grade Quick Open row renderer: crisp emerald accent bar, fuzzy match highlights, muted .xlsx, opened pill.
class QuickOpenDelegate final : public QStyledItemDelegate {
public:
    explicit QuickOpenDelegate(QObject* parent = nullptr)
        : QStyledItemDelegate(parent),
          icon_(ExcelUi::themedXlsxIcon(ExcelUi::currentTheme().accent, ExcelUi::currentTheme().dark, 20)) {}

    void paint(QPainter* painter, const QStyleOptionViewItem& option, const QModelIndex& index) const override {
        QStyleOptionViewItem opt(option);
        initStyleOption(&opt, index);
        const bool selected = opt.state & QStyle::State_Selected;
        const bool hovered = opt.state & QStyle::State_MouseOver;
        const auto& t = ExcelUi::currentTheme();

        painter->save();
        painter->setRenderHint(QPainter::Antialiasing, true);
        const QRect bgRect = opt.rect.adjusted(6, 2, -6, -2);
        if (selected) {
            painter->setPen(Qt::NoPen);
            painter->setBrush(t.accentSoft);
            painter->drawRoundedRect(bgRect, 7, 7);
            painter->setBrush(t.accent);
            painter->drawRoundedRect(QRect(bgRect.left() + 2, bgRect.top() + 7, 3, bgRect.height() - 14), 1.5, 1.5);
        } else if (hovered) {
            painter->setPen(Qt::NoPen);
            painter->setBrush(t.bgHover);
            painter->drawRoundedRect(bgRect, 7, 7);
        }

        const QRect content = bgRect.adjusted(12, 0, -10, 0);
        const int iconDim = 18;
        const QRect iconRect(content.left(), content.center().y() - iconDim / 2, iconDim, iconDim);
        icon_.paint(painter, iconRect);

        const bool opened = index.data(OpenedRole).toBool();
        int rightLimit = content.right();
        if (opened) {
            QFont badgeFont = opt.font;
            badgeFont.setPointSizeF(qMax(8.5, badgeFont.pointSizeF() - 1.5));
            badgeFont.setWeight(QFont::DemiBold);
            const QFontMetrics bfm(badgeFont);
            const QString tag = QStringLiteral("已打开");
            const int bw = bfm.horizontalAdvance(tag) + 14;
            const int bh = qMin(content.height() - 10, bfm.height() + 5);
            const QRect pill(rightLimit - bw, content.center().y() - bh / 2, bw, bh);
            painter->setPen(Qt::NoPen);
            painter->setBrush(selected ? t.accentSoftHover : t.accentSoft);
            painter->drawRoundedRect(pill, bh / 2.0, bh / 2.0);
            painter->setFont(badgeFont);
            painter->setPen(t.accentText);
            painter->drawText(pill, Qt::AlignCenter, tag);
            rightLimit = pill.left() - 10;
        }

        const QString name = index.data(NameRole).toString();
        const QString folder = index.data(FolderRole).toString();
        const QString query = index.data(QueryRole).toString();
        const auto terms = query.split(' ', Qt::SkipEmptyParts);

        QFont nameFont = opt.font;
        nameFont.setWeight(selected ? QFont::DemiBold : QFont::Medium);
        const QFontMetrics nfm(nameFont);
        const int textLeft = iconRect.right() + 10;
        const int avail = qMax(0, rightLimit - textLeft);
        const QString elidedName = nfm.elidedText(name, Qt::ElideRight, avail);

        QTextLayout nameLayout(elidedName, nameFont);
        QVector<QTextLayout::FormatRange> formats;
        if (elidedName.endsWith(".xlsx", Qt::CaseInsensitive) && elidedName.size() > 5) {
            QTextCharFormat extFmt;
            extFmt.setForeground(selected ? t.accentMutedText : t.textFaint);
            extFmt.setFontWeight(QFont::Normal);
            formats.append({elidedName.size() - 5, 5, extFmt});
        }
        for (const auto& term : terms) {
            int pos = 0;
            while ((pos = elidedName.indexOf(term, pos, Qt::CaseInsensitive)) >= 0) {
                QTextCharFormat fmt;
                fmt.setForeground(t.accentText);
                fmt.setBackground(t.accentSoftHover);
                fmt.setFontWeight(QFont::Bold);
                formats.append({pos, term.size(), fmt});
                pos += term.size();
            }
        }
        nameLayout.setFormats(formats);
        nameLayout.beginLayout();
        auto line = nameLayout.createLine();
        if (line.isValid()) line.setLineWidth(avail);
        nameLayout.endLayout();

        const int nameY = content.center().y() - nfm.height() / 2;
        painter->setPen(selected ? t.accentText : t.textBody);
        nameLayout.draw(painter, QPointF(textLeft, nameY));

        if (!folder.isEmpty()) {
            const int folderLeft = textLeft + nfm.horizontalAdvance(elidedName) + 10;
            const int folderAvail = rightLimit - folderLeft;
            if (folderAvail > 24) {
                QFont folderFont = opt.font;
                folderFont.setPointSizeF(qMax(8.5, folderFont.pointSizeF() - 1.0));
                const QFontMetrics ffm(folderFont);
                painter->setFont(folderFont);
                painter->setPen(selected ? t.accentMutedText : t.textFaint);
                const QString shownFolder = ffm.elidedText(QDir::toNativeSeparators(folder), Qt::ElideMiddle, folderAvail);
                painter->drawText(QRect(folderLeft, content.top(), folderAvail, content.height()),
                                  Qt::AlignLeft | Qt::AlignVCenter, shownFolder);
            }
        }
        painter->restore();
    }

    QSize sizeHint(const QStyleOptionViewItem& option, const QModelIndex&) const override {
        return QSize(option.rect.width(), qMax(38, option.fontMetrics.height() + 18));
    }

private:
    QIcon icon_;
};
}

void WorkbookWindow::quickOpenWorkbook() {
    if (!workspacePage_ || tabs_.currentWidget() != workspacePage_ || QApplication::activeModalWidget() ||
        workspaceRoot_.isEmpty() || !QFileInfo(workspaceRoot_).isDir()) return;

    const QDir root(workspaceRoot_);
    if (quickOpenDialog_) {
        quickOpenDialog_->raise();
        quickOpenDialog_->activateWindow();
        return;
    }
    auto* dialog = new QuickOpenDialog(this);
    quickOpenDialog_ = dialog;
    connect(dialog, &QDialog::finished, this, [this] { quickOpenDialog_ = nullptr; });
    dialog->setObjectName("quickOpenDialog");
    dialog->setWindowTitle(QStringLiteral("快速打开工作簿"));

    const double s = ExcelUi::scaleFor(this);
    const int shadowPad = qRound(20 * s);
    const int cardWidth = qBound(qRound(480 * s), width() - qRound(160 * s), qRound(640 * s));
    const int cardHeight = qRound(440 * s);
    dialog->resize(cardWidth + shadowPad * 2, cardHeight + shadowPad * 2);
    const QPoint targetPos = mapToGlobal(QPoint((width() - dialog->width()) / 2, qRound(42 * s) - shadowPad));
    dialog->move(targetPos);

    auto* outerLayout = new QVBoxLayout(dialog);
    outerLayout->setContentsMargins(shadowPad, shadowPad, shadowPad, shadowPad);
    outerLayout->setSpacing(0);

    auto* card = new QFrame(dialog);
    card->setObjectName("quickOpenCard");
    const auto& t = ExcelUi::currentTheme();
    auto* shadow = new QGraphicsDropShadowEffect(card);
    shadow->setBlurRadius(32);
    shadow->setOffset(0, 10);
    shadow->setColor(QColor(0, 0, 0, t.dark ? 120 : 48));
    card->setGraphicsEffect(shadow);
    outerLayout->addWidget(card);

    auto* layout = new QVBoxLayout(card);
    layout->setContentsMargins(12, 12, 12, 10);
    layout->setSpacing(8);

    auto* topRow = new QHBoxLayout;
    topRow->setContentsMargins(0, 0, 0, 0);
    topRow->setSpacing(8);

    auto* searchBadge = new QLabel(card);
    const int sbDim = qRound(18 * s);
    searchBadge->setPixmap(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/search.svg"), t.accent, 20).pixmap(sbDim, sbDim));
    searchBadge->setFixedSize(qRound(22 * s), qRound(22 * s));
    searchBadge->setAlignment(Qt::AlignCenter);
    topRow->addWidget(searchBadge);

    auto* input = new QLineEdit(card);
    input->setObjectName("quickOpenInput");
    input->setPlaceholderText(QStringLiteral("输入文件名或相对路径，空格可组合多个片段…"));
    input->setAccessibleName(QStringLiteral("输入文件名或相对路径"));
    input->setClearButtonEnabled(true);
    topRow->addWidget(input, 1);

    auto* closeBtn = new QToolButton(card);
    closeBtn->setObjectName("quickOpenClose");
    closeBtn->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/tab-close.svg"), t.textSecondary, 16));
    closeBtn->setAccessibleName(QStringLiteral("关闭快速打开"));
    closeBtn->setToolTip(QStringLiteral("关闭 (Esc)"));
    closeBtn->setCursor(Qt::PointingHandCursor);
    connect(closeBtn, &QToolButton::clicked, dialog, &QDialog::reject);
    topRow->addWidget(closeBtn);
    layout->addLayout(topRow);

    auto* scanBar = new ExcelUi::AnimatedScanBar(card);
    scanBar->setRunning(true);
    layout->addWidget(scanBar);

    auto* results = new QListView(card);
    results->setObjectName("quickOpenResults");
    results->setAccessibleName(QStringLiteral("匹配的工作簿"));
    results->setUniformItemSizes(true);
    results->setMouseTracking(true);
    results->setVerticalScrollMode(QAbstractItemView::ScrollPerPixel);
    results->setEditTriggers(QAbstractItemView::NoEditTriggers);
    results->setItemDelegate(new QuickOpenDelegate(results));
    layout->addWidget(results, 1);

    auto* sep = new QFrame(card);
    sep->setObjectName("quickOpenSep");
    sep->setFrameShape(QFrame::HLine);
    layout->addWidget(sep);

    auto* footer = new QHBoxLayout;
    footer->setContentsMargins(4, 2, 4, 0);
    auto* status = new QLabel(card);
    status->setObjectName("quickOpenStatus");
    footer->addWidget(status, 1);
    auto* hints = new QLabel(QStringLiteral("↑↓ 选择  ·  Enter 打开  ·  Esc 关闭"), card);
    hints->setObjectName("quickOpenHints");
    footer->addWidget(hints);
    layout->addLayout(footer);

    auto* model = new FileMatches(dialog);
    results->setModel(model);

    auto accept = [this, dialog, results, root] {
        const auto path = results->currentIndex().data(Qt::UserRole).toString();
        if (path.isEmpty() || !dialog->isVisible()) return;
        dialog->accept();
        if (root.absolutePath() != workspaceRoot_) return;
        const auto selected = root.filePath(path);
        openBook(selected, true);
        const int id = bookId(selected);
        if (id >= 0) books_[id].widget->setFocus(Qt::ShortcutFocusReason);
    };
    connect(input, &QLineEdit::returnPressed, dialog, accept);
    connect(results, &QListView::activated, dialog, accept);
    connect(results, &QListView::clicked, dialog, accept);
    for (const int key : {Qt::Key_Up, Qt::Key_Down}) {
        auto* shortcut = new QShortcut(QKeySequence(key), input);
        shortcut->setContext(Qt::WidgetShortcut);
        connect(shortcut, &QShortcut::activated, dialog, [model, results, key] {
            const int count = model->rowCount();
            if (!count) return;
            const int cur = results->currentIndex().row();
            const int next = key == Qt::Key_Down ? (cur + 1) % count : (cur - 1 + count) % count;
            results->setCurrentIndex(model->index(next));
        });
    }

    auto updateSelection = [dialog, model, results, status](const QString& keep = QString()) {
        auto index = model->index(0);
        if (!keep.isEmpty()) {
            const auto matches = model->match(index, Qt::UserRole, keep, 1, Qt::MatchExactly);
            if (!matches.isEmpty()) index = matches.first();
        }
        results->setCurrentIndex(index);
        status->setText(dialog->scanning ? QStringLiteral("正在扫描工作区文件…") :
            model->rowCount() ? QStringLiteral("%1 个工作簿").arg(model->rowCount()) : QStringLiteral("没有匹配的工作簿"));
    };
    connect(input, &QLineEdit::textChanged, dialog, [model, updateSelection](const QString& query) {
        model->filter(query);
        updateSelection();
    });
    QSet<QString> opened;
    QVector<FileEntry> initial;
    for (const auto& book : books_) {
        if (book.tabs != workspaceTabs_ || book.root != workspaceRoot_) continue;
        const auto relative = root.relativeFilePath(book.path);
        if (QDir::isAbsolutePath(relative) || relative.startsWith("../")) continue;
        opened.insert(relative.toCaseFolded());
        initial.append({relative, QFileInfo(relative).fileName(), QFileInfo(relative).path(), true});
    }
    model->setFiles(initial);
    updateSelection();

    // File discovery can finish after the user dismisses the dialog. The worker
    // owns its result and never touches a widget.
    const auto entries = std::make_shared<QVector<FileEntry>>();
    auto* scan = QThread::create([root, opened, entries] {
        QDirIterator it(root.absolutePath(), {"*.xlsx"}, QDir::Files | QDir::Hidden, QDirIterator::Subdirectories);
        while (!QThread::currentThread()->isInterruptionRequested() && it.hasNext()) {
            it.next();
            const auto name = it.fileName();
            if (name.startsWith("~$")) continue;
            const auto relative = root.relativeFilePath(it.filePath());
            entries->append({relative, name, QFileInfo(relative).path(), opened.contains(relative.toCaseFolded())});
        }
        QCollator natural;
        natural.setNumericMode(true);
        natural.setCaseSensitivity(Qt::CaseInsensitive);
        std::sort(entries->begin(), entries->end(), [&natural](const FileEntry& a, const FileEntry& b) {
            return natural.compare(a.relative, b.relative) < 0;
        });
    });
    connect(scan, &QThread::finished, dialog, [dialog, scanBar, results, model, entries, updateSelection] {
        const auto current = results->currentIndex().data(Qt::UserRole).toString();
        dialog->scanning = false;
        scanBar->setRunning(false);
        model->setFiles(std::move(*entries));
        updateSelection(current);
    });
    connect(dialog, &QDialog::finished, scan, &QThread::requestInterruption);
    connect(scan, &QThread::finished, scan, &QObject::deleteLater);
    scan->start();

    if (ExcelUi::motionEnabled()) {
        dialog->setWindowOpacity(0.0);
        dialog->move(targetPos.x(), targetPos.y() - 12);
        dialog->show();
        auto* group = new QParallelAnimationGroup(dialog);
        auto* fade = new QPropertyAnimation(dialog, "windowOpacity", group);
        fade->setDuration(155);
        fade->setStartValue(0.0);
        fade->setEndValue(1.0);
        fade->setEasingCurve(QEasingCurve::OutCubic);
        auto* slide = new QPropertyAnimation(dialog, "pos", group);
        slide->setDuration(165);
        slide->setStartValue(QPoint(targetPos.x(), targetPos.y() - 12));
        slide->setEndValue(targetPos);
        slide->setEasingCurve(QEasingCurve::OutCubic);
        group->start(QAbstractAnimation::DeleteWhenStopped);
    } else {
        dialog->show();
    }
    dialog->activateWindow();
    input->setFocus();
}
