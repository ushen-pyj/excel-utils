#include "workbook_window.h"
#include <QCoreApplication>
#include <QDateTime>
#include <QDir>
#include <QFileDialog>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <QTemporaryDir>
#include <QThread>
#include <memory>
#include <windows.h>

WorkbookWindow::~WorkbookWindow() {
    stopFinanceSnapshots();
    if (headerJob_) {
        headerJob_->requestInterruption();
        headerJob_->wait();
    }
}

void WorkbookWindow::headerMergeCommand(const QString& command, const QJsonObject& params) {
    if (command == "header:cancel" && cancelFinanceSnapshot("header")) return;
    if (headerJob_) {
        if (headerJob_->property("tool").toString() != "header") {
            financeReply("header:result", {{"error", QStringLiteral("另一项财务任务正在运行，请稍后重试。")}});
        } else if (command == "header:cancel") {
            headerJob_->setProperty("cancelled", true);
            headerJob_->requestInterruption();
        }
        return;
    }
    if (command == "header:pick") {
        const auto files = pickToolWorkbooks(QStringLiteral("选择合并工作簿"), params.value("directory").toString());
        if (files.isEmpty()) { financeReply("header:result", {}); return; }
        prepareFinanceInputs(files, [this, files](const QJsonObject& readPaths, const QString& error) {
            if (!error.isEmpty()) { financeReply("header:result", {{"error", error}}); return; }
            for (const auto& path : files) headerPaths_.insert(path);
            registerFinanceReadPaths(files, readPaths);
            startHeaderJob("catalog", {{"paths", QJsonArray::fromStringList(files)}});
        });
    } else if (command == "header:run" || command == "header:preview") {
        const auto sources = params.value("sources").toArray();
        if (sources.isEmpty()) { financeReply("header:result", {{"error", QStringLiteral("请勾选来源工作表。")}}); return; }
        for (const auto& item : sources) {
            if (!headerPaths_.contains(item.toObject().value("path").toString())) {
                financeReply("header:result", {{"error", QStringLiteral("请重新选择来源工作簿。")}}); return;
            }
        }
        if (command == "header:preview") {
            startHeaderJob("preview", {{"sources", sources}});
            return;
        }
        QFileDialog dialog(home_->window(), QStringLiteral("保存同表头合并结果"), QStringLiteral("同表头合并.xlsx"), QStringLiteral("Excel 工作簿 (*.xlsx)"));
        dialog.setAcceptMode(QFileDialog::AcceptSave);
        dialog.setDefaultSuffix("xlsx");
        if (dialog.exec() != QDialog::Accepted) { financeReply("header:result", {}); return; }
        const QFileInfo target(dialog.selectedFiles().value(0));
        if (target.suffix().compare("xlsx", Qt::CaseInsensitive) != 0) {
            financeReply("header:result", {{"error", QStringLiteral("请使用 .xlsx 扩展名。")}}); return;
        }
        for (const auto& item : sources) {
            if (target == QFileInfo(item.toObject().value("path").toString())) {
                financeReply("header:result", {{"error", QStringLiteral("目标是来源工作簿，请另选文件名。")}}); return;
            }
        }
        if (bookId(target.absoluteFilePath()) >= 0) {
            financeReply("header:result", {{"error", QStringLiteral("目标正在编辑，请另选文件名。")}}); return;
        }
        startHeaderJob("merge", {{"sources", sources}}, target.absoluteFilePath());
    }
}

