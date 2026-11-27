#include "workbook_window.h"
#include "workspace_search.h"
#include "workspace_ui.h"
#include <QApplication>
#include <QClipboard>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFileSystemModel>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QMenu>
#include <QRegularExpression>
#include <QShortcut>
#include <QToolButton>
#include <QUrl>
#include <QVBoxLayout>

QWidget* WorkbookWindow::makeWorkspaceExplorer() {
    auto* explorer = new QWidget;
    auto* layout = new QVBoxLayout(explorer);
    layout->setContentsMargins(0, 8, 0, 6);
    layout->setSpacing(6);

    // Unified Explorer header: workspace folder title + crisp inline actions
    auto* heading = new QHBoxLayout;
    heading->setContentsMargins(12, 0, 8, 0);
    heading->setSpacing(4);
    workspaceRootLabel_ = new QLabel(QStringLiteral("工作区文件"));
    workspaceRootLabel_->setTextFormat(Qt::PlainText);
    workspaceRootLabel_->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
    workspaceRootLabel_->setObjectName("workspaceRootName");
    heading->addWidget(workspaceRootLabel_, 1);

    const double s = ExcelUi::scaleFor(this);
    const QColor icColor = ExcelUi::currentTheme().iconNormal;
    auto* create = new QToolButton;
    explorerCreateBtn_ = create;
    create->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/new-file.svg"), icColor, 18));
    create->setIconSize(QSize(qRound(16 * s), qRound(16 * s)));
    create->setCursor(Qt::PointingHandCursor);
    create->setAccessibleName(QStringLiteral("新建工作簿"));
    create->setToolTip(QStringLiteral("新建空白工作簿"));
    heading->addWidget(create);

    auto* collapseAll = new QToolButton;
    explorerCollapseBtn_ = collapseAll;
    collapseAll->setIcon(ExcelUi::tintedIcon(QStringLiteral(":/window-chrome/collapse.svg"), icColor, 18));
    collapseAll->setIconSize(QSize(qRound(15 * s), qRound(15 * s)));
    collapseAll->setCursor(Qt::PointingHandCursor);
    collapseAll->setAccessibleName(QStringLiteral("折叠所有文件夹"));
    collapseAll->setToolTip(QStringLiteral("折叠所有文件夹"));
    heading->addWidget(collapseAll);
    layout->addLayout(heading);

    // Inline quick filename filter bar
    auto* filterWrap = new QHBoxLayout;
    filterWrap->setContentsMargins(10, 0, 10, 2);
    workspaceFilterInput_ = new QLineEdit;
    workspaceFilterInput_->setObjectName("explorerFilterInput");
    workspaceFilterInput_->setPlaceholderText(QStringLiteral("筛选当前目录工作簿…"));
    workspaceFilterInput_->setAccessibleName(QStringLiteral("筛选当前目录工作簿"));
    workspaceFilterInput_->setClearButtonEnabled(true);
    filterWrap->addWidget(workspaceFilterInput_);
    layout->addLayout(filterWrap);

    // Animated collapsible inline new-workbook form
    auto* formOuter = new QWidget;
    auto* formOuterLay = new QVBoxLayout(formOuter);
    formOuterLay->setContentsMargins(10, 2, 10, 4);
    formOuterLay->setSpacing(0);

    newWorkbookForm_ = new QWidget(formOuter);
    newWorkbookForm_->setObjectName("newWorkbookForm");
    auto* form = new QVBoxLayout(newWorkbookForm_);
    form->setContentsMargins(10, 8, 10, 8);
    form->setSpacing(5);
    auto* destination = new QLabel;
    destination->setObjectName("newFileDest");
    destination->setTextFormat(Qt::PlainText);
    destination->setWordWrap(true);
    form->addWidget(destination);
    auto* name = new QLineEdit;
    name->setAccessibleName(QStringLiteral("新工作簿名称"));
    form->addWidget(name);
    auto* error = new QLabel;
    error->setObjectName("newFileError");
    error->setWordWrap(true);
    error->hide();
    form->addWidget(error);
    formOuterLay->addWidget(newWorkbookForm_);

    newWorkbookPanel_ = new ExcelUi::CollapsiblePanel(formOuter, explorer);
    layout->addWidget(newWorkbookPanel_);

    // Model + Proxy + Custom-painted WorkspaceTreeView
    workspaceModel_ = new QFileSystemModel(this);
    workspaceModel_->setFilter(QDir::AllDirs | QDir::Files | QDir::NoDotAndDotDot);
    workspaceModel_->setNameFilters({"*.xlsx"});
    workspaceModel_->setNameFilterDisables(false);

    workspaceProxy_ = new ExcelUi::WorkspaceFilterProxy(this);
    workspaceProxy_->setSourceModel(workspaceModel_);
    workspaceProxy_->sort(0, Qt::AscendingOrder);

    workspaceTree_ = new ExcelUi::WorkspaceTreeView;
    workspaceTree_->setAccessibleName(QStringLiteral("工作区目录"));
    workspaceTree_->setModel(workspaceProxy_);
    workspaceTree_->setContextMenuPolicy(Qt::CustomContextMenu);
    for (int i = 1; i < workspaceModel_->columnCount(); ++i) workspaceTree_->hideColumn(i);
    layout->addWidget(workspaceTree_, 1);

    connect(collapseAll, &QToolButton::clicked, workspaceTree_, &QTreeView::collapseAll);
    connect(workspaceFilterInput_, &QLineEdit::textChanged, this, [this](const QString& text) {
        if (!workspaceProxy_) return;
        workspaceProxy_->setFilterQuery(text);
        if (!workspaceRoot_.isEmpty()) {
            const QModelIndex srcRoot = workspaceModel_->index(workspaceRoot_);
            if (srcRoot.isValid()) {
                workspaceTree_->setRootIndex(workspaceProxy_->mapFromSource(srcRoot));
                if (!text.trimmed().isEmpty()) workspaceTree_->expandAll();
            }
        }
    });

    connect(workspaceTree_, &QTreeView::activated, this, [this](const QModelIndex& index) {
        if (!index.isValid()) return;
        const QModelIndex src = workspaceProxy_->mapToSource(index);
        const auto info = workspaceModel_->fileInfo(src);
        if (info.isFile()) {
            openBook(info.absoluteFilePath(), true);
        }
    });
    connect(workspaceTree_, &QTreeView::customContextMenuRequested, this, &WorkbookWindow::showExplorerContextMenu);

    openNewWorkbookForm_ = [=](const QString& explicitFolder) {
        auto folder = explicitFolder.isEmpty() ? workspaceRoot_ : explicitFolder;
        if (explicitFolder.isEmpty()) {
            const auto index = workspaceTree_->currentIndex();
            if (index.isValid()) {
                const auto selected = workspaceModel_->fileInfo(workspaceProxy_->mapToSource(index));
                folder = selected.isDir() ? selected.absoluteFilePath() : selected.absolutePath();
            }
        }
        if (folder.isEmpty() || !QFileInfo(folder).isDir()) return;
        newWorkbookDirectory_ = folder;
        const auto relative = QDir(workspaceRoot_).relativeFilePath(folder);
        destination->setText(QStringLiteral("新建于 %1").arg(relative == "." ? workspaceRootLabel_->text() : relative));
        error->hide();
        name->setText(QStringLiteral("新工作簿.xlsx"));
        newWorkbookPanel_->setExpanded(true, true);
        name->setFocus();
        name->setSelection(0, name->text().size() - 5);
    };

    connect(create, &QToolButton::clicked, this, [this] {
        if (openNewWorkbookForm_) openNewWorkbookForm_(QString());
    });

    auto* cancel = new QShortcut(QKeySequence(Qt::Key_Escape), name);
    cancel->setContext(Qt::WidgetShortcut);
    connect(cancel, &QShortcut::activated, this, [this] {
        newWorkbookPanel_->setExpanded(false, true);
        workspaceTree_->setFocus();
    });

    connect(name, &QLineEdit::returnPressed, this, [=] {
        auto fail = [this, error](const QString& message) {
            error->setText(message);
            error->show();
            newWorkbookPanel_->setExpanded(true, false);
        };
        auto filename = name->text().trimmed();
        static const QRegularExpression invalid(QStringLiteral(R"rx([<>:"/\\|?*\x00-\x1f])rx"));
        static const QRegularExpression reserved(QStringLiteral(R"(^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$))"),
                                                QRegularExpression::CaseInsensitiveOption);
        if (filename.isEmpty() || filename.endsWith('.') || filename.contains(invalid) ||
            filename.compare(".xlsx", Qt::CaseInsensitive) == 0 || filename.contains(reserved) || filename.startsWith("~$")) {
            fail(QStringLiteral("请输入有效的工作簿文件名。"));
            return;
        }
        if (!filename.endsWith(".xlsx", Qt::CaseInsensitive)) filename += ".xlsx";
        const QString folder = QFileInfo(newWorkbookDirectory_).canonicalFilePath();
        const auto relative = QDir(workspaceRoot_).relativeFilePath(folder);
        if (folder.isEmpty() || !QFileInfo(folder).isDir() || QDir::isAbsolutePath(relative) ||
            relative == ".." || relative.startsWith("../")) {
            fail(QStringLiteral("请选择工作区中的有效文件夹。"));
            return;
        }
        const auto path = QDir(folder).filePath(filename);
        QFile blank(QApplication::applicationDirPath() + "/converter/empty/zh-CN/new.xlsx");
        if (!blank.copy(path)) {
            fail(QFileInfo::exists(path) ? QStringLiteral("同名文件已存在，请换一个名称。")
                                         : QStringLiteral("创建失败：%1").arg(blank.errorString()));
            return;
        }
        newWorkbookPanel_->setExpanded(false, true);
        workspaceSearch_->fileSaved(path);
        openBook(path, true);
    });
    return explorer;
}

