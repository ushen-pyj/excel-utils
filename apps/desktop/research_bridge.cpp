#include "workbook_window.h"
#include <QFileDialog>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonObject>
#include <QThread>

void WorkbookWindow::researchCommand(const QString& command, const QJsonObject& params) {
    if (command == "research:cancel" && cancelFinanceSnapshot("research")) return;
    if (headerJob_) {
        if (headerJob_->property("tool").toString() != "research") {
            financeReply("research:result", {{"error",QStringLiteral("另一项财务任务正在运行，请稍后重试。")}});
        } else if (command == "research:cancel") {
            headerJob_->setProperty("cancelled", true);
            headerJob_->requestInterruption();
        }
        return;
    }
    if (command == "research:pick") {
        const bool single = params.value("single").toBool();
        const auto files = pickToolWorkbooks(single ? QStringLiteral("选择要拆分的台账") : QStringLiteral("选择财务台账"),
            params.value("directory").toString(), single);
        if (files.isEmpty()) { financeReply("research:result", {}); return; }
        prepareFinanceInputs(files, [this, files](const QJsonObject& readPaths, const QString& error) {
            if (!error.isEmpty()) { financeReply("research:result", {{"error",error}}); return; }
            registerFinanceReadPaths(files, readPaths, "research");
            for (const auto& file : files) headerPaths_.insert(file);
            startHeaderJob("research-catalog", {{"paths",QJsonArray::fromStringList(files)}});
        }, "research");
        return;
    }
    const auto sources = params.value("sources").toArray();
    if (sources.isEmpty()) { financeReply("research:result", {{"error",QStringLiteral("请先选择工作表。")}}); return; }
    for (const auto& item : sources) {
        if (!headerPaths_.contains(item.toObject().value("path").toString())) {
            financeReply("research:result", {{"error",QStringLiteral("请重新选择来源工作簿。")}});
            return;
        }
    }
    const auto mode = command.mid(QStringLiteral("research:").size());
    if (mode == "preview" || mode == "split-preview" || mode == "invoices-preview") {
        startHeaderJob("research-" + mode, {{"sources",sources}});
        return;
    }
    if (mode != "split" && mode != "invoices") return;
    const bool split = mode == "split";
    const QString suffix = split ? QStringLiteral("zip") : QStringLiteral("xlsx");
    QFileDialog dialog(home_->window(),QStringLiteral("保存处理结果"),
        split ? QStringLiteral("拆分工作簿.zip") : QStringLiteral("发票复核清单.xlsx"),
        split ? QStringLiteral("分组工作簿压缩包 (*.zip)") : QStringLiteral("Excel 工作簿 (*.xlsx)"));
    dialog.setAcceptMode(QFileDialog::AcceptSave);
    dialog.setDefaultSuffix(suffix);
    if (dialog.exec() != QDialog::Accepted) { financeReply("research:result", {}); return; }
    const QFileInfo target(dialog.selectedFiles().value(0));
    if (target.suffix().compare(suffix,Qt::CaseInsensitive) != 0) {
        financeReply("research:result", {{"error",QStringLiteral("请选择 .%1 文件。").arg(suffix)}}); return;
    }
    for (const auto& source : sources) if (target == QFileInfo(source.toObject().value("path").toString())) {
        financeReply("research:result", {{"error",QStringLiteral("目标是来源工作簿，请另选文件名。")}}); return;
    }
    if (bookId(target.absoluteFilePath()) >= 0) {
        financeReply("research:result", {{"error",QStringLiteral("目标正在编辑，请另选文件名。")}}); return;
    }
    startHeaderJob("research-" + mode, {{"sources",sources}},target.absoluteFilePath());
}
