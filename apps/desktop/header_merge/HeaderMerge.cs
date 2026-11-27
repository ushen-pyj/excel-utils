using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

static class HeaderMerge
{
    public sealed class Source {
        public string path { get; set; }
        public string sheet { get; set; }
        public int header { get; set; }
        public int first { get; set; }
        public int end { get; set; }
    }
    public sealed class Request {
        public string[] paths { get; set; }
        public Source[] sources { get; set; }
        public string output { get; set; }
        public Dictionary<string,string> readPaths { get; set; }
    }
    static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 64000000 };
    static void Reply(object message) { Console.WriteLine(json.Serialize(message)); }

    static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            var request = json.Deserialize<Request>(Console.In.ReadToEnd());
            SourceBook.ReadPaths = request.readPaths;
            if (args.Length == 1 && (args[0] == "catalog" || args[0] == "preview")) {
                var books = new List<object>();
                bool catalog = args[0] == "catalog";
                var paths = catalog ? request.paths : request.sources.Select(s => s.path).Distinct().ToArray();
                foreach (string path in paths) using (var book = new SourceBook(path)) {
                    book.LoadStyles();
                    var samples = new List<SheetSample>();
                    foreach (var tab in book.Tabs) {
                        var settings = catalog ? null : request.sources.FirstOrDefault(s => s.path == path && s.sheet == tab.name);
                        if (!catalog && settings == null) continue;
                        samples.Add(new SheetSample(book, tab, settings));
                    }
                    book.ResolvePreviewStrings(samples.SelectMany(s => s.Rows));
                    books.Add(new {path, snapshot = request.readPaths != null && request.readPaths.ContainsKey(path),
                        sheets = samples.Select(s => s.Describe(book)).ToArray()});
                }
                Reply(new {type=catalog ? "books" : "preview", books}); return 0;
            }
            if (args.Length != 1 || args[0] != "merge") throw new ArgumentException("无效的合并命令。");
            var timer = Stopwatch.StartNew();
            int rows = Merge(request);
            Reply(new {type="done", rows, milliseconds=timer.ElapsedMilliseconds,
                peakBytes=Process.GetCurrentProcess().PeakWorkingSet64});
            return 0;
        } catch (Exception ex) { Reply(new {type="error", error=ex.Message}); return 1; }
    }

    static int Merge(Request request)
    {
        if (request.sources == null || request.sources.Length == 0) throw new InvalidDataException("请勾选要合并的工作表。");
        foreach (var source in request.sources)
            if (String.Equals(Path.GetFullPath(source.path),Path.GetFullPath(request.output),StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("输出文件与来源文件相同。");
        // The desktop host owns a sibling temporary file and publishes it atomically only on success.
        string[] headers = null;
        int completed = 0;
        using (var result = new ResultBook(request.output)) {
            foreach (var group in request.sources.GroupBy(s => s.path, StringComparer.OrdinalIgnoreCase)) {
                using (var book = new SourceBook(group.Key)) {
                    book.LoadTables();
                    if (headers == null) result.UseHeaderTemplate(book);
                    var styles = book.MapStyles(result);
                    foreach (var s in group) {
                        try {
                            var tab = book.Tabs.FirstOrDefault(t => t.name == s.sheet);
                            if (tab == null) throw new InvalidDataException("找不到工作表，请重新选择文件。");
                            if (s.header < 1 || s.first <= s.header || s.end < s.first || s.end > 1048576)
                                throw new InvalidDataException("请检查表头和明细起止行。");
                            Append(book, tab, s, result, styles, ref headers, completed++, request.sources.Length);
                        } catch (Exception e) { throw new InvalidDataException(Path.GetFileName(s.path) + " · " + s.sheet + "：" + e.Message, e); }
                    }
                }
            }
            Reply(new {type="progress", source="正在封装结果工作簿", rows=result.Count, finalizing=true});
            result.Finish();
            return result.Count;
        }
    }
    static void Append(SourceBook book, SourceBook.Tab tab, Source source, ResultBook result, int[] styles,
        ref string[] headers, int completed, int total)
    {
        var label = Path.GetFileName(source.path) + " · " + tab.name;
        Action<double> report = fraction => Reply(new {type="progress", source=label, rows=result.Count,
            current=completed + 1, total, value=Math.Min(99, Math.Floor(100 * (completed + fraction) / total))});
        report(0);
        var progressClock = Stopwatch.StartNew();
        int[] map = null;
        SourceBook.Cell[] aligned = null;
        foreach (var row in book.Rows(tab, source.header, source.first, source.end)) {
            if (row.Number == source.header) {
                var names = new Dictionary<string,int>(StringComparer.Ordinal);
                foreach (var c in row.Cells) {
                    var name = c.Value.Trim();
                    if (name.Length == 0) continue;
                    if (names.ContainsKey(name)) throw new InvalidDataException("表头第 " + source.header + " 行有重复列名「" + name + "」。");
                    names.Add(name, c.Column);
                }
                if (names.Count == 0) throw new InvalidDataException("表头行为空。");
                if (headers == null) {
                    headers = names.OrderBy(p => p.Value).Select(p => p.Key).ToArray();
                    var byColumn = row.Cells.ToDictionary(c => c.Column, c => c.Style);
                    result.Header(headers, headers.Select(h => byColumn[names[h]]).ToArray(), row.Height);
                }
                var missing = headers.Except(names.Keys).ToArray();
                var extra = names.Keys.Except(headers).ToArray();
                if (missing.Length + extra.Length != 0) {
                    var diff = new List<string>();
                    if (missing.Length > 0) diff.Add("缺少「" + string.Join("、",missing) + "」");
                    if (extra.Length > 0) diff.Add("多出「" + string.Join("、",extra) + "」");
                    throw new InvalidDataException("与首张表相比，" + string.Join("，",diff) + "。请检查表头行。");
                }
                map = Enumerable.Repeat(-1,names.Values.Max()+1).ToArray();
                for (int i = 0; i < headers.Length; ++i) map[names[headers[i]]] = i;
                aligned = new SourceBook.Cell[headers.Length];
                continue;
            }
            if (map == null) break;
            if (row.Cells.Count == 0) continue;
            Array.Clear(aligned,0,aligned.Length);
            foreach (var c in row.Cells) {
                if (c.Column >= map.Length || map[c.Column] < 0)
                    throw new InvalidDataException("第 " + row.Number + " 行第 " + (c.Column+1) + " 列有数据，但表头没有列名。");
                aligned[map[c.Column]] = c;
            }
            result.Append(aligned, styles, book.Date1904);
            if (result.Count % 1024 == 0 && progressClock.ElapsedMilliseconds >= 200) {
                report(book.SheetReadFraction); progressClock.Restart();
            }
        }
        if (map == null) throw new InvalidDataException("未找到第 " + source.header + " 行的表头。");
    }
}
