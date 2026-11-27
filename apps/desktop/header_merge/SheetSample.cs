using System;
using System.Collections.Generic;
using System.Linq;

// Sample a bounded prefix; the merge still validates every row when exporting.
sealed class SheetSample
{
    readonly SourceBook.Tab tab;
    readonly HeaderMerge.Source settings;
    internal readonly List<SourceBook.Row> Rows = new List<SourceBook.Row>();

    internal SheetSample(SourceBook book, SourceBook.Tab tab, HeaderMerge.Source source)
    {
        this.tab = tab;
        settings = source;
        int header = source == null ? 1 : source.header;
        int first = source == null ? 2 : source.first;
        int end = source == null ? 40 : Math.Min(source.end, first + 63);
        if (header < 1 || first <= header || first > 1048576 || end < first || end > 1048576)
            throw new ArgumentException("请检查表头行和明细范围。");
        foreach (var row in book.Rows(tab, header, first, end)) {
            if (row.Cells.Count == 0) continue;
            // SourceBook streams merges using a reusable row. Own the sampled cells.
            var copy = new SourceBook.Row {Number=row.Number};
            copy.Cells.AddRange(row.Cells);
            Rows.Add(copy);
            if (source != null && Rows.Count(r => r.Number >= first) == 3) break;
        }
    }
    int GuessHeader()
    {
        for (int i = 0; i < Rows.Count; i++) {
            var row = Rows[i];
            int fields = row.Cells.Count(c => !String.IsNullOrWhiteSpace(c.Value));
            int text = row.Cells.Count(c => c.Type == "inlineStr" && !String.IsNullOrWhiteSpace(c.Value));
            if (text < 2) continue;
            // A title or metadata pair is often narrower than the actual table below.
            int followingWidth = Rows.Skip(i + 1).Take(3).Select(r => r.Cells.Count)
                .OrderBy(n => n).DefaultIfEmpty(fields).First();
            if (fields >= followingWidth) return row.Number;
        }
        return Rows.OrderByDescending(r => r.Cells.Count).Select(r => r.Number).DefaultIfEmpty(1).First();
    }
    internal object Describe(SourceBook book)
    {
        int header = settings == null ? GuessHeader() : settings.header;
        int first = settings == null ? header + 1 : settings.first;
        int end = settings == null ? 1048576 : settings.end;
        var heading = Rows.FirstOrDefault(r => r.Number == header);
        var columns = (heading == null ? Enumerable.Empty<SourceBook.Cell>() : heading.Cells)
            .Where(c => !String.IsNullOrWhiteSpace(c.Value)).OrderBy(c => c.Column).ToArray();
        var names = columns.Select(c => c.Value.Trim()).ToArray();
        var positions = new Dictionary<int,int>();
        for (int i = 0; i < columns.Length; ++i) positions[columns[i].Column] = i;
        string error = "";
        var duplicate = names.GroupBy(n => n).FirstOrDefault(g => g.Count() > 1);
        if (columns.Length == 0) error = "第 " + header + " 行没有列名。";
        else if (duplicate != null) error = "第 " + header + " 行有重复列名「" + duplicate.Key + "」。";
        else if (columns.Any(c => c.Type == "previewError")) error = "表头含有缺少缓存值的公式，请重新计算并保存来源工作簿。";
        var samples = new List<object>();
        foreach (var row in Rows.Where(r => r.Number >= first && r.Number <= end).Take(3)) {
            var values = new string[names.Length];
            foreach (var cell in row.Cells) {
                if (cell.Type == "previewError" && error.Length == 0)
                    error = "第 " + row.Number + " 行缺少公式缓存，请重新计算并保存来源工作簿。";
                int index;
                if (positions.TryGetValue(cell.Column, out index)) values[index] = book.Display(cell);
                else if (error.Length == 0) error = "第 " + row.Number + " 行第 " + (cell.Column + 1) + " 列有数据，表头缺少列名。";
            }
            samples.Add(new {number=row.Number, values});
        }
        return new {tab.name, tab.hidden, preview=new {header, first, end, columns=names, rows=samples, error}};
    }
}
