#include "workbook_window.h"
#include <QApplication>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QIcon>
#include <QLockFile>
#include <QMessageBox>
#include <QStandardPaths>
#include <qascapplicationmanager.h>

void traceLifecycle(const char* message, int viewId) {
    static const QString path = [] {
        const auto profile = qEnvironmentVariable("EXCELUTILS_PROFILE");
        if (profile.isEmpty() || qEnvironmentVariable("EXCELUTILS_TRACE_CLOSE") != "1") return QString();
        return QDir(profile).filePath("close-trace.log");
    }();
    if (path.isEmpty()) return;
    QFile file(path);
    if (file.open(QIODevice::Append))
        file.write(QByteArray::number(QDateTime::currentMSecsSinceEpoch()) + " " + message + " " +
                   QByteArray::number(viewId) + "\n");
}

int main(int argc, char** argv) {
    QApplication::setAttribute(Qt::AA_DisableHighDpiScaling);
    QApplication::setAttribute(Qt::AA_Use96Dpi);
    QApplication app(argc, argv);
    app.setQuitOnLastWindowClosed(false);
    app.setApplicationName("ExcelUtils");
    app.setWindowIcon(QIcon(QStringLiteral(":/brand/excel-utils.ico")));
    app.setOrganizationName("ExcelUtils");
    app.setStyle("Fusion");
    const QString root = app.applicationDirPath();
    const QString profile = qEnvironmentVariable("EXCELUTILS_PROFILE",
        QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation));
    if (profile.isEmpty() || !QDir().mkpath(profile)) {
        QMessageBox::critical(nullptr, "Excel Utils", QStringLiteral("无法创建配置目录。\n") + profile);
        return 1;
    }
    QLockFile lock(profile + "/session.lock");
    if (!lock.tryLock()) {
        if (lock.error() == QLockFile::LockFailedError) {
            QMessageBox::information(nullptr, "Excel Utils", QStringLiteral("此配置目录已有一个客户端正在运行。"));
        } else {
            QMessageBox::critical(nullptr, "Excel Utils", QStringLiteral("无法写入配置目录。\n") + profile);
        }
        return 1;
    }
    CApplicationCEF::Prepare(argc, argv);
    CApplicationCEF cef;
    QAscApplicationManager manager;
    auto& settings = manager.m_oSettings;
    settings.SetUserDataPath(QDir(profile).absolutePath().toStdWString());
    QDir().mkpath(QString::fromStdWString(settings.fonts_cache_info_path));
    QDir().mkpath(profile + "/data");
    settings.file_converter_path = (root + "/converter").toStdWString();
    settings.local_editors_path = (root + "/editors/web-apps/apps/api/documents/index.html").toStdWString();
    settings.spell_dictionaries_path = (root + "/dictionaries").toStdWString();
    settings.additional_fonts_folder.push_back((root + "/fonts").toStdWString());
    settings.system_templates_path = (root + "/converter/templates").toStdWString();
    settings.connection_error_path = (root + "/editors/webext/noconnect.html").toStdWString();
    settings.country = "CN";
    cef.Init_CEF(&manager, argc, argv);
    WorkbookWindow window(manager);
    window.show();
    manager.CheckFonts();
    manager.StartKeyboardChecker();
    manager.StartSpellChecker();
    bool hasTarget = false;
    for (const auto& arg : app.arguments().mid(1)) {
        if (arg.startsWith('-')) continue;
        hasTarget = true;
        const QFileInfo target(arg);
        if (target.isDir()) window.showWorkspace(target.absoluteFilePath());
        else window.openWorkbook(arg);
        break;
    }
    if (!hasTarget) window.restoreWorkspaceOnStartup();
    bool ownLoop = false;
    traceLifecycle("enter CEF message loop");
    int result = cef.RunMessageLoop(ownLoop);
    traceLifecycle("returned from CEF message loop");
    if (!ownLoop) result = app.exec();
    traceLifecycle("begin SDK shutdown");
    manager.CloseApplication();
    manager.SetEventListener(nullptr);
    traceLifecycle("completed SDK shutdown");
    return result;
}
