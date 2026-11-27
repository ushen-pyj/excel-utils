#include "app_update.h"

#include <QBuffer>
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDialog>
#include <QDialogButtonBox>
#include <QDir>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLabel>
#include <QMessageBox>
#include <QProgressBar>
#include <QPushButton>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QTemporaryFile>
#include <QThread>
#include <QVBoxLayout>
#include <QVersionNumber>
#include <functional>
#include <memory>
#include <windows.h>
#include <winhttp.h>

namespace {
const QString title = QStringLiteral("软件更新");
const QString releases = QStringLiteral("/" EXCELUTILS_RELEASE_REPOSITORY "/releases/");
constexpr qint64 maxInstallerBytes = 2LL * 1024 * 1024 * 1024;

using Progress = std::function<void(int)>;
using Transfer = std::function<QString(const Progress&)>;

class TransferDialog final : public QDialog {
public:
    using QDialog::QDialog;
    std::function<void()> cancel;
    void reject() override { cancel(); }
};

bool runTransfer(QWidget* parent, const QString& description, bool hasTotal, const Transfer& transfer) {
    TransferDialog dialog(parent);
    dialog.setWindowTitle(title);
    QVBoxLayout layout(&dialog);
    QLabel label(description, &dialog);
    layout.addWidget(&label);
    QProgressBar progress(&dialog);
    progress.setRange(0, hasTotal ? 100 : 0);
    progress.setValue(0);
    layout.addWidget(&progress);
    QDialogButtonBox buttons(QDialogButtonBox::Cancel, &dialog);
    auto* cancelButton = buttons.button(QDialogButtonBox::Cancel);
    cancelButton->setText(QStringLiteral("取消"));
    layout.addWidget(&buttons);
    dialog.setMinimumWidth(320);

    QString error;
    const std::unique_ptr<QThread> thread(QThread::create([&] {
        error = transfer([&](int percent) {
            QMetaObject::invokeMethod(&progress, [&progress, percent] { progress.setValue(percent); },
                                      Qt::QueuedConnection);
        });
    }));
    bool cancelled = false;
    dialog.cancel = [&] {
        cancelled = true;
        thread->requestInterruption();
        cancelButton->setEnabled(false);
        label.setText(QStringLiteral("正在取消…"));
    };
    QObject::connect(&buttons, &QDialogButtonBox::rejected, &dialog, &QDialog::reject);
    QObject::connect(thread.get(), &QThread::finished, &dialog, &QDialog::accept);
    thread->start();
    if (dialog.exec() != QDialog::Accepted) dialog.cancel();
    thread->wait();
    if (cancelled) return false;
    if (error.isEmpty()) return true;
    QMessageBox::warning(parent, title, error);
    return false;
}

QString fetch(const QString& path, QIODevice& output, qint64 limit,
              QCryptographicHash* hash = nullptr, const Progress& progress = {}) {
    using InternetHandle = std::unique_ptr<void, decltype(&WinHttpCloseHandle)>;
    const auto networkError = [] {
        return QStringLiteral("无法从 GitHub 获取更新，请检查网络后重试（Windows 错误 %1）。").arg(GetLastError());
    };
    InternetHandle session(WinHttpOpen(L"ExcelUtils", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
        WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0), WinHttpCloseHandle);
    DWORD tls = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;
    DWORD redirects = WINHTTP_OPTION_REDIRECT_POLICY_DISALLOW_HTTPS_TO_HTTP;
    if (!session || !WinHttpSetTimeouts(session.get(), 10000, 10000, 10000, 15000) ||
        !WinHttpSetOption(session.get(), WINHTTP_OPTION_SECURE_PROTOCOLS, &tls, sizeof(tls)) ||
        !WinHttpSetOption(session.get(), WINHTTP_OPTION_REDIRECT_POLICY, &redirects, sizeof(redirects))) return networkError();
    InternetHandle connection(WinHttpConnect(session.get(), L"github.com", INTERNET_DEFAULT_HTTPS_PORT, 0),
                              WinHttpCloseHandle);
    if (!connection) return networkError();
    const auto encodedPath = path.toStdWString();
    InternetHandle request(WinHttpOpenRequest(connection.get(), L"GET", encodedPath.c_str(), nullptr,
        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE), WinHttpCloseHandle);
    if (!request || !WinHttpSendRequest(request.get(), WINHTTP_NO_ADDITIONAL_HEADERS, 0,
        WINHTTP_NO_REQUEST_DATA, 0, 0, 0) || !WinHttpReceiveResponse(request.get(), nullptr)) return networkError();
    DWORD status = 0;
    DWORD statusSize = sizeof(status);
    if (!WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
        WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusSize, WINHTTP_NO_HEADER_INDEX)) return networkError();
    if (status == 404) return QStringLiteral("GitHub 上暂无可读取的更新。请确认已有公开发布的 Windows 版本。");
    if (status != 200) return QStringLiteral("GitHub 暂时无法提供更新（HTTP %1）。").arg(status);

