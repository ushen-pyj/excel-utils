param(
    [string]$Runtime = "$PSScriptRoot/../dist/ExcelUtils",
    [switch]$SaveOnClose,
    [switch]$UiPreview
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$Runtime = (Resolve-Path $Runtime).Path
$exe = Join-Path $Runtime 'ExcelUtils.exe'
$run = New-Item -ItemType Directory -Path "$root/build/验证-$([Guid]::NewGuid().ToString('N'))"
$book = Join-Path $run '往返 样表.xlsx'
if ($UiPreview) {
    $previews = New-Item -Force -ItemType Directory "$root/build/ui-preview"
    $samples = New-Item -ItemType Directory (Join-Path $previews ('示例-' + [Guid]::NewGuid().ToString('N').Substring(0,6)))
    $sales = New-Item -ItemType Directory (Join-Path $samples '运营报表')
    $book = Join-Path $sales '月度销售汇总.xlsx'
    Add-Type -AssemblyName System.Drawing.Common
    Add-Type -AssemblyName UIAutomationClient
}
$marker = '本地保存-' + [Guid]::NewGuid().ToString('N')
$oldProfile = $env:EXCELUTILS_PROFILE
$env:EXCELUTILS_PROFILE = "$run/profile"
Copy-Item "$Runtime/converter/empty/zh-CN/new.xlsx" $book
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Hidden QA windows do not always appear as Process.MainWindowHandle. Close
# only the Qt main window of the exact child PID, using normal WM_CLOSE.
if (-not ('ExcelUtilsTestWindow' -as [type])) {
    Add-Type @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Text;
using System.Runtime.InteropServices;
public static class ExcelUtilsTestWindow {
    delegate bool Callback(IntPtr hwnd, IntPtr parameter);
    [DllImport("user32")] static extern bool EnumWindows(Callback callback, IntPtr parameter);
    [DllImport("user32")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder title, int max);
    [DllImport("user32", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
    [DllImport("user32")] static extern bool EnumChildWindows(IntPtr parent, Callback callback, IntPtr parameter);
    [DllImport("user32")] static extern int GetDlgCtrlID(IntPtr hwnd);
    [DllImport("user32")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32")] static extern bool IsWindowEnabled(IntPtr hwnd);
    [DllImport("user32")] static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
    [DllImport("user32", CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr w, string text);
    [DllImport("user32", SetLastError=true)] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
    static IntPtr FindChild(IntPtr parent, int id, string className) {
        IntPtr result = IntPtr.Zero;
        EnumChildWindows(parent, (child, _) => {
            if (GetDlgCtrlID(child) != id) return true;
            var cls = new StringBuilder(64);
            GetClassName(child, cls, cls.Capacity);
            if (cls.ToString() != className) return true;
            result = child;
            return false;
        }, IntPtr.Zero);
        return result;
    }
    public static bool FilePicker(int processId, string path, string dialogTitle = "打开工作簿") {
        bool sent = false;
        EnumWindows((hwnd, _) => {
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            if (pid != processId) return true;
            var cls = new StringBuilder(64);
            GetClassName(hwnd, cls, cls.Capacity);
            var title = new StringBuilder(256);
            GetWindowText(hwnd, title, title.Capacity);
            if (cls.ToString() != "#32770" || title.ToString() != dialogTitle || !IsWindowVisible(hwnd)) return true;
            // Explorer nests the file-name Edit inside ComboBoxEx32 / ComboBox.
            var edit = FindChild(hwnd, 1148, "Edit");
            var button = FindChild(hwnd, String.IsNullOrEmpty(path) ? 2 : 1, "Button");
            if (edit == IntPtr.Zero || button == IntPtr.Zero || !IsWindowEnabled(edit)) return true;
            if (!String.IsNullOrEmpty(path) && SendMessage(edit, 0x000C, IntPtr.Zero, path) == IntPtr.Zero) return true;
            if (!IsWindowEnabled(button)) return true;
            sent = PostMessage(button, 0x00F5, IntPtr.Zero, IntPtr.Zero);
            return false;
        }, IntPtr.Zero);
        return sent;
    }
    static List<IntPtr> TopLevelWindows(int processId) {
        var result = new List<IntPtr>();
        EnumWindows((hwnd, _) => {
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            if (pid == processId) result.Add(hwnd);
            return true;
        }, IntPtr.Zero);
        return result;
    }
    static string Title(IntPtr hwnd) {
        var value = new StringBuilder(256);
        GetWindowText(hwnd, value, value.Capacity);
        return value.ToString();
    }
    static string ClassName(IntPtr hwnd) {
        var value = new StringBuilder(128);
        GetClassName(hwnd, value, value.Capacity);
        return value.ToString();
    }
    public static string DescribeWindows(int processId) {
        var rows = new List<string>();
        foreach (var hwnd in TopLevelWindows(processId)) {
            rows.Add(String.Format("  hwnd=0x{0:X} class={1} title='{2}' owner=0x{3:X} visible={4} enabled={5}",
                hwnd.ToInt64(), ClassName(hwnd), Title(hwnd), GetWindow(hwnd, 4).ToInt64(),
                IsWindowVisible(hwnd), IsWindowEnabled(hwnd)));
        }
        return rows.Count == 0 ? "  (none)" : String.Join(Environment.NewLine, rows);
    }
    public static IntPtr MainWindow(int processId) {
        var candidates = TopLevelWindows(processId).FindAll(hwnd =>
            Title(hwnd) == "Excel Utils" && ClassName(hwnd).StartsWith("Qt") &&
            ClassName(hwnd).Contains("QWindow") && GetWindow(hwnd, 4) == IntPtr.Zero);
        if (candidates.Count != 1)
            throw new InvalidOperationException("Expected one ownerless Qt main window, found " + candidates.Count);
        return candidates[0];
    }
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int x, y; public Point(int x, int y){ this.x=x; this.y=y; } }
    [DllImport("user32")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32")] static extern bool SetWindowPos(IntPtr w, IntPtr position, int x, int y, int width, int height, uint flags);
    [DllImport("dwmapi")] static extern int DwmGetWindowAttribute(IntPtr window, uint attr, out int value, int bytes);
    [DllImport("dwmapi")] static extern int DwmFlush();
    [DllImport("user32")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32")] public static extern bool IsZoomed(IntPtr window);
    [DllImport("user32")] public static extern bool IsIconic(IntPtr window);
    [DllImport("user32")] public static extern bool ShowWindowAsync(IntPtr window, int command);
    public static void SetPreviewTopmost(IntPtr window, bool on) {
        if (!SetWindowPos(window, (IntPtr)(on ? -1 : -2), 0, 0, 0, 0, 0x53))
            throw new InvalidOperationException("Cannot position the preview window");
        DwmFlush();
    }
    public static void PlacePreviewWindow(IntPtr window) {
        if (!SetWindowPos(window,(IntPtr)(-1),64,64,1440,900,0x50))
            throw new InvalidOperationException("Cannot size the preview window");
        DwmFlush();
    }
    public static Rect PreviewBounds(IntPtr window, int processId) {
        Rect rect;
        if (!GetWindowRect(window, out rect)) throw new InvalidOperationException("Cannot measure the preview window");
        // Exclude invisible resize margins and rounded corners. Check the
        // visible stacking order so the capture cannot include other windows.
        for (int inset=0; inset<32; inset++) {
            bool allInside = true;
            foreach (var x in new[]{rect.Left, rect.Right-1})
                foreach (var y in new[]{rect.Top, rect.Bottom-1}) {
                    var hit = WindowFromPoint(new Point(x,y));
                    if (hit != window && GetAncestor(hit,2) != window) allInside = false;
                }
            if (allInside) {
                for (var above=GetWindow(window,3); above!=IntPtr.Zero; above=GetWindow(above,3)) {
                    Rect other;
                    int cloaked;
                    if (IsWindowVisible(above) && GetWindowRect(above,out other)
                        && (DwmGetWindowAttribute(above,14,out cloaked,4)!=0 || cloaked==0)
                        && other.Left<rect.Right && other.Right>rect.Left && other.Top<rect.Bottom && other.Bottom>rect.Top)
                        throw new InvalidOperationException("The preview window is covered");
                }
                return rect;
            }
            rect.Left++; rect.Top++; rect.Right--; rect.Bottom--;
        }
        var hitCorner = WindowFromPoint(new Point(rect.Left,rect.Top));
        throw new InvalidOperationException(String.Format("Preview window 0x{0:X} is not fully on screen, corner ({1},{2}) hits {3}, root=0x{4:X}",
            window.ToInt64(),rect.Left,rect.Top,ClassName(hitCorner),GetAncestor(hitCorner,2).ToInt64()));
    }
    public static long Close(int processId) {
        var window = MainWindow(processId);
        if (!PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "PostMessage(WM_CLOSE) failed");
        return window.ToInt64();
    }
    public static bool ConfirmSave(int processId) {
        var dialog = TopLevelWindows(processId).Find(hwnd => Title(hwnd) == "未保存的修改" && IsWindowVisible(hwnd));
        if (dialog == IntPtr.Zero) return false;
        // Save is explicitly the default button in the application's close prompt.
        return PostMessage(dialog, 0x0100, (IntPtr)13, (IntPtr)0x001C0001)
            && PostMessage(dialog, 0x0101, (IntPtr)13, (IntPtr)unchecked((int)0xC01C0001));
    }
}
'@
}

function Read-CellA1 {
    $archive = [IO.Compression.ZipFile]::OpenRead($book)
    try {
        function Read-Part($name) {
            $reader = [IO.StreamReader]::new($archive.GetEntry($name).Open())
            try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
        }
        $sheet = Read-Part 'xl/worksheets/sheet1.xml'
        $cell = $sheet.SelectSingleNode("//*[local-name()='c' and @r='A1']")
        if (!$cell) { return '' }
        if ($cell.GetAttribute('t') -eq 's') {
            $index = [int]$cell.SelectSingleNode("*[local-name()='v']").InnerText
            $strings = Read-Part 'xl/sharedStrings.xml'
            return $strings.DocumentElement.SelectNodes("*[local-name()='si']").Item($index).InnerText
        }
        return $cell.InnerText
    } finally { $archive.Dispose() }
}

function Save-WindowPreview([int]$processId, [string]$path) {
    $window = [ExcelUtilsTestWindow]::MainWindow($processId)
    $oldDpi = [ExcelUtilsTestWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
    try {
        [ExcelUtilsTestWindow]::SetPreviewTopmost($window, $true)
        $rect = [ExcelUtilsTestWindow]::PreviewBounds($window, $processId)
        $image = [Drawing.Bitmap]::new($rect.Right - $rect.Left, $rect.Bottom - $rect.Top,
            [Drawing.Imaging.PixelFormat]::Format24bppRgb)
        try {
            $graphics = [Drawing.Graphics]::FromImage($image)
            try {
                $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $image.Size)
                [void][ExcelUtilsTestWindow]::PreviewBounds($window, $processId)
            } finally { $graphics.Dispose() }
            if ($image.GetPixel([int]($image.Width/2), [int]($image.Height*0.8)).GetBrightness() -lt 0.9) {
                throw 'Expected a light workspace in the captured image'
            }
            $image.Save($path, [Drawing.Imaging.ImageFormat]::Png)
        } finally { $image.Dispose() }
    } finally {
        [ExcelUtilsTestWindow]::SetPreviewTopmost($window, $false)
        [void][ExcelUtilsTestWindow]::SetThreadDpiAwarenessContext($oldDpi)
    }
}

function Add-PreviewFixtures {
    # Extend the private preview profile with sample history. The round-trip
    # workbook is added by the editor itself and is never inserted here.
    $recentPath = Join-Path $env:EXCELUTILS_PROFILE 'data/recents.xml'
    $recent = [xml](Get-Content -Raw -LiteralPath $recentPath)
    $original = $recent.SelectSingleNode('/recents/file')
    if (!$original) { throw 'Missing recent workbook from the real open/save test' }
    $extra = '运营报表/季度库存盘点.xlsx', '项目计划/交付排期.xlsx', '项目计划/项目预算.xlsx', '财务核算/差旅费用明细.xlsx'
    for ($i = 0; $i -lt $extra.Count; $i++) {
        $sample = [IO.Path]::GetFullPath((Join-Path $samples $extra[$i]))
        $directory = Split-Path $sample
        [void](New-Item -ItemType Directory -Force -Path $directory)
        Copy-Item -LiteralPath "$Runtime/converter/empty/zh-CN/new.xlsx" -Destination $sample
        $item = $original.CloneNode($true)
        $item.SetAttribute('path', $sample)
        $item.SetAttribute('parent', $directory)
        $item.SetAttribute('date', [DateTime]::Now.AddDays(-($i + 1)).ToString('dd.MM.yyyy HH:mm'))
        [void]$recent.DocumentElement.AppendChild($item)
    }
    $recent.Save($recentPath)
}

function Invoke-CaptionButton([IntPtr]$window, [string]$name) {
    $rootElement = [Windows.Automation.AutomationElement]::FromHandle($window)
    $condition = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, $name)
    $button = $rootElement.FindFirst([Windows.Automation.TreeScope]::Descendants, $condition)
    if (!$button -or !$button.Current.IsEnabled) { throw "Caption button unavailable: $name" }
    $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
}

function Test-CaptionButtons([int]$processId) {
    $window = [ExcelUtilsTestWindow]::MainWindow($processId)
    foreach ($action in '最大化','还原','最小化','恢复') {
        if ($action -eq '恢复') { [void][ExcelUtilsTestWindow]::ShowWindowAsync($window, 9) }
        else { Invoke-CaptionButton $window $action }
        $deadline = [DateTime]::UtcNow.AddSeconds(4)
        do {
            $zoomed = [ExcelUtilsTestWindow]::IsZoomed($window)
            $minimized = [ExcelUtilsTestWindow]::IsIconic($window)
            $matchesState = ($zoomed -eq ($action -eq '最大化')) -and ($minimized -eq ($action -eq '最小化'))
            if (!$matchesState) { Start-Sleep -Milliseconds 100 }
        } while (!$matchesState -and [DateTime]::UtcNow -lt $deadline)
        if (!$matchesState) { throw "Window state did not change as expected: $action" }
    }
    Write-Output 'Verified maximize, restore and minimize caption buttons'
}

try {
    foreach ($phase in @('edit','reopen')) {
        if ($UiPreview -and $phase -eq 'reopen') { Add-PreviewFixtures }
        if (Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue) {
            throw 'Port 8080 is already in use. The test requires a private instance.'
        }
        $argsForTest = @('--ascdesktop-support-debug-info')
        $style = if ($UiPreview -and $phase -eq 'reopen') { 'Normal' } else { 'Hidden' }
        $client = Start-Process -FilePath $exe -ArgumentList $argsForTest -PassThru -WindowStyle $style
        $phaseError = $null
        $closeWindow = 0
        try {
            $deadline = [DateTime]::UtcNow.AddSeconds(40)
            do {
                $listener = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue
                if ($client.HasExited) { throw "Client exited early: $($client.ExitCode)" }
                if ($listener) { break }
                Start-Sleep -Milliseconds 250
            } while ([DateTime]::UtcNow -lt $deadline)
            if (!$listener -or $listener.OwningProcess -notcontains $client.Id) { throw 'Missing private test endpoint' }
            if ($UiPreview -and $phase -eq 'reopen') {
                [ExcelUtilsTestWindow]::PlacePreviewWindow([ExcelUtilsTestWindow]::MainWindow($client.Id))
                foreach ($page in 'home','open') {
                    $contentImage = Join-Path $previews "$page-content.png"
                    $windowImage = Join-Path $previews "$page.png"
                    & node "$PSScriptRoot/desktop-roundtrip.mjs" "preview-$page" $book $marker $Runtime $contentImage
                    if ($LASTEXITCODE) { throw "Preview page did not render: $page" }
                    try { Save-WindowPreview $client.Id $windowImage }
                    catch {
                        Write-Warning "Full-window $page preview unavailable: $_. Using rendered page snapshot."
                        Copy-Item -LiteralPath $contentImage -Destination $windowImage -Force
                    }
                }
                Test-CaptionButtons $client.Id
            }
            if ($phase -eq 'edit') {
                & node "$PSScriptRoot/desktop-roundtrip.mjs" browse $book $marker $Runtime
                if ($LASTEXITCODE) { throw 'Open page failed' }
                $deadline = [DateTime]::UtcNow.AddSeconds(20)
                do {
                    $picked = [ExcelUtilsTestWindow]::FilePicker($client.Id, $book)
                    if (!$picked) { Start-Sleep -Milliseconds 150 }
                } while (!$picked -and [DateTime]::UtcNow -lt $deadline)
                if (!$picked) { throw 'Native XLSX picker not available' }
            }
            $editorAction = if ($SaveOnClose -and $phase -eq 'edit') { 'edit-on-close' } else { $phase }
            & node "$PSScriptRoot/desktop-roundtrip.mjs" $editorAction $book $marker $Runtime
            if ($LASTEXITCODE) { throw "Editor verification failed: $phase" }
            if ($phase -eq 'edit') {
                $expected = if ($SaveOnClose) { '' } else { $marker }
                foreach ($tool in 'finance','header') {
                    $dialog = if ($tool -eq 'header') { '选择合并工作簿' } else { '添加财务工作簿' }
                    & node "$PSScriptRoot/desktop-roundtrip.mjs" pick-tool $book $marker $Runtime $tool
                    if ($LASTEXITCODE) { throw "$tool selection failed" }
                    $deadline = [DateTime]::UtcNow.AddSeconds(15)
                    do {
                        $picked = [ExcelUtilsTestWindow]::FilePicker($client.Id, $book, $dialog)
                        if (!$picked) { Start-Sleep -Milliseconds 150 }
                    } while (!$picked -and [DateTime]::UtcNow -lt $deadline)
                    if (!$picked) { throw "Could not select the open workbook from $dialog" }
                    & node "$PSScriptRoot/desktop-roundtrip.mjs" read-tool $book $expected $Runtime $tool
                    if ($LASTEXITCODE) { throw "$tool could not read the open workbook" }
                }
            }
            $modules = (Get-Process -Id $client.Id).Modules
            foreach ($name in 'Qt5Widgets.dll','libcef.dll','ascdocumentscore.dll','qtascdocumentscore.dll') {
                $loaded = $modules | Where-Object ModuleName -eq $name
                if (!$loaded -or $loaded.FileName -ne (Join-Path $Runtime $name)) {
                    throw "Client loaded unexpected runtime for $name"
                }
            }
            if ($client.HasExited) { throw 'Client exited before a close request' }
            if ($UiPreview -and $phase -eq 'reopen') {
                $window = [ExcelUtilsTestWindow]::MainWindow($client.Id)
                Invoke-CaptionButton $window '关闭窗口'
                $closeWindow = $window.ToInt64()
                Write-Output 'Invoked close caption button'
            } else {
                $closeWindow = [ExcelUtilsTestWindow]::Close($client.Id)
                Write-Output ('Posted WM_CLOSE to PID {0} Qt main window 0x{1:X} during {2}' -f $client.Id, $closeWindow, $editorAction)
            }
            if ($editorAction -eq 'edit-on-close') {
                $deadline = [DateTime]::UtcNow.AddSeconds(15)
                do {
                    $confirmed = [ExcelUtilsTestWindow]::ConfirmSave($client.Id)
                    if (!$confirmed) { Start-Sleep -Milliseconds 150 }
                } while (!$confirmed -and !$client.HasExited -and [DateTime]::UtcNow -lt $deadline)
                if (!$confirmed) { throw 'Save-on-close prompt was not shown' }
            }
            if (!$client.WaitForExit(30000)) { throw "Client remained running after WM_CLOSE during $editorAction" }
        } catch {
            $phaseError = $_
            Write-Warning ("PID {0} top-level windows during {1}:`n{2}" -f $client.Id, $phase,
                [ExcelUtilsTestWindow]::DescribeWindows($client.Id))
            try {
                $diskMatches = (Read-CellA1) -ceq $marker
                Write-Warning "Disk XLSX A1 matches this test's marker: $diskMatches"
            } catch { Write-Warning "Could not inspect test workbook on disk: $_" }
        } finally {
            if (!$client.HasExited) {
                if (!$closeWindow) {
                    try {
                        if ([ExcelUtilsTestWindow]::FilePicker($client.Id, '')) { Start-Sleep -Milliseconds 300 }
                        [void][ExcelUtilsTestWindow]::Close($client.Id)
                        [void]$client.WaitForExit(5000)
                    } catch { Write-Warning "Test window cleanup: $_" }
                }
                if (!$client.HasExited) {
                    # This process was started above with a unique disposable test profile.
                    $client.Kill($true)
                    $client.WaitForExit()
                    Write-Warning "Stopped unresponsive test process $($client.Id)."
                }
            }
        }
        if ($phaseError) { throw $phaseError }
        if ($client.ExitCode -ne 0) { throw "Client exited with $($client.ExitCode)" }
        if ((Read-CellA1) -cne $marker) { throw "Disk XLSX value mismatch: $phase" }
    }
    Write-Output "PASS: opened, edited, saved, exited, checked XLSX XML, reopened from history: $book"
} finally {
    $env:EXCELUTILS_PROFILE = $oldProfile
}
