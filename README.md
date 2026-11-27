# Excel Utils

Excel Utils 是一款离线使用的 Windows x64 表格工具，内置 ONLYOFFICE 编辑器，可直接打开和编辑本地 `.xlsx` 文件。

## 功能

- 在标签页中编辑多个工作簿，快速打开最近使用的文件。
- 打开文件夹作为工作区，按文件名快速定位工作簿，跨工作簿搜索单元格内容。
- 批量处理财务表格，包括合并、拆分、分类汇总、对账、发票查重、宽表转明细、往来账龄和预算差异分析。

## 安装

运行 `ExcelUtils-Setup-x64.exe` 安装。也可以直接运行完整发布目录中的 `ExcelUtils.exe`。发布包已包含运行所需的组件。[最新 Windows 安装包](https://github.com/ushen-pyj/excel-utils/releases/latest/download/ExcelUtils-Setup-x64.exe)

在 **设置 → 检查更新** 可以获取新版。客户端在下载完成后校验安装包的大小和 SHA-256。确认安装后，客户端先按正常退出流程处理未保存的工作簿，再打开安装器。也可以从下载目录手动运行已下载的安装包。

## 从源码构建

在 Windows x64 上准备 PowerShell 7、Visual Studio 2022 C++ 构建工具（含 Windows SDK）、CMake、Ninja、Qt 5.15.2（`msvc2019_64`）、Node.js 22 和 ONLYOFFICE DesktopEditors Windows x64 运行时（`10.0.0.169`）。

```powershell
git submodule update --init --depth 1
./scripts/build.ps1 -QtDir 'C:/Qt/5.15.2/msvc2019_64' -Runtime 'C:/Program Files/ONLYOFFICE/DesktopEditors'
```

构建产物位于 `dist/ExcelUtils/`。安装 Inno Setup 6.7 后，可用以下命令生成 `dist/ExcelUtils-Setup-x64.exe`。

```powershell
./scripts/package-release.ps1
```

第三方组件及许可说明见 [NOTICE](packaging/windows/NOTICE.txt)。

## GitHub Releases

在 GitHub 的 **Actions → Windows Release** 手动运行可下载测试安装包。正式发布时，先提交 `VERSION` 中的新版本号及本次改动，再创建并推送同名标签。例如 `VERSION` 为 `0.1.4` 时运行以下命令。

```powershell
git tag v0.1.4
git push origin v0.1.4
```

工作流在 Windows 编译并测试应用，将 `ExcelUtils-Setup-x64.exe` 和 `update.json` 一起上传到 GitHub Release。`VERSION` 同时用于客户端和安装器，每次发布请递增。更新入口读取公开 Release 资产，无需 GitHub 令牌。更新会下载完整的 x64 安装包。[GitHub Release 下载链接说明](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)
