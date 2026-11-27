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

sealed class ResultBook : IDisposable
{
    const string ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const string office = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    static readonly XNamespace m = ns;
    static readonly CultureInfo invariant = CultureInfo.InvariantCulture;
    static readonly Regex decorations = new Regex(@"""[^""]*""|\\.|_.|\*.|\[[^\]]*\]");
    readonly ZipArchive zip;
    readonly XmlWriter xml;
    readonly string path;
    readonly string sheetName;
    bool finished;
    readonly Dictionary<int, int> styleByFormat = new Dictionary<int, int> { {0, 0} };
    readonly Dictionary<string, int> custom = new Dictionary<string, int>();
    readonly List<bool> calendar = new List<bool>();
    XElement styleSheet, xfs, numFmts, theme;
    int nextFormat;
    string[] letters;
    internal int Count { get; private set; }

    internal ResultBook(string path, string sheetName = "合并结果")
    {
        this.path = path;
        this.sheetName = sheetName;
        zip = new ZipArchive(File.Open(path, FileMode.CreateNew, FileAccess.Write, FileShare.None), ZipArchiveMode.Create);
        xml = Writer("xl/worksheets/sheet1.xml");
        xml.WriteStartElement("worksheet", ns);
        SetStyleSheet(DefaultStyles());
    }
    static XElement Xf(int format, int font, int fill) {
        return new XElement(m+"xf", A("numFmtId",format), A("fontId",font), A("fillId",fill), A("borderId",0), A("xfId",0));
    }
    static XElement DefaultStyles() {
        return new XElement(m+"styleSheet",
            new XElement(m+"fonts", A("count",2),
                new XElement(m+"font", new XElement(m+"sz",A("val",11)), new XElement(m+"name",A("val","Calibri"))),
                new XElement(m+"font", new XElement(m+"b"), new XElement(m+"color",A("rgb","FFFFFFFF")), new XElement(m+"sz",A("val",11)))),
            new XElement(m+"fills", A("count",3),
                new XElement(m+"fill",new XElement(m+"patternFill",A("patternType","none"))),
                new XElement(m+"fill",new XElement(m+"patternFill",A("patternType","gray125"))),
                new XElement(m+"fill",new XElement(m+"patternFill",A("patternType","solid"),new XElement(m+"fgColor",A("rgb","FF30557A"))))),
            new XElement(m+"borders",A("count",1),new XElement(m+"border")),
            new XElement(m+"cellStyleXfs",A("count",1),new XElement(m+"xf",A("numFmtId",0),A("fontId",0),A("fillId",0),A("borderId",0))),
            new XElement(m+"cellXfs",A("count",2),Xf(0,0,0),Xf(0,1,2)),
            new XElement(m+"cellStyles",A("count",1),new XElement(m+"cellStyle",A("name","Normal"),A("xfId",0),A("builtinId",0))));
    }
    void SetStyleSheet(XElement sheet) {
        styleSheet = sheet;
        xfs = sheet.Element(m+"cellXfs");
        numFmts = sheet.Element(m+"numFmts");
        if (numFmts == null) { numFmts = new XElement(m+"numFmts"); sheet.AddFirst(numFmts); }
        custom.Clear();
        var ids = new Dictionary<int,string>();
        foreach (var f in numFmts.Elements(m+"numFmt")) {
            int id = (int)f.Attribute("numFmtId");
            string code = (string)f.Attribute("formatCode");
            ids[id] = code; custom[code] = id;
        }
        nextFormat = Math.Max(164, ids.Keys.DefaultIfEmpty(0).Max() + 1);
        calendar.Clear();
        foreach (var xf in xfs.Elements(m+"xf")) {
            int id = (int?)xf.Attribute("numFmtId") ?? 0;
            string code; ids.TryGetValue(id,out code);
            calendar.Add(IsCalendar(id,code));
        }
    }
    internal void UseHeaderTemplate(SourceBook source) {
        if (source.StyleSheet == null) return;
        var sheet = new XElement(source.StyleSheet);
        var sourceNs = sheet.Name.Namespace;
        if (sourceNs != m)
            foreach (var e in sheet.DescendantsAndSelf().Where(e => e.Name.Namespace == sourceNs))
                e.Name = m + e.Name.LocalName;
        if (sheet.Element(m+"cellXfs") == null) return;
        SetStyleSheet(sheet);
        theme = source.Theme;
    }
    XmlWriter Writer(string name)
    {
        var stream = zip.CreateEntry(name, CompressionLevel.Fastest).Open();
        return XmlWriter.Create(new BufferedStream(stream, 131072), new XmlWriterSettings {
            Encoding = new UTF8Encoding(false), CloseOutput = true, NewLineHandling = NewLineHandling.Entitize });
    }
    public void Dispose()
    {
        try {
            try { xml.Dispose(); } finally { zip.Dispose(); }
        } catch { finished = false; throw; }
        finally { if (!finished) File.Delete(path); }
    }

    internal int Style(int id, string code)
    {
        if (code != null) {
            if (!custom.TryGetValue(code, out id)) {
                id = nextFormat++; custom.Add(code,id);
                numFmts.Add(new XElement(m+"numFmt", A("numFmtId",id), A("formatCode",code)));
            }
        } else if (id >= 164) throw new InvalidDataException("来源工作表缺少数字格式定义 " + id);
        int index;
        if (styleByFormat.TryGetValue(id, out index)) return index;
        index = calendar.Count; calendar.Add(IsCalendar(id, code)); styleByFormat.Add(id, index);
        var xf = Xf(id,0,0); xf.SetAttributeValue("applyNumberFormat",1); xfs.Add(xf);
        return index;
    }
    internal static bool IsCalendar(int id, string code)
    {
        if (code == null) return (id >= 14 && id <= 17) || id == 22 || (id >= 27 && id <= 31) ||
            (id >= 34 && id <= 36) || (id >= 50 && id <= 58 && id != 55 && id != 56);
        var tokens = decorations.Replace(code, "").ToLowerInvariant();
        return tokens.Contains("y") || tokens.Contains("d") ||
            (tokens.Contains("m") && !tokens.Contains("h") && !tokens.Contains("s") && !code.Contains("["));
    }
    static string Letter(int i)
    {
        string s = "";
        for (i++; i > 0; i = (i - 1) / 26) s = (char)('A' + (i - 1) % 26) + s;
        return s;
    }
    void Text(string value)
    {
        xml.WriteStartElement("is", ns);
        xml.WriteStartElement("t", ns);
        if (value.Length != 0 && (char.IsWhiteSpace(value[0]) || char.IsWhiteSpace(value[value.Length - 1])))
            xml.WriteAttributeString("xml", "space", null, "preserve");
        xml.WriteString(value); xml.WriteEndElement(); xml.WriteEndElement();
    }
    internal void Header(string[] names, int[] styles = null, string height = null)
    {
        letters = Enumerable.Range(0, names.Length).Select(Letter).ToArray();
        xml.WriteStartElement("cols", ns);
        for (int i = 0; i < names.Length; ++i) {
            string col = (i + 1).ToString(invariant);
            xml.WriteStartElement("col", ns);
            xml.WriteAttributeString("min", col); xml.WriteAttributeString("max", col);
            xml.WriteAttributeString("width", Math.Min(50, Math.Max(16, names[i].Length * 2 + 4)).ToString(invariant));
            xml.WriteAttributeString("customWidth", "1"); xml.WriteEndElement();
        }
        xml.WriteEndElement();
        xml.WriteStartElement("sheetData", ns);
        xml.WriteStartElement("row", ns); xml.WriteAttributeString("r", "1");
        if (height != null) { xml.WriteAttributeString("ht",height); xml.WriteAttributeString("customHeight","1"); }
        for (int i = 0; i < names.Length; ++i) {
            xml.WriteStartElement("c", ns); xml.WriteAttributeString("r", letters[i] + "1");
            int style = styles == null ? 1 : styles[i];
            if (style != 0) xml.WriteAttributeString("s",style.ToString(invariant));
            xml.WriteAttributeString("t", "inlineStr"); Text(names[i]); xml.WriteEndElement();
        }
        xml.WriteEndElement();
    }
    internal void Append(SourceBook.Cell[] cells, int[] styles, bool date1904)
    {
        if (++Count > 1048575) throw new InvalidDataException("超过单张工作表最多 1,048,575 行明细的容量。请减少所选范围。");
        string row = (Count + 1).ToString(invariant);
        xml.WriteStartElement("row", ns); xml.WriteAttributeString("r", row);
        for (int i = 0; i < cells.Length; ++i) {
            var cell = cells[i];
            if (cell.Value == null) continue;
            int style = styles[cell.Style];
            xml.WriteStartElement("c", ns);
            xml.WriteAttributeString("r", letters[i] + row);
            if (style != 0) xml.WriteAttributeString("s", style.ToString(invariant));
            if (cell.Type != "n") xml.WriteAttributeString("t", cell.Type);
            if (cell.Type == "inlineStr") Text(cell.Value);
            else {
                string value = cell.Value;
                if (date1904 && cell.Type == "n" && calendar[style])
                    value = (decimal.Parse(value, NumberStyles.Float, invariant) + 1462m).ToString(invariant);
                xml.WriteElementString("v", ns, value);
            }
            xml.WriteEndElement();
        }
        xml.WriteEndElement();
    }
    void Part(string path, XElement data) { using (var writer = Writer(path)) data.WriteTo(writer); }
    static XAttribute A(string name, object value) { return new XAttribute(name, value); }
    internal void Finish()
    {
        xml.WriteEndElement();
        xml.WriteStartElement("autoFilter", ns); xml.WriteAttributeString("ref", "A1:" + letters.Last() + (Count + 1)); xml.WriteEndElement();
        xml.WriteEndElement(); xml.Close();
        XNamespace m = ns, rel = "http://schemas.openxmlformats.org/package/2006/relationships";
        XNamespace ct = "http://schemas.openxmlformats.org/package/2006/content-types", docRel = office;
        Part("[Content_Types].xml", new XElement(ct+"Types",
            theme == null ? null : new XElement(ct+"Override", A("PartName","/xl/theme/theme1.xml"), A("ContentType","application/vnd.openxmlformats-officedocument.theme+xml")),
            new XElement(ct+"Default", A("Extension","rels"), A("ContentType","application/vnd.openxmlformats-package.relationships+xml")),
            new XElement(ct+"Default", A("Extension","xml"), A("ContentType","application/xml")),
            new XElement(ct+"Override", A("PartName","/xl/workbook.xml"), A("ContentType","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml")),
            new XElement(ct+"Override", A("PartName","/xl/worksheets/sheet1.xml"), A("ContentType","application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml")),
            new XElement(ct+"Override", A("PartName","/xl/styles.xml"), A("ContentType","application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"))));
        Part("_rels/.rels", new XElement(rel+"Relationships",
            new XElement(rel+"Relationship", A("Id","rId1"),A("Type",office+"/officeDocument"),A("Target","xl/workbook.xml"))));
        Part("xl/workbook.xml", new XElement(m+"workbook", new XAttribute(XNamespace.Xmlns+"r",office),
            new XElement(m+"sheets",new XElement(m+"sheet",A("name",sheetName),A("sheetId",1),new XAttribute(docRel+"id","rId1")))));
        Part("xl/_rels/workbook.xml.rels", new XElement(rel+"Relationships",
            theme == null ? null : new XElement(rel+"Relationship",A("Id","rId3"),A("Type",office+"/theme"),A("Target","theme/theme1.xml")),
            new XElement(rel+"Relationship",A("Id","rId1"),A("Type",office+"/worksheet"),A("Target","worksheets/sheet1.xml")),
            new XElement(rel+"Relationship",A("Id","rId2"),A("Type",office+"/styles"),A("Target","styles.xml"))));
        if (theme != null) Part("xl/theme/theme1.xml",theme);
        numFmts.SetAttributeValue("count",numFmts.Elements().Count());
        xfs.SetAttributeValue("count",calendar.Count);
        Part("xl/styles.xml",styleSheet);
        finished = true;
    }
}