    char buffer[64 * 1024];
    qint64 total = 0;
    int lastPercent = -1;
    while (!QThread::currentThread()->isInterruptionRequested()) {
        DWORD received = 0;
        if (!WinHttpReadData(request.get(), buffer, sizeof(buffer), &received)) return networkError();
        if (received == 0) return {};
        total += received;
        if (total > limit) return QStringLiteral("更新文件超出了预期大小。");
        if (output.write(buffer, received) != received) return QStringLiteral("无法写入更新文件。");
        if (hash) hash->addData(buffer, received);
        if (progress) {
            const int percent = static_cast<int>(total * 100 / limit);
            if (percent != lastPercent) progress(percent);
            lastPercent = percent;
        }
    }
    return {};
}
}

QString downloadAppUpdate(QWidget* parent) {
    QBuffer manifest;
    manifest.open(QIODevice::WriteOnly);
    if (!runTransfer(parent, QStringLiteral("正在检查更新…"), false, [&](const Progress&) {
        return fetch(releases + "latest/download/update.json", manifest, 16 * 1024);
    })) return {};

    const auto update = QJsonDocument::fromJson(manifest.data()).object();
    const auto version = update.value("version").toString();
    const auto hash = update.value("sha256").toString();
    const double bytes = update.value("size").toDouble();
    const QRegularExpression stableVersion("\\A(0|[1-9][0-9]{0,4})\\.(0|[1-9][0-9]{0,4})\\.(0|[1-9][0-9]{0,4})\\z");
    const QRegularExpression sha256("\\A[0-9a-f]{64}\\z");
    const auto target = QVersionNumber::fromString(version);
    if (!stableVersion.match(version).hasMatch() || target.majorVersion() > 65535 || target.minorVersion() > 65535 ||
        target.microVersion() > 65535 || !sha256.match(hash).hasMatch() ||
        bytes < 1 || bytes > maxInstallerBytes || bytes != static_cast<qint64>(bytes)) {
        QMessageBox::warning(parent, title, QStringLiteral("GitHub 上的更新信息格式不正确。"));
        return {};
    }
    const auto current = QCoreApplication::applicationVersion();
    if (target <= QVersionNumber::fromString(current)) {
        QMessageBox::information(parent, title, QStringLiteral("当前版本 %1 已是最新版本。").arg(current));
        return {};
    }
    const auto description = QStringLiteral("发现新版本 %1（%2 MiB），当前版本为 %3。\n是否下载安装包？")
        .arg(version).arg(bytes / (1024 * 1024), 0, 'f', 0).arg(current);
    if (QMessageBox::question(parent, title, description, QMessageBox::Yes | QMessageBox::No,
                              QMessageBox::No) != QMessageBox::Yes) return {};

    const auto downloads = QStandardPaths::writableLocation(QStandardPaths::DownloadLocation);
    if (downloads.isEmpty() || !QDir().mkpath(downloads)) {
        QMessageBox::warning(parent, title, QStringLiteral("无法打开下载目录。"));
        return {};
    }
    QTemporaryFile installer(QDir(downloads).filePath("ExcelUtils-Setup-x64-v" + version + "-XXXXXX.exe.part"));
    if (!runTransfer(parent, QStringLiteral("正在下载安装包…"), true, [&](const Progress& progress) {
        if (!installer.open()) return QStringLiteral("无法创建安装包文件。");
        QCryptographicHash checksum(QCryptographicHash::Sha256);
        const auto path = releases + "download/v" + version + "/ExcelUtils-Setup-x64.exe";
        const auto error = fetch(path, installer, static_cast<qint64>(bytes), &checksum, progress);
        if (!error.isEmpty()) return error;
        if (installer.size() != static_cast<qint64>(bytes) || checksum.result().toHex() != hash.toLatin1())
            return QStringLiteral("安装包未通过完整性校验，请重新下载。");
        if (!installer.flush()) return QStringLiteral("无法保存安装包文件。");
        return QString();
    })) return {};
    installer.close();
    const auto installerPath = installer.fileName().chopped(5);
    if (!installer.rename(installerPath)) {
        QMessageBox::warning(parent, title, QStringLiteral("无法保存安装包文件。"));
        return {};
    }
    installer.setAutoRemove(false);
    return installerPath;
}
