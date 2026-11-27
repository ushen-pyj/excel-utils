using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

static partial class ResearchTools
{
    sealed class Input {
        public string path { get; set; }
        public string sheet { get; set; }
        public int header { get; set; }
        public int first { get; set; }
        public int end { get; set; }
        public int? group { get; set; }
        public int? amount { get; set; }
        public int[] columns { get; set; }
        public int? invoice { get; set; }
        public int? code { get; set; }
        public int? claim { get; set; }
        public bool history { get; set; }
        public bool? skipTotals { get; set; }
        public Dictionary<string,string> expected { get; set; }
        public string Label { get { return Path.GetFileName(path) + " · " + sheet; } }
    }
    sealed class Request {
        public string[] paths { get; set; }
        public Dictionary<string,string> readPaths { get; set; }
        public Input[] sources { get; set; }
        public string output { get; set; }
    }
    sealed class Report {
        public string type { get; set; }
        public string summary { get; set; }
        public string[] headers { get; set; }
        public List<string[]> samples { get; set; }
        public int rows { get; set; }
        public long milliseconds { get; set; }
        public long peakBytes { get; set; }
        public Report() { samples = new List<string[]>(); }
    }
    static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024 };
    static readonly CultureInfo inv = CultureInfo.InvariantCulture;
    static void Reply(object value) { Console.WriteLine(json.Serialize(value)); }
    static void Progress(string source, int rows) { Reply(new { type="progress", source, rows }); }
    static string InputPath(Input s) { return Path.GetFullPath(s.path); }
    static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            var req = json.Deserialize<Request>(Console.In.ReadToEnd());
            if (req == null || args.Length != 1) throw new InvalidDataException("无效的工具请求。");
            SourceBook.ReadPaths = req.readPaths;
            string mode = args[0];
            if (mode == "research-catalog" || mode == "research-preview") {
                Inspect(req, mode == "research-catalog"); return 0;
            }
            var inputs = req.sources;
            if (inputs == null || inputs.Length == 0) throw new InvalidDataException("请先添加来源工作表。");
            foreach (var s in inputs) {
                if (s.header < 1 || s.first <= s.header || s.end < s.first || s.end > 1048576)
                    throw new InvalidDataException(s.Label + " 的明细范围无效。");
                if (inputs.Any(other => !Object.ReferenceEquals(s,other) && String.Equals(InputPath(s),InputPath(other),
                    StringComparison.OrdinalIgnoreCase) && s.sheet == other.sheet && s.first <= other.end && other.first <= s.end))
                    throw new InvalidDataException(s.Label + " 的来源范围重叠，请移除重复来源。");
            }
            bool preview = mode.EndsWith("-preview", StringComparison.Ordinal);
            string output = preview ? null : req.output;
            if (!preview && (String.IsNullOrEmpty(output) || File.Exists(output)))
                throw new InvalidDataException("请选择新的结果文件。");
            var timer = Stopwatch.StartNew();
            Report report;
            if (mode == "research-split" || mode == "research-split-preview") report = Split(inputs, output);
            else if (mode == "research-invoices" || mode == "research-invoices-preview") report = Invoices(inputs,output);
            else throw new InvalidDataException("未知的财务工具。");
            report.type = preview ? "preview" : "done";
            report.milliseconds = timer.ElapsedMilliseconds;
            report.peakBytes = Process.GetCurrentProcess().PeakWorkingSet64;
            Reply(report); return 0;
        } catch (Exception ex) { Reply(new { type="error",error=ex.Message }); return 1; }
    }
    static SourceBook.Tab Tab(SourceBook book, string name)
    {
        var tab = book.Tabs.FirstOrDefault(t => t.name == name);
        if (tab == null) throw new InvalidDataException("找不到工作表「" + name + "」。");
        return tab;
    }
    static Dictionary<int,string> Headers(SourceBook.Row row) {
        return row.Cells.Where(c => c.Value.Trim().Length > 0).ToDictionary(c => c.Column, c => c.Value.Trim());
    }
    static void CheckColumn(Dictionary<int,string> names, int? col, string title) {
        if (!col.HasValue || !names.ContainsKey(col.Value)) throw new InvalidDataException("请设置有效的" + title + "。");
    }
    static void CheckLayout(Input source, Dictionary<int,string> names) {
        if (source.expected == null) return;
        foreach (var expected in source.expected) {
            string actual;
            if (!names.TryGetValue(Int32.Parse(expected.Key,inv),out actual) || actual != expected.Value)
                throw new InvalidDataException(source.Label + " 的「" + expected.Value + "」列已变化，请重新添加工作簿并确认对应列。");
        }
    }
    static SourceBook.Cell Pick(SourceBook.Row row, int? column) {
        if (column.HasValue) foreach (var c in row.Cells) if (c.Column == column.Value) return c;
        return new SourceBook.Cell();
    }
    static readonly HashSet<string> totalLabels = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "合计","小计","总计","本页小计","本期合计","本月合计","本年累计","subtotal","total","grand total"
    };
    static bool IsTotalRow(Input source, SourceBook.Row row) {
        if (source.skipTotals == false) return false;
        foreach (var c in row.Cells) {
            string first = c.Value.Trim();
            if (first.Length > 0) return c.Type == "inlineStr" && totalLabels.Contains(first.TrimEnd('：',':').TrimEnd());
        }
        return false;
    }
    static string CellText(SourceBook book, SourceBook.Cell c) {
        if (c.Value == null) return "";
        if (c.Type == "n") {
            var mask = book.FormatCode(c.Style);
            if (!String.IsNullOrEmpty(mask) && mask.Length <= 48 && mask.All(ch => ch == '0') &&
                c.Value.All(ch => ch >= '0' && ch <= '9')) return c.Value.PadLeft(mask.Length,'0');
        }
        return c.Value.Trim();
    }
    static void Inspect(Request req, bool catalog)
    {
        var books = new List<object>();
        var paths = catalog ? req.paths : req.sources.Select(s => s.path).Distinct().ToArray();
        foreach (var path in paths) using (var book = new SourceBook(path)) {
            Progress("读取 " + Path.GetFileName(path),0);
            book.LoadStyles();
            var sheets = new List<object>();
            foreach (var tab in book.Tabs) {
                var input = catalog ? null : req.sources.FirstOrDefault(s => s.path == path && s.sheet == tab.name);
                if (!catalog && input == null) continue;
                // Catalog only suggests a header. The targeted preview always follows the user's exact range.
                int header = input == null ? 0 : input.header;
                int first = input == null ? 1 : input.first;
                int end = input == null ? 1048576 : input.end;
                if (input != null && (header < 1 || first <= header || end < first || end > 1048576))
                    throw new InvalidDataException(input.Label + " 的明细范围无效。");
                var candidates = new List<SourceBook.Row>();
                foreach (var r in book.Rows(tab,Math.Max(1,header),first,end)) {
                    if (r.Cells.Count == 0) continue;
                    var copy = new SourceBook.Row { Number=r.Number }; copy.Cells.AddRange(r.Cells);
                    candidates.Add(copy);
                    if (candidates.Count >= (catalog ? 30 : 7)) break;
                }
                book.ResolvePreviewStrings(candidates);
                var head = catalog ? candidates.FirstOrDefault(r => r.Cells.Count(c => c.Type == "inlineStr") >= 2)
                    ?? candidates.FirstOrDefault() : candidates.FirstOrDefault(r => r.Number == header);
                header = head == null ? Math.Max(1,header) : head.Number;
                var columns = head == null ? new Dictionary<int,string>() : Headers(head);
                var keys = columns.Keys.OrderBy(c => c).ToArray();
                var samples = candidates.Where(r => r.Number > header && r.Number >= first).Take(6)
                    .Select(r => keys.Select(c => {
                        var cell = Pick(r,c);
                        if (cell.Value == null) return "";
                        string display = book.Display(cell);
                        return display == cell.Value && cell.Type == "n" ? CellText(book,cell) : display;
                    }).ToArray()).ToArray();
                sheets.Add(new {tab.name,tab.hidden,header,columns=keys.Select(i => new {index=i,name=columns[i]}),samples});
            }
            books.Add(new {path,sheets,snapshot = req.readPaths != null && req.readPaths.ContainsKey(path)});
        }
        Reply(new {type="books",books});
    }
    static SourceBook.Cell TextCell(string value) { return new SourceBook.Cell { Type="inlineStr",Value=value }; }
    static SourceBook.Cell NumberCell(decimal value) { return new SourceBook.Cell { Type="n", Value=value.ToString(inv) }; }
}
