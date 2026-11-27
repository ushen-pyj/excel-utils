using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.RegularExpressions;

static partial class ResearchTools
{
    sealed class SplitGroup {
        public int Index, Count;
        public decimal Sum;
        public string Name, FileName;
        public BinaryWriter Buffer;
        public LinkedListNode<SplitGroup> Node;
    }
    // Batch interleaved rows before touching disk. The number of live buffers stays bounded
    // even when a user selects an unusually high-cardinality grouping column.
    sealed class GroupSpool : IDisposable {
        readonly LinkedList<SplitGroup> recent = new LinkedList<SplitGroup>();
        public readonly string Folder;
        public GroupSpool(string parent) {
            Folder = Path.Combine(parent, "groups-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Folder);
        }
        public string DataPath(SplitGroup g) { return Path.Combine(Folder,g.Index.ToString(inv) + ".bin"); }
        void Flush(SplitGroup g) {
            var buffer = (MemoryStream)g.Buffer.BaseStream;
            using (var file = new FileStream(DataPath(g), FileMode.Append, FileAccess.Write, FileShare.None))
                buffer.WriteTo(file);
            g.Buffer.Dispose(); g.Buffer = null;
            recent.Remove(g.Node); g.Node = null;
        }
        public void Append(SplitGroup g, SourceBook.Cell[] cells) {
            if (g.Buffer == null) {
                if (recent.Count == 512) Flush(recent.Last.Value);
                g.Buffer = new BinaryWriter(new MemoryStream());
            } else recent.Remove(g.Node);
            g.Node = recent.AddFirst(g);
            foreach (var c in cells) {
                g.Buffer.Write(c.Value != null);
                if (c.Value == null) continue;
                g.Buffer.Write(c.Style); g.Buffer.Write(c.Type); g.Buffer.Write(c.Value);
            }
            if (g.Buffer.BaseStream.Length >= 32768) Flush(g);
        }
        public void Seal() { while (recent.Count > 0) Flush(recent.Last.Value); }
        public void Dispose() {
            foreach (var g in recent) g.Buffer.Dispose();
            Directory.Delete(Folder,true);
        }
    }
    static string GroupFileName(string name, HashSet<string> used)
    {
        string safe = String.Concat(name.Select(ch => Char.IsControl(ch) || "<>:\"/\\|?*".IndexOf(ch) >= 0 ? '_' : ch)).Trim(' ','.');
        if (safe.Length == 0) safe = "未填写";
        if (safe.Length > 72) safe = safe.Substring(0,Char.IsHighSurrogate(safe[71]) ? 71 : 72).TrimEnd(' ','.');
        if (Regex.IsMatch(safe, @"^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)",RegexOptions.IgnoreCase)) safe = "_" + safe;
        string stem = safe;
        for (int suffix = 2; !used.Add(safe + ".xlsx"); ++suffix) safe = stem + " (" + suffix + ")";
        return safe + ".xlsx";
    }
    static decimal ReadAmount(SourceBook.Cell cell, string label) {
        string raw = (cell.Value ?? "").Trim();
        decimal money;
        var style = cell.Type == "n" ? NumberStyles.Float : NumberStyles.AllowLeadingSign |
            NumberStyles.AllowDecimalPoint | NumberStyles.AllowThousands | NumberStyles.AllowParentheses;
        if (cell.Type != "n" && !Regex.IsMatch(raw, @"^\(?[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?\)?$") ||
            !Decimal.TryParse(raw,style,inv,out money) || Decimal.Round(money,2) != money)
            throw new InvalidDataException(label + " 的金额不是精确到分的数值。");
        return money;
    }
    static void ZipFile(ZipArchive archive, string name, string file) {
        using (var dest = archive.CreateEntry(name,CompressionLevel.NoCompression).Open())
        using (var src = File.OpenRead(file)) src.CopyTo(dest);
    }
    static Report Split(Input[] inputs, string output)
    {
        if (inputs.Length != 1) throw new InvalidDataException("每次请选择一张要拆分的来源工作表。");
        var s = inputs[0];
        var groups = new Dictionary<string,SplitGroup>(StringComparer.Ordinal);
        var ordered = new List<SplitGroup>();
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        string[] headers = null;
        int[] headerStyles = null;
        string headerHeight = null;
        var report = new Report { headers = s.amount.HasValue ? new[]{"分组","输出文件","明细行数","金额合计"} :
            new[]{"分组","输出文件","明细行数"} };
        decimal total = 0;
        int skipped = 0;
        using (var spool = output == null ? null : new GroupSpool(Path.GetDirectoryName(Path.GetFullPath(output))))
        using (var book = new SourceBook(s.path)) {
            book.LoadTables();
            var tab = Tab(book,s.sheet);
            Progress("正在按分组读取 " + s.Label,0);
            var positions = new Dictionary<int,int>();
            SourceBook.Cell[] aligned = null;
            foreach (var row in book.Rows(tab,s.header,s.first,s.end)) {
                if (row.Number == s.header) {
                    var names = Headers(row);
                    CheckLayout(s,names);
                    CheckColumn(names,s.group,"拆分列");
                    if (s.amount.HasValue) CheckColumn(names,s.amount,"金额列");
                    if (s.columns == null || s.columns.Length == 0 || s.columns.Distinct().Count() != s.columns.Length)
                        throw new InvalidDataException("请选择要导出的列。");
                    foreach (int col in s.columns) { CheckColumn(names,col,"导出列"); positions.Add(col,positions.Count); }
                    headers = s.columns.Select(col => names[col]).ToArray();
                    var byColumn = row.Cells.ToDictionary(c => c.Column, c => c.Style);
                    headerStyles = s.columns.Select(col => byColumn[col]).ToArray();
                    headerHeight = row.Height;
                    aligned = new SourceBook.Cell[headers.Length]; continue;
                }
                if (headers == null) throw new InvalidDataException("找不到指定的表头行。");
                if (row.Cells.Count == 0) continue;
                if (IsTotalRow(s,row)) { ++skipped; continue; }
                var groupCell = Pick(row,s.group);
                if (groupCell.Type == "e") throw new InvalidDataException(s.Label + " 第 " + row.Number + " 行拆分列含有 Excel 错误值。");
                string key = CellText(book,groupCell);
                if (groupCell.Type == "n" && key == groupCell.Value) key = book.Display(groupCell);
                SplitGroup g;
                if (!groups.TryGetValue(key,out g)) {
                    g = new SplitGroup { Index=ordered.Count, Name=key.Length == 0 ? "（未填写）" : key,
                        FileName=GroupFileName(key,used) };
                    ordered.Add(g); groups.Add(key,g);
                }
                ++g.Count; ++report.rows;
                if (s.amount.HasValue) {
                    decimal amount = ReadAmount(Pick(row,s.amount),s.Label + " 第 " + row.Number + " 行");
                    g.Sum += amount; total += amount;
                }
                if (spool != null) {
                    Array.Clear(aligned,0,aligned.Length);
                    foreach (var c in row.Cells) {
                        int index; if (positions.TryGetValue(c.Column,out index)) aligned[index] = c;
                    }
                    spool.Append(g,aligned);
                }
                if (report.rows % 10000 == 0) Progress("正在按组整理 " + s.Label,report.rows);
            }
            if (report.rows == 0) throw new InvalidDataException("所选范围没有可拆分的明细，已跳过 " + skipped + " 行小计或合计。");
            foreach (var g in ordered.Take(20)) {
                var sample = new List<string> {g.Name,g.FileName,g.Count.ToString(inv)};
                if (s.amount.HasValue) sample.Add(g.Sum.ToString("0.00",inv));
                report.samples.Add(sample.ToArray());
            }
            report.summary = report.rows.ToString("N0",inv) + " 行明细分为 " + ordered.Count + " 份工作簿" +
                (s.amount.HasValue ? "，金额合计 " + total.ToString("#,##0.00",inv) : "") +
                (groups.ContainsKey("") ? "，其中 " + groups[""].Count + " 行归入未填写组" : "") + "。" +
                (skipped == 0 ? "" : "已跳过 " + skipped + " 行小计或合计。");
            if (spool != null) {
                spool.Seal();
                string part = Path.Combine(spool.Folder,"group.xlsx"), manifest = Path.Combine(spool.Folder,"manifest.xlsx");
                using (var file = new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.None))
                using (var zip = new ZipArchive(file,ZipArchiveMode.Create)) {
                    using (var list = new ResultBook(manifest,"拆分清单")) {
                    list.Header(report.headers);
                    var update = Stopwatch.StartNew();
                    var listStyles = new[]{0,list.Style(2,null)};
                    foreach (var g in ordered) {
                        if (g.Index == 0 || g.Index == ordered.Count - 1 || update.ElapsedMilliseconds >= 180) {
                            Progress("正在封装 " + (g.Index+1) + " / " + ordered.Count + " · " + g.Name,report.rows);
                            update.Restart();
                        }
                        using (var result = new ResultBook(part,"明细"))
                        using (var reader = new BinaryReader(File.OpenRead(spool.DataPath(g)))) {
                            result.UseHeaderTemplate(book);
                            var styles = book.MapStyles(result); result.Header(headers,headerStyles,headerHeight);
                            for (int r = 0; r < g.Count; ++r) {
                                for (int i = 0; i < aligned.Length; ++i) aligned[i] = !reader.ReadBoolean() ? new SourceBook.Cell() :
                                    new SourceBook.Cell { Style=reader.ReadInt32(),Type=reader.ReadString(),Value=reader.ReadString() };
                                result.Append(aligned,styles,book.Date1904);
                            }
                            result.Finish();
                        }
                        ZipFile(zip,"分组/" + g.FileName,part); File.Delete(part);
                        var cells = new List<SourceBook.Cell> {TextCell(g.Name),TextCell(g.FileName),NumberCell(g.Count)};
                        if (s.amount.HasValue) {
                            if (Math.Abs(g.Sum) > 9999999999999.99m) throw new InvalidDataException(g.Name + " 的合计超出 Excel 到分精度。");
                            var amount = NumberCell(g.Sum); amount.Style = 1; cells.Add(amount);
                        }
                        list.Append(cells.ToArray(),listStyles,false);
                    }
                    list.Finish();
                    }
                    ZipFile(zip,"拆分清单.xlsx",manifest);
                }
            }
        }
        return report;
    }
}
