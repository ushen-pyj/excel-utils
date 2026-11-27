import { fieldsFor } from "./toolModes.mjs";

export function makeTemplate(source, mode, side) {
  const columns = source.view.columns;
  const byIndex = Object.fromEntries(columns.map(c => [c.index, c.name]));
  const fields = {};
  for (const [field, label] of fieldsFor(mode, side)) {
    if (!byIndex[source[field]]) throw Error("请先选择" + label + "。");
    fields[field] = byIndex[source[field]];
  }
  if (new Set(columns.map(c => c.name)).size !== columns.length) throw Error("来源有重名列，请先调整表头再保存列模板。");
  if (mode === "merge") fields.aliases = Object.fromEntries(columns.map(c => [c.name, source.aliases[c.index] ?? ""]));
  if (mode === "unpivot") {
    if (!source.spread?.length) throw Error("请先选择要展开的列。");
    fields.spread = source.spread.map(i => byIndex[i]);
    fields.fillDown = !!source.fillDown;
  }
  return fields;
}

export function applyTemplate(template, source, mode) {
  const columns = source.view.columns;
  const indexOf = name => {
    const matches = columns.filter(c => c.name === name);
    if (matches.length !== 1) throw Error("列模板中的「" + name + "」" +
      (matches.length ? "对应多个来源列" : "在当前表头中找不到") + "，请检查表头或重新配置。");
    return String(matches[0].index);
  };
  const patch = {};
  for (const [field, name] of Object.entries(template)) {
    if (field === "aliases" || field === "spread" || field === "fillDown") continue;
    patch[field] = indexOf(name);
  }
  if (mode === "merge") {
    patch.aliases = {...source.aliases};
    for (const [name, alias] of Object.entries(template.aliases)) patch.aliases[indexOf(name)] = alias;
  }
  if (mode === "unpivot") {
    patch.spread = template.spread.map(indexOf);
    patch.fillDown = template.fillDown;
  }
  return patch;
}
