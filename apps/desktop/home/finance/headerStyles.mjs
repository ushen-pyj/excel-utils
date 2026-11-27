import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { CFB } from "xlsx";

const parse = text => new DOMParser().parseFromString(text, "application/xml");
const encode = new TextEncoder(), decode = new TextDecoder();
const children = node => Array.from(node?.childNodes ?? []).filter(n => n.nodeType === 1);
const child = (node, name) => children(node).find(n => n.localName === name);
const xml = new XMLSerializer();
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const themeOrder = ["lt1","dk1","lt2","dk2","accent1","accent2","accent3","accent4","accent5","accent6","hlink","folHlink"];

// Styles and palette indexes belong to a workbook. Resolve the source palette
// before combining columns from workbooks that can define different themes.
export function sourceHeaderStyles(book) {
  function part(path) {
    const bytes = path && book.files[path.replace(/^\//, "")]?.content;
    return bytes && parse(decode.decode(bytes)).documentElement;
  }
  const root = part(book.Directory.style);
  const theme = part(book.Directory.themes[0]);
  const scheme = theme?.getElementsByTagNameNS("*", "clrScheme")[0];
  const palette = children(child(child(root, "colors"), "indexedColors"));
  const themeColors = themeOrder.map(name => {
    const color = children(child(scheme, name))[0];
    return color?.getAttribute(color.localName === "sysClr" ? "lastClr" : "val");
  });
  function colored(node) {
    if (!node) return null;
    const copy = node.cloneNode(true);
    for (const el of Array.from(copy.getElementsByTagName("*"))) {
      let rgb;
      if (el.hasAttribute("theme")) rgb = themeColors[Number(el.getAttribute("theme"))];
      if (el.hasAttribute("indexed")) rgb = palette[Number(el.getAttribute("indexed"))]?.getAttribute("rgb");
      if (!rgb) continue;
      el.removeAttribute("theme"); el.removeAttribute("indexed");
      el.setAttribute("rgb", rgb.length === 6 ? "FF" + rgb : rgb);
    }
    return copy;
  }
  const fonts = children(child(root, "fonts")), fills = children(child(root, "fills"));
  const borders = children(child(root, "borders")), bases = children(child(root, "cellStyleXfs"));
  const xfs = children(child(root, "cellXfs")), cache = new Map();
  return id => {
    if (cache.has(id)) return cache.get(id);
    const xf = xfs[id], base = bases[Number(xf?.getAttribute("xfId") || 0)];
    function component(name, items) {
      const key = name.toLowerCase() + "Id";
      const owner = xf?.hasAttribute(key) && xf.getAttribute("apply" + name) !== "0" ? xf : base;
      return colored(items[Number(owner?.getAttribute(key) || 0)]);
    }
    const style = {font:component("Font",fonts), fill:component("Fill",fills), border:component("Border",borders),
      alignment:(xf?.getAttribute("applyAlignment") !== "0" && child(xf,"alignment")) || child(base,"alignment")};
    cache.set(id,style);
    return style;
  };
}

const reportStyle = {
  font:parse('<font xmlns="' + ns + '"><b/><color rgb="FFFFFFFF"/><sz val="11"/></font>').documentElement,
  fill:parse('<fill xmlns="' + ns + '"><patternFill patternType="solid"><fgColor rgb="FF30557A"/></patternFill></fill>').documentElement,
};

// SheetJS CE writes number formats for the detail rows. Append visual styles
// to that stylesheet and change only the cell references in its generated header.
export function styleResult(bytes, headerStyles) {
  const zip = CFB.read(new Uint8Array(bytes), {type:"array"});
  const get = path => decode.decode(CFB.find(zip, "/" + path).content);
  const put = (path, value) => CFB.utils.cfb_add(zip, "/" + path, encode.encode(value));
  const stylesPath = "xl/styles.xml", sheetPath = "xl/worksheets/sheet1.xml";
  const doc = parse(get(stylesPath)), root = doc.documentElement;
  const tables = new Map();
  function register(name, node) {
    if (!node) return 0;
    let table = tables.get(name);
    if (!table) {
      const element = child(root,name), items = children(element);
      table = {element, count:items.length, ids:new Map(items.map((n,i) => [xml.serializeToString(n),i]))};
      tables.set(name,table);
    }
    const key = xml.serializeToString(node);
    if (!table.ids.has(key)) {
      table.ids.set(key,table.count++);
      table.element.appendChild(doc.importNode(node,true));
      table.element.setAttribute("count",String(table.count));
    }
    return table.ids.get(key);
  }
  const indexes = headerStyles.map(style => {
    const {font,fill,border,alignment} = style ?? reportStyle;
    const xf = doc.createElementNS(ns,"xf");
    for (const [name,part] of [["font",font],["fill",fill],["border",border]]) {
      xf.setAttribute(name+"Id",String(register(name+"s",part)));
      if (part) xf.setAttribute("apply"+name[0].toUpperCase()+name.slice(1),"1");
    }
    xf.setAttribute("numFmtId","0"); xf.setAttribute("xfId","0");
    if (alignment) { xf.setAttribute("applyAlignment","1"); xf.appendChild(doc.importNode(alignment,true)); }
    return register("cellXfs",xf);
  });
  const sheet = get(sheetPath), end = sheet.indexOf("</row>");
  let column = 0;
  const header = sheet.slice(0,end).replace(/<c\s[^>]*>/g, tag =>
    tag.slice(0,-1).replace(/ s="[^"]*"/,"") + ' s="' + indexes[column++] + '">');
  if (end < 0 || column !== indexes.length) throw Error("无法写入结果表头样式。");
  put(sheetPath, header + sheet.slice(end));
  put(stylesPath, xml.serializeToString(doc));
  return CFB.write(zip,{type:"base64",fileType:"zip",compression:true});
}
