using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

// Keep only the current source workbook's shared strings and number formats.
// Worksheet data is consumed one row at a time, including for multi-sheet books.
sealed class SourceBook : IDisposable
{
    internal sealed class Tab { public string name; public bool hidden; public string part; }
    internal struct Cell { public int Column, Style; public string Type, Value, Formula; }
    internal sealed class Row { public int Number; public string Height; public readonly List<Cell> Cells = new List<Cell>(); }
    sealed class Relationship { public string Part, Type; }
    readonly ZipArchive zip;
    readonly Dictionary<string, Relationship> rels;
    internal readonly List<Tab> Tabs = new List<Tab>();
    internal readonly bool Date1904;
    List<string> strings;
    int[] formats;
    internal XElement StyleSheet { get; private set; }
    XElement theme;
    internal XElement Theme {
        get {
            var part = rels.Values.FirstOrDefault(p => p.Type.EndsWith("/theme"));
            if (theme == null && part != null) theme = Document(part.Part);
            return theme;
        }
    }
    readonly Dictionary<int, string> custom = new Dictionary<int, string>();
    static readonly Regex simpleNumberFormat = new Regex(@"^[#0,]+(\.[0#]+)?%?$");
    internal static Dictionary<string,string> ReadPaths;
    long sheetBytes, sheetLength;
    internal double SheetReadFraction { get { return sheetLength == 0 ? 0 : Math.Min(1, (double)sheetBytes / sheetLength); } }
    sealed class SheetStream : Stream
    {
        readonly Stream source;
        readonly SourceBook book;
        internal SheetStream(Stream source, SourceBook book) { this.source = source; this.book = book; }
        public override int Read(byte[] buffer, int offset, int count) {
            int read = source.Read(buffer, offset, count); book.sheetBytes += read; return read;
        }
        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return false; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { return book.sheetLength; } }
        public override long Position { get { return book.sheetBytes; } set { throw new NotSupportedException(); } }
        public override long Seek(long offset, SeekOrigin origin) { throw new NotSupportedException(); }
        public override void SetLength(long length) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
        public override void Flush() { }
        protected override void Dispose(bool disposing) { if (disposing) source.Dispose(); base.Dispose(disposing); }
    }

    readonly bool forSearch;
    internal SourceBook(string path, bool forSearch = false)
    {
        this.forSearch = forSearch;
        string name = Path.GetFileName(path);
        string snapshot;
        if (ReadPaths != null && ReadPaths.TryGetValue(path, out snapshot)) path = snapshot;
        FileStream file;
        try { file = File.Open(path, FileMode.Open, FileAccess.Read, forSearch ? FileShare.ReadWrite | FileShare.Delete : FileShare.Read); }
        catch (IOException ex) {
            int code = ex.HResult & 0xffff;
            if (code != 32 && code != 33) throw;
            throw new IOException("「" + name + "」被其他程序占用。请关闭该文件或选择已保存的副本。", ex);
        }
        try { zip = new ZipArchive(file, ZipArchiveMode.Read); }
        catch { file.Dispose(); throw; }
        try {
            var book = Relationships("").Values.First(r => r.Type.EndsWith("/officeDocument")).Part;
            rels = Relationships(book);
            var root = Document(book);
            var props = root.Elements().FirstOrDefault(e => e.Name.LocalName == "workbookPr");
            var epoch = props == null ? "" : (string)props.Attribute("date1904");
            Date1904 = epoch == "true" || epoch == "1";
            foreach (var s in root.Descendants().Where(e => e.Name.LocalName == "sheet")) {
                var id = s.Attributes().First(a => a.Name.LocalName == "id").Value;
                var rel = rels[id];
                if (!rel.Type.EndsWith("/worksheet")) continue;
                var state = (string)s.Attribute("state");
                Tabs.Add(new Tab {name = (string)s.Attribute("name"), part = rel.Part,
                    hidden = state == "hidden" || state == "veryHidden"});
            }
        } catch { zip.Dispose(); throw; }
    }
    public void Dispose() { zip.Dispose(); }
    XmlReader Reader(string part, bool trackRead = false)
    {
        var entry = zip.GetEntry(part);
        if (entry == null) throw new InvalidDataException("工作簿缺少部件 " + part);
        var stream = entry.Open();
        if (trackRead) {
            sheetLength = entry.Length; sheetBytes = 0;
            stream = new SheetStream(stream, this);
        }
        return XmlReader.Create(new BufferedStream(stream, 65536),
            new XmlReaderSettings { CloseInput = true, XmlResolver = null, DtdProcessing = DtdProcessing.Prohibit });
    }
    XElement Document(string part) { using (var r = Reader(part)) return XElement.Load(r); }
    Dictionary<string, Relationship> Relationships(string source)
    {
        var prefix = source.Substring(0, source.LastIndexOf('/') + 1);
        var file = source.Substring(prefix.Length);
        var root = Document(prefix + "_rels/" + file + ".rels");
        var result = new Dictionary<string, Relationship>();
        var baseUri = new Uri("http://package/" + source);
        foreach (var e in root.Elements()) {
            if ((string)e.Attribute("TargetMode") == "External") continue;
            var part = new Uri(baseUri, (string)e.Attribute("Target")).AbsolutePath.TrimStart('/');
            result.Add((string)e.Attribute("Id"), new Relationship {Part = Uri.UnescapeDataString(part), Type = (string)e.Attribute("Type")});
        }
        return result;
    }
    static string TextRuns(XmlReader r)
    {
        string first = null;
        StringBuilder runs = null;
        while (r.Read()) {
            if (r.NodeType != XmlNodeType.Element) continue;
            if (r.LocalName == "rPh") { using (var phonetic = r.ReadSubtree()) { } continue; }
            if (r.LocalName != "t") continue;
            string text = r.ReadString();
            if (first == null) first = text;
            else { if (runs == null) runs = new StringBuilder(first); runs.Append(text); }
        }
        return runs != null ? runs.ToString() : first ?? "";
    }
    internal void LoadTables()
    {
        strings = new List<string>();
        var shared = rels.Values.FirstOrDefault(p => p.Type.EndsWith("/sharedStrings"));
        if (shared != null) using (var r = Reader(shared.Part)) {
            while (r.Read()) if (r.NodeType == XmlNodeType.Element && r.LocalName == "si")
                using (var item = r.ReadSubtree()) strings.Add(TextRuns(item));
        }
        LoadStyles();
    }
    internal void LoadStyles()
    {
        var stylePart = rels.Values.FirstOrDefault(p => p.Type.EndsWith("/styles"));
        formats = new[] {0};
        if (stylePart == null) return;
        var styles = StyleSheet = Document(stylePart.Part);
        foreach (var f in styles.Descendants().Where(e => e.Name.LocalName == "numFmt"))
            custom[(int)f.Attribute("numFmtId")] = (string)f.Attribute("formatCode");
        var xfs = styles.Elements().FirstOrDefault(e => e.Name.LocalName == "cellXfs");
        if (xfs != null) formats = xfs.Elements().Select(e => (int?)e.Attribute("numFmtId") ?? 0).ToArray();
    }
    // A preview may reference only a few entries in a very large string table.
    // Walk to the last needed index once, retaining only strings used in the sample.
    internal void ResolvePreviewStrings(IEnumerable<Row> rows)
    {
        var refs = new Dictionary<int, List<KeyValuePair<Row,int>>>();
        foreach (var row in rows) for (int column = 0; column < row.Cells.Count; ++column) {
            var cell = row.Cells[column];
            if (cell.Type != "s") continue;
            int index = Integer(cell.Value, -1);
            List<KeyValuePair<Row,int>> locations;
            if (!refs.TryGetValue(index, out locations)) refs[index] = locations = new List<KeyValuePair<Row,int>>();
            locations.Add(new KeyValuePair<Row,int>(row, column));
        }
        if (refs.Count == 0) return;
        var shared = rels.Values.FirstOrDefault(p => p.Type.EndsWith("/sharedStrings"));
        if (shared != null) using (var reader = Reader(shared.Part)) {
            int index = 0;
            while (refs.Count > 0 && reader.Read()) {
                if (reader.NodeType != XmlNodeType.Element || reader.LocalName != "si") continue;
                List<KeyValuePair<Row,int>> locations;
                using (var item = reader.ReadSubtree()) if (refs.TryGetValue(index, out locations)) {
                    string value = TextRuns(item);
                    foreach (var loc in locations) {
                        var cell = loc.Key.Cells[loc.Value];
                        cell.Value = value; cell.Type = "inlineStr";
                        loc.Key.Cells[loc.Value] = cell;
                    }
                    refs.Remove(index);
                }
                index++;
            }
        }
        if (refs.Count > 0) throw new InvalidDataException("预览遇到无效的共享字符串索引。");
    }
    internal string Display(Cell cell)
    {
        if (cell.Type == "b") return cell.Value == "1" ? "TRUE" : "FALSE";
        if (cell.Type == "n" && cell.Style >= 0 && cell.Style < formats.Length) {
            string code; int id = formats[cell.Style]; custom.TryGetValue(id, out code);
            double days;
            if (ResultBook.IsCalendar(id, code) && double.TryParse(cell.Value, NumberStyles.Float,
                CultureInfo.InvariantCulture, out days)) {
                double serial = days + (Date1904 ? 1462 : 0);
                if (serial >= 61 && serial < 2958466) {
                    return DateTime.FromOADate(serial).ToString(serial == Math.Truncate(serial) ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm:ss");
                }
            }
            if (code == null) {
                switch (id) {
                    case 1: code = "0"; break;
                    case 2: code = "0.00"; break;
                    case 3: code = "#,##0"; break;
                    case 4: code = "#,##0.00"; break;
                    case 9: code = "0%"; break;
                    case 10: code = "0.00%"; break;
                }
            }
            decimal number;
            if (code != null && code.Length <= 48 && simpleNumberFormat.IsMatch(code) &&
                decimal.TryParse(cell.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out number))
                return number.ToString(code, CultureInfo.InvariantCulture);
        }
        return cell.Value.Length > 180 ? cell.Value.Substring(0, 179) + "…" : cell.Value;
    }
    internal int[] MapStyles(ResultBook result)
    {
        return formats.Select(id => { string code; custom.TryGetValue(id, out code); return result.Style(id, code); }).ToArray();
    }
    internal string FormatCode(int style)
    {
        string code;
        return style >= 0 && style < formats.Length && custom.TryGetValue(formats[style], out code) ? code : null;
    }
    static int Column(string address)
    {
        int col = 0;
        foreach (char c in address) {
            if (c < 'A' || c > 'Z') break;
            col = checked(col * 26 + c - 'A' + 1);
        }
        if (col < 1 || col > 16384) throw new InvalidDataException("无效的单元格地址 " + address);
        return col - 1;
    }
    Cell ReadCell(XmlReader outer, int column, string location, int defaultStyle)
    {
        var c = new Cell { Column = column, Type = outer.GetAttribute("t") ?? "n", Style = Integer(outer.GetAttribute("s"), defaultStyle) };
        bool formula = false;
        using (var r = outer.ReadSubtree()) while (r.Read()) {
            if (r.NodeType != XmlNodeType.Element) continue;
            switch (r.LocalName) {
                case "f":
                    formula = true;
                    if (forSearch && !r.IsEmptyElement) c.Formula = "=" + r.ReadString();
                    break;
                case "v": c.Value = r.ReadString(); break;
                case "is": using (var item = r.ReadSubtree()) c.Value = TextRuns(item); break;
            }
        }
        if (formula && !forSearch && (c.Value == null || (c.Type == "n" && c.Value.Length == 0))) {
            if (strings != null) throw new InvalidDataException(location + " 缺少公式缓存，请重新计算并保存来源工作簿。");
            c.Type = "previewError"; c.Value = "缺少公式缓存";
        }
        if (c.Type == "s" && c.Value != null && strings != null) {
            int id = Integer(c.Value, -1);
            if (id < 0 || id >= strings.Count) throw new InvalidDataException(location + " 的共享字符串索引无效。");
            c.Value = strings[id]; c.Type = "inlineStr";
        }
        if (c.Type == "str") c.Type = "inlineStr";
        return c;
    }
    internal static int Integer(string raw, int fallback)
    {
        return raw == null ? fallback : int.Parse(raw, NumberStyles.None, CultureInfo.InvariantCulture);
    }
    internal IEnumerable<Row> Rows(Tab tab, int header, int first, int last)
    {
        using (var r = Reader(tab.part, true)) {
            var row = new Row();
            var columnStyles = new int[16384];
            while (r.Read() && !(r.NodeType == XmlNodeType.Element && r.LocalName == "sheetData")) {
                if (r.NodeType != XmlNodeType.Element || r.LocalName != "col" || r.GetAttribute("style") == null) continue;
                int style = Integer(r.GetAttribute("style"),0);
                int lastCol = Math.Min(columnStyles.Length,Integer(r.GetAttribute("max"),0));
                for (int col = Math.Max(1,Integer(r.GetAttribute("min"),1)); col <= lastCol; ++col) columnStyles[col-1] = style;
            }
            if (r.EOF || r.IsEmptyElement) yield break;
            int depth = r.Depth;
            while (r.Read() && r.Depth > depth) {
                if (r.NodeType != XmlNodeType.Element || r.LocalName != "row") continue;
                row.Number = Integer(r.GetAttribute("r"), row.Number + 1);
                row.Height = r.GetAttribute("ht");
                int rowStyle = Integer(r.GetAttribute("s"),-1);
                if (row.Number > last) yield break;
                using (var line = r.ReadSubtree()) {
                    if (row.Number < header || (row.Number > header && row.Number < first)) continue;
                    row.Cells.Clear();
                    int col = -1;
                    while (line.Read()) {
                        if (line.NodeType != XmlNodeType.Element || line.LocalName != "c") continue;
                        string address = line.GetAttribute("r");
                        col = address == null ? col + 1 : Column(address);
                        var cell = ReadCell(line, col, address, rowStyle >= 0 ? rowStyle : columnStyles[col]);
                        if (!string.IsNullOrEmpty(cell.Value) || !string.IsNullOrEmpty(cell.Formula)) row.Cells.Add(cell);
                    }
                }
                yield return row;
            }
        }
    }
}
