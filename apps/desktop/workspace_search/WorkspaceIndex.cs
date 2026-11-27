using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

// One replaceable index per workbook. Each block has a character-pair filter so
// substring searches can skip its cell data without loading it into memory.
static class WorkspaceIndex
{
    const int Format = 1, FilterBytes = 256, PageSize = 100;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static void Send(object value) { Console.WriteLine(Json.Serialize(value)); }

    static string Key(string path)
    {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(path.ToUpperInvariant()))).Replace("-", "");
    }

    static int Bit(char a, char b) { return ((a * 31) ^ b) & (FilterBytes * 8 - 1); }
    static bool Filter(byte[] bits, string text, bool add)
    {
        for (int i = 0; i < text.Length; ++i) {
            int bit = Bit(text[i], text[i]);
            int pair = i == 0 ? bit : Bit(text[i - 1], text[i]);
            if (add) {
                bits[bit >> 3] |= (byte)(1 << (bit & 7));
                bits[pair >> 3] |= (byte)(1 << (pair & 7));
            } else if ((bits[bit >> 3] & (1 << (bit & 7))) == 0 ||
                       (bits[pair >> 3] & (1 << (pair & 7))) == 0) return false;
        }
        return true;
    }

    static void Flush(BinaryWriter output, MemoryStream cells, byte[] filter)
    {
        if (cells.Length == 0) return;
        output.Write((int)cells.Length);
        output.Write(filter);
        output.Write(cells.GetBuffer(), 0, (int)cells.Length);
        cells.SetLength(0);
        Array.Clear(filter, 0, filter.Length);
    }

    static void WriteIndex(string destination, FileInfo file)
    {
        long length = file.Length, time = file.LastWriteTimeUtc.Ticks;
        string temp = destination + ".tmp";
        try {
            using (var output = new BinaryWriter(File.Create(temp)))
            using (var book = new SourceBook(file.FullName, true))
            using (var block = new MemoryStream())
            using (var cells = new BinaryWriter(block)) {
                output.Write(Format); output.Write(length); output.Write(time);
                book.LoadTables();
                var bits = new byte[FilterBytes];
                foreach (var tab in book.Tabs) {
                    output.Write(tab.name); output.Write(tab.hidden);
                    foreach (var row in book.Rows(tab, 1, 1, 1048576)) foreach (var c in row.Cells) {
                        string raw = c.Value ?? "";
                        string display = (c.Type == "n" || c.Type == "b") && raw.Length > 0 ? book.Display(c) : raw;
                        string formula = c.Formula ?? "";
                        cells.Write(row.Number); cells.Write(c.Column);
                        cells.Write(display); cells.Write(raw == display ? "" : raw); cells.Write(formula);
                        Filter(bits, display.ToUpperInvariant(), true);
                        if (raw != display) Filter(bits, raw.ToUpperInvariant(), true);
                        if (formula.Length > 0) Filter(bits, formula.ToUpperInvariant(), true);
                        if (block.Length >= 8192) Flush(output, block, bits);
                    }
                    Flush(output, block, bits);
                    output.Write(0);
                }
            }
            file.Refresh();
            if (!file.Exists || length != file.Length || time != file.LastWriteTimeUtc.Ticks)
                throw new IOException("索引期间文件发生变化，请刷新。");
            if (File.Exists(destination)) File.Replace(temp, destination, null);
            else File.Move(temp, destination);
        } finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    static bool Current(string index, FileInfo file)
    {
        if (!File.Exists(index)) return false;
        try {
            using (var r = new BinaryReader(File.OpenRead(index)))
                return r.ReadInt32() == Format && r.ReadInt64() == file.Length && r.ReadInt64() == file.LastWriteTimeUtc.Ticks;
        } catch (EndOfStreamException) { return false; }
    }

    static string Address(int row, int column)
    {
        string label = "";
        for (int col = column + 1; col > 0; col = (col - 1) / 26)
            label = (char)('A' + (col - 1) % 26) + label;
        return label + row.ToString(CultureInfo.InvariantCulture);
    }

    static int Find(string text, string term, Regex pattern, out Match match)
    {
        match = null;
        if (text.Length == 0) return -1;
        if (pattern == null) return text.ToUpperInvariant().IndexOf(term, StringComparison.Ordinal);
        match = pattern.Match(text);
        return match.Success ? match.Index : -1;
    }

    static List<object> MatchRanges(string text, int start, int end, int at, string term, Match match)
    {
        var ranges = new List<object>();
        int prefix = start > 0 ? 1 : 0;
        string upper = match == null ? text.ToUpperInvariant() : null;
        while (at >= 0 && at < end) {
            int size = match == null ? term.Length : match.Length;
            if (size > 0) ranges.Add(new { start = prefix + at - start, length = Math.Min(size, end - at) });
            if (at + size >= end) break;
            if (match == null) at = upper.IndexOf(term, at + size, StringComparison.Ordinal);
            else {
                match = match.NextMatch();
                at = match.Success ? match.Index : -1;
            }
        }
        return ranges;
    }

    sealed class Results {
        internal long Total;
        internal readonly List<object> Hits = new List<object>();
        internal void Read(string index, string path, string term, Regex pattern, long offset)
        {
            using (var r = new BinaryReader(File.OpenRead(index))) {
                var stream = r.BaseStream;
                stream.Position = 20;
                while (stream.Position < stream.Length) {
                    string sheet = r.ReadString(); bool hidden = r.ReadBoolean();
                    int bytes;
                    while ((bytes = r.ReadInt32()) != 0) {
                        byte[] bits = r.ReadBytes(FilterBytes);
                        long end = stream.Position + bytes;
                        if (bytes < 0 || end > stream.Length || bits.Length != FilterBytes) throw new InvalidDataException("索引不完整");
                        if (pattern == null && !Filter(bits, term, false)) { stream.Position = end; continue; }
                        while (stream.Position < end) {
                            int row = r.ReadInt32(), col = r.ReadInt32();
                            string display = r.ReadString(), raw = r.ReadString(), formula = r.ReadString();
                            string text = display;
                            Match match;
                            int at = Find(text, term, pattern, out match);
                            if (at < 0) { text = raw; at = Find(text, term, pattern, out match); }
                            if (at < 0) { text = formula; at = Find(text, term, pattern, out match); }
                            if (at < 0) continue;
                            ++Total;
                            if (Total <= offset || Hits.Count >= PageSize) continue;
                            int start = Math.Max(0, at - 30);
                            int snippetEnd = Math.Min(text.Length, start + 160);
                            string snippet = (start > 0 ? "…" : "") + text.Substring(start, snippetEnd - start) + (snippetEnd < text.Length ? "…" : "");
                            var matches = MatchRanges(text, start, snippetEnd, at, term, match);
                            Hits.Add(new {path, sheet, hidden, address = Address(row, col), snippet, matches});
                        }
                    }
                }
            }
        }
    }

    static int Main()
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            var request = Json.Deserialize<Dictionary<string,object>>(Console.In.ReadToEnd());
            string root = Path.GetFullPath((string)request["root"]), cache = Path.Combine((string)request["cache"], Key(root));
            bool rebuild = request.ContainsKey("rebuild") && (bool)request["rebuild"];
            var saved = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (request.ContainsKey("saved"))
                foreach (string path in (IEnumerable)request["saved"]) saved.Add(Path.GetFullPath(path));
            string term = (string)request["query"];
            Regex pattern = null;
            if (term.Length > 0 && request.ContainsKey("regex") && (bool)request["regex"]) {
                try {
                    pattern = new Regex(term, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
                } catch (ArgumentException e) {
                    Send(new {type="error", message="正则表达式无效：" + e.Message});
                    return 1;
                }
            } else term = term.ToUpperInvariant();
            long offset = Convert.ToInt64(request["offset"]);
            Directory.CreateDirectory(cache);
            if (!Directory.Exists(root)) throw new DirectoryNotFoundException("工作区文件夹不可访问。");
            var directories = new Stack<DirectoryInfo>();
            directories.Push(new DirectoryInfo(root));
            var files = new List<FileInfo>();
            var errors = new List<string>();
            while (directories.Count > 0) {
                var dir = directories.Pop();
                try {
                    files.AddRange(dir.GetFiles("*.xlsx").Where(f => f.Extension.Equals(".xlsx", StringComparison.OrdinalIgnoreCase) && !f.Name.StartsWith("~$")));
                    foreach (var child in dir.GetDirectories())
                        if ((child.Attributes & FileAttributes.ReparsePoint) == 0) directories.Push(child);
                } catch (UnauthorizedAccessException e) { errors.Add(e.Message); }
                  catch (IOException e) { errors.Add(e.Message); }
            }
            var keep = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var results = new Results();
            int done = 0, indexed = 0, matchedFiles = 0;
            var groupCounts = new Dictionary<string,long>();
            var report = System.Diagnostics.Stopwatch.StartNew();
            foreach (var file in files.OrderBy(f => f.FullName, StringComparer.OrdinalIgnoreCase)) {
                string index = Path.Combine(cache, Key(file.FullName) + ".idx");
                keep.Add(index);
                if (done == 0 || report.ElapsedMilliseconds >= 250) {
                    Send(new {type="progress", done, total=files.Count, name=file.Name});
                    report.Restart();
                }
                try {
                    if (rebuild || saved.Contains(file.FullName) || !Current(index, file)) { WriteIndex(index, file); indexed++; }
                    if (term.Length > 0) {
                        long before = results.Total; int hits = results.Hits.Count;
                        try { results.Read(index, file.FullName, term, pattern, offset); }
                        catch (Exception e) {
                            if (!(e is IOException || e is InvalidDataException || e is FormatException)) throw;
                            results.Total = before;
                            results.Hits.RemoveRange(hits, results.Hits.Count - hits);
                            WriteIndex(index, file);
                            indexed++;
                            results.Read(index, file.FullName, term, pattern, offset);
                        }
                        if (results.Total > before) matchedFiles++;
                        if (results.Hits.Count > hits) groupCounts[file.FullName] = results.Total - before;
                    }
                } catch (RegexMatchTimeoutException) { throw; }
                  catch (Exception e) { errors.Add(file.FullName + " — " + e.Message); }
                done++;
            }
            foreach (var index in Directory.GetFiles(cache, "*.idx")) if (!keep.Contains(index)) File.Delete(index);
            Send(new {type="result", files=done, indexed, errors=errors.Take(12).ToArray(), skipped=errors.Count,
                total=results.Total, matchedFiles, groupCounts, hits=results.Hits, pageSize=PageSize});
            return 0;
        } catch (RegexMatchTimeoutException) {
            Send(new {type="error", message="正则表达式匹配超时，请简化表达式后重试。"});
            return 1;
        } catch (Exception e) { Send(new {type="error", message=e.Message}); return 1; }
    }
}