void WorkbookWindow::startHeaderJob(const QString& mode, QJsonObject request, const QString& destination) {
    const bool research = mode.startsWith("research-");
    const QString resultEvent = research ? "research:result" : "header:result";
    const QString progressEvent = research ? "research:progress" : "header:progress";
    if (headerJob_) {
        financeReply(resultEvent, {{"error", QStringLiteral("另一项财务任务正在运行，请稍后重试。")}});
        return;
    }
    if (!destination.isEmpty()) exportingTool_ = research ? QStringLiteral("research") : QStringLiteral("header");
    if (snapshotNewlyOpenedSource(mode, request, destination)) return;
    request["readPaths"] = research ? researchReadPaths_ : headerReadPaths_;
    std::shared_ptr<QTemporaryDir> temp;
    const QFileInfo previous(destination);
    const bool replacing = !destination.isEmpty() && previous.exists();
    const auto modified = replacing ? previous.lastModified() : QDateTime();
    const auto size = replacing ? previous.size() : 0;
    if (!destination.isEmpty()) {
        temp = std::make_shared<QTemporaryDir>(previous.dir().filePath(".excel-utils-XXXXXX"));
        if (!temp->isValid()) { financeReply(resultEvent, {{"error", temp->errorString()}}); return; }
        request["output"] = temp->filePath("result.xlsx");
    }
    const auto terminal = std::make_shared<QJsonObject>();
    const auto program = QCoreApplication::applicationDirPath() + (research ? "/ResearchTools.exe" : "/HeaderMerge.exe");
    // CEF can own the GUI message loop. Drive the Windows process pipes on a
    // dedicated thread so writing stdin and collecting output work in either loop.
    auto* job = QThread::create([=] {
        QProcess process;
        process.start(program, {mode});
        if (!process.waitForStarted()) {
            *terminal = {{"error", QStringLiteral("无法启动工作簿处理程序。%1").arg(process.errorString())}}; return;
        }
        process.write(QJsonDocument(request).toJson(QJsonDocument::Compact));
        process.closeWriteChannel();
        while (process.state() != QProcess::NotRunning) {
            if (QThread::currentThread()->isInterruptionRequested()) {
                process.kill(); process.waitForFinished(); *terminal = {{"type","cancelled"}}; return;
            }
            process.waitForFinished(100);
            while (process.canReadLine()) {
                const auto msg = QJsonDocument::fromJson(process.readLine()).object();
                if (msg.value("type") == "progress") {
                    QMetaObject::invokeMethod(this, [this, msg, progressEvent] { if (!closing_) financeReply(progressEvent, msg); }, Qt::QueuedConnection);
                } else *terminal = msg;
            }
        }
        if (process.exitCode() != 0 || process.exitStatus() != QProcess::NormalExit ||
            (terminal->value("type") != "done" && terminal->value("type") != "books" && terminal->value("type") != "preview")) {
            if (!terminal->contains("error")) *terminal = {{"error",QStringLiteral("工作簿处理程序未正常完成。")}};
        }
    });
    job->setParent(this);
    job->setProperty("tool", research ? QStringLiteral("research") : QStringLiteral("header"));
    headerJob_ = job;
    connect(job, &QThread::finished, this, [=] {
        auto msg = *terminal;
        if (job->property("cancelled").toBool()) msg = {{"type","cancelled"}};
        if (temp && msg.value("type") == "done" && !closing_) {
            const QFileInfo target(destination);
            if ((bookId(target.absoluteFilePath()) >= 0) ||
                (replacing && (!target.exists() || target.size() != size || target.lastModified() != modified))) {
                msg = {{"error",QStringLiteral("目标在合并期间发生变化或已打开，请另选文件名。")}};
            } else if (MoveFileExW(reinterpret_cast<LPCWSTR>(temp->filePath("result.xlsx").utf16()),
                       reinterpret_cast<LPCWSTR>(destination.utf16()), MOVEFILE_WRITE_THROUGH | (replacing ? MOVEFILE_REPLACE_EXISTING : 0))) {
                msg["path"] = destination;
            } else msg = {{"error",QStringLiteral("无法保存结果，请检查目标文件是否被占用或另选文件名。")}};
        }
        headerJob_ = nullptr; job->deleteLater();
        if (!closing_) financeReply(resultEvent, msg);
    });
    if (temp) financeReply(progressEvent, {{"source",QStringLiteral("正在读取工作簿")},{"rows",0}});
    job->start();
}