void WorkbookWindow::showExplorerContextMenu(const QPoint& position) {
    if (!workspaceTree_ || !workspaceProxy_ || workspaceRoot_.isEmpty()) return;
    const QModelIndex index = workspaceTree_->indexAt(position);
    QFileInfo info;
    if (index.isValid()) {
        info = workspaceModel_->fileInfo(workspaceProxy_->mapToSource(index));
    }

    QMenu menu(workspaceTree_);
    menu.setObjectName("workspacePopupMenu");
    QAction* openAct = nullptr;
    if (info.isFile()) {
        openAct = menu.addAction(QStringLiteral("打开工作簿"));
    }
    auto* newAct = menu.addAction(QStringLiteral("在此新建工作簿"));
    menu.addSeparator();
    auto* revealAct = menu.addAction(QStringLiteral("在文件资源管理器中显示"));
    QAction* copyRelAct = nullptr;
    if (info.exists()) {
        copyRelAct = menu.addAction(QStringLiteral("复制相对路径"));
    }

    const QAction* chosen = menu.exec(workspaceTree_->viewport()->mapToGlobal(position));
    if (!chosen) return;
    if (chosen == openAct && info.isFile()) {
        openBook(info.absoluteFilePath(), true);
    } else if (chosen == newAct && openNewWorkbookForm_) {
        const QString folder = info.exists() ? (info.isDir() ? info.absoluteFilePath() : info.absolutePath()) : workspaceRoot_;
        openNewWorkbookForm_(folder);
    } else if (chosen == revealAct) {
        const QString dir = info.exists() ? (info.isDir() ? info.absoluteFilePath() : info.absolutePath()) : workspaceRoot_;
        QDesktopServices::openUrl(QUrl::fromLocalFile(dir));
    } else if (chosen == copyRelAct && info.exists()) {
        const auto rel = QDir::toNativeSeparators(QDir(workspaceRoot_).relativeFilePath(info.absoluteFilePath()));
        QApplication::clipboard()->setText(rel);
    }
}
