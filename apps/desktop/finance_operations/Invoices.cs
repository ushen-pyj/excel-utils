using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;

static partial class ResearchTools
{
    sealed class InvoiceRow {
        public Input Source;
        public int Number;
        public string Invoice, Code, Claim;
    }
    static string Identifier(SourceBook book, SourceBook.Cell cell, string where) {
        string text = CellText(book,cell);
        if (cell.Type == "e") throw new InvalidDataException(where + " 含有 Excel 错误值。");
        if (cell.Type != "n" || text.Length == 0) return text;
        decimal n;
        if (!Decimal.TryParse(text,NumberStyles.Float,inv,out n) || n < 0 || n != Decimal.Truncate(n) || n >= 1000000000000000m)
            throw new InvalidDataException(where + " 的数字编号可能已丢失精度。请从原始单据恢复为文本编号后重试。");
        return text.All(Char.IsDigit) ? text : n.ToString("0",inv);
    }
    static bool SeveralClaims(List<InvoiceRow> rows) {
        if (rows.Count < 2) return false;
        var first = rows[0];
        return rows.Skip(1).Any(r => first.Claim.Length == 0 || r.Source != first.Source || r.Claim != first.Claim);
    }
    static Report Invoices(Input[] inputs, string output)
    {
        if (inputs.All(s => s.history)) throw new InvalidDataException("请至少选择一张本期待查表。");
        var report = new Report {headers = new[]{"核查原因","发票号码","发票代码","报销单号","台账","来源工作簿","来源工作表","来源行号"}};
        var register = new Dictionary<string,List<InvoiceRow>>(StringComparer.Ordinal);
        var missing = new List<InvoiceRow>();
        int current = 0, historical = 0, skipped = 0;
        foreach (var s in inputs.OrderBy(x => x.history)) using (var book = new SourceBook(s.path)) {
            book.LoadTables();
            bool headerOK = false;
            Progress("核对 " + s.Label,current+historical);
            foreach (var row in book.Rows(Tab(book,s.sheet),s.header,s.first,s.end)) {
                if (row.Number == s.header) {
                    var names = Headers(row);
                    CheckLayout(s,names);
                    CheckColumn(names,s.invoice,"发票号码列");
                    if (s.claim.HasValue) CheckColumn(names,s.claim,"报销单号列");
                    if (s.code.HasValue) CheckColumn(names,s.code,"发票代码列");
                    var selected = new[]{s.invoice,s.claim,s.code}.Where(c => c.HasValue).ToArray();
                    if (selected.Distinct().Count() != selected.Length) throw new InvalidDataException(s.Label + " 的编号字段不能选同一列。");
                    headerOK = true; continue;
                }
                if (!headerOK) throw new InvalidDataException(s.Label + " 找不到表头行。");
                if (row.Cells.Count == 0) continue;
                if (IsTotalRow(s,row)) { ++skipped; continue; }
                if (s.history) ++historical; else ++current;
                if ((current+historical) % 10000 == 0) Progress("核对 " + s.Label,current+historical);
                string where = s.Label + " 第 " + row.Number + " 行";
                string number = Identifier(book,Pick(row,s.invoice),where + "发票号码");
                List<InvoiceRow> records;
                if (!register.TryGetValue(number,out records) && s.history) continue;
                var record = new InvoiceRow {Source=s,Number=row.Number,Invoice=number,
                    Code=Identifier(book,Pick(row,s.code),where + "发票代码"),Claim=Identifier(book,Pick(row,s.claim),where + "报销单号")};
                if (number.Length == 0) { missing.Add(record); continue; }
                if (records == null) { records = new List<InvoiceRow>(); register.Add(number,records); }
                records.Add(record);
            }
            if (!headerOK) throw new InvalidDataException(s.Label + " 找不到表头行。");
        }
        if (current == 0) throw new InvalidDataException("本期所选范围没有明细，已跳过 " + skipped + " 行小计或合计。");
        int flagged = 0, rows = 0;
        var paths = inputs.GroupBy(s => Path.GetFileName(s.path),StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Select(s => s.path).Distinct(StringComparer.OrdinalIgnoreCase).Count() > 1)
            .Select(g => g.Key);
        var disambiguate = new HashSet<string>(paths,StringComparer.OrdinalIgnoreCase);
        var plainStyles = new[]{0};
        using (var result = output == null ? null : new ResultBook(output,"发票复核清单")) {
            if (result != null) result.Header(report.headers);
            Action<string,InvoiceRow> append = (reason,r) => {
                var basename = Path.GetFileName(r.Source.path);
                string[] fields = {reason,r.Invoice,r.Code,r.Claim,r.Source.history ? "历史" : "本期",
                    disambiguate.Contains(basename) ? r.Source.path : basename,r.Source.sheet,r.Number.ToString(inv)};
                if (report.samples.Count < 20) report.samples.Add(fields);
                if (result != null) {
                    var cells = fields.Select(TextCell).ToArray(); cells[cells.Length - 1] = NumberCell(r.Number);
                    result.Append(cells,plainStyles,false);
                }
                if (++rows % 10000 == 0) Progress("整理复核清单",rows);
                if (rows > 1048575) throw new InvalidDataException("复核明细超过单张工作表容量，请分批处理。");
            };
            foreach (var invoice in register.Values) {
                if (invoice.Count == 1) continue;
                var byCode = invoice.GroupBy(r => r.Code,StringComparer.Ordinal).ToList();
                bool partial = byCode.Count > 1 && byCode.Any(g => g.Key.Length == 0);
                IEnumerable<List<InvoiceRow>> sets = partial ? new[]{invoice}.AsEnumerable() : byCode.Select(g => g.ToList());
                bool invoiceFlagged = false;
                foreach (var set in sets) {
                    if (!set.Any(r => !r.Source.history) || !SeveralClaims(set)) continue;
                    string reason = partial ? "同号，代码不全待核" : set.Any(r => r.Source.history) ? "历史台账已有" : "本期重复待核";
                    foreach (var r in set) append(reason,r);
                    invoiceFlagged = true;
                }
                if (invoiceFlagged) ++flagged;
            }
            foreach (var r in missing) append("缺少发票号码",r);
            if (result != null) result.Finish();
        }
        report.rows = rows;
        report.summary = "核对本期 " + current.ToString("N0",inv) + " 行、历史 " + historical.ToString("N0",inv) +
            " 行，" + flagged + " 个票号需要复核，" + missing.Count + " 行缺少票号。" +
            (skipped == 0 ? "" : "已跳过 " + skipped + " 行小计或合计。");
        return report;
    }
}
