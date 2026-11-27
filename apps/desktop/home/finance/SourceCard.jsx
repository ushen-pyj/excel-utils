import { createMemo, createSignal, For, Show } from "solid-js";
import { fieldsFor } from "./toolModes.mjs";
import { applyTemplate, makeTemplate } from "./columnTemplates.mjs";
import { DataPreview } from "./ToolFeedback";

function Templates(props) {
  const key = () => "finance.columns.v1." + props.mode + (props.mode === "aging" ? "." + props.side : "");
  const [revision, touch] = createSignal(0);
  const templates = createMemo(() => {
    revision();
    try { return JSON.parse(localStorage.getItem(key()) || "{}"); } catch { return {}; }
  });
  const [name, setName] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  function act(save) {
    try {
      const label = name().trim();
      if (save) {
        const list = {...templates(), [label]: makeTemplate(props.source, props.mode, props.side)};
        localStorage.setItem(key(), JSON.stringify(list)); touch(r => r + 1);
      } else props.change(applyTemplate(templates()[label], props.source, props.mode));
      setFailed(false); setMessage(save ? "已保存列模板。" : "已按当前表头套用列模板。");
    } catch (e) { setFailed(true); setMessage(e.message); }
  }
  return <details class="ft-mapping"><summary>列模板</summary>
    <div class="ft-fields ft-template">
      <label>已保存的模板<select value="" onChange={e => {setName(e.currentTarget.value); setMessage("");}}>
        <option value="">选择模板</option><For each={Object.keys(templates())}>{k => <option value={k}>{k}</option>}</For>
      </select></label>
      <label>模板名称<input maxlength="60" value={name()} placeholder="例如：华东月结" onInput={e => {setName(e.currentTarget.value); setMessage("");}}/></label>
      <button type="button" disabled={!name().trim()} onClick={() => act(true)}>{Object.hasOwn(templates(),name().trim()) ? "更新模板" : "保存模板"}</button>
      <button type="button" disabled={!Object.hasOwn(templates(),name().trim())} onClick={() => act(false)}>套用模板</button>
    </div><Show when={message()}><p classList={{"ft-error":failed()}} role="status">{message()}</p></Show>
  </details>;
}

export default function SourceCard(props) {
  const s = () => props.source;
  const columns = () => s().view.columns;
  const fields = () => fieldsFor(props.mode, props.index);
  const side = () => ({compare:["左表","右表"], aging:["单据","核销"], variance:["预算","实际"]})[props.mode]?.[props.index];
  function setUnnamed(index, value) {
    const aliases = {...s().unnamedAliases};
    if (value === undefined) delete aliases[index];
    else aliases[index] = value;
    props.change({unnamedAliases:aliases});
  }
  function selectField(field, label) {
    return <label>{label}<select aria-label={label} value={s()[field]} onChange={e => props.change({[field]:e.currentTarget.value})}>
      <option value="">请选择列</option><For each={columns()}>{c =>
        <option value={c.index} selected={String(c.index) === s()[field]}>{c.letter} · {c.name}</option>
      }</For></select></label>;
  }
  return <article class="ft-source"><header>
    <strong title={s().path}><Show when={side()}><small class="ft-side">{side()}</small></Show>{s().name}
      <Show when={s().snapshot}><small class="ft-snapshot">已保存快照</small></Show></strong>
    <div class="ft-actions"><Show when={s().tabs.some(t => !props.used.includes(t.name))}>
      <button type="button" onClick={props.addSheet}>添加同簿工作表</button>
    </Show><button type="button" aria-label={"移除 " + s().name} onClick={props.remove}>移除</button></div>
  </header>
  <div class="ft-fields">
    <label>工作表<select value={s().sheet} onChange={e => props.changeTab(e.currentTarget.value)}>
      <For each={s().tabs}>{tab => <option value={tab.name} selected={tab.name === s().sheet}>{tab.name}</option>}</For>
    </select></label>
    <label>表头行<input type="number" min="1" max="1048576" value={s().header} onInput={e => {
      const header = e.currentTarget.value;
      props.range({header, first:Number(s().first) === Number(s().header)+1 ? Number(header)+1 : s().first}, true);
    }}/></label>
    <label>明细起行<input type="number" min={Number(s().header)+1} max="1048576" value={s().first}
      onInput={e => props.range({first:e.currentTarget.value})}/></label>
    <label>明细末行<input type="number" min={Number(s().first)} max="1048576" value={s().end}
      onInput={e => props.range({end:e.currentTarget.value})}/></label>
    <For each={fields()}>{([f, label]) => selectField(f, label)}</For>
  </div>
  <Show when={props.mode === "merge" && !s().loading && s().view.unnamed?.length}>
    <section class="ft-notice"><strong>以下列有明细，但缺少表头</strong>
      <For each={s().view.unnamed}>{c => <div class="ft-fields">
        <label>{c.letter} 列输出名称（{c.letter}{c.row}：{c.example || "公式"}）
          <input value={s().unnamedAliases?.[c.index] ?? ""} disabled={s().unnamedAliases?.[c.index] === ""}
            onInput={e => setUnnamed(c.index, e.currentTarget.value.trim() ? e.currentTarget.value : undefined)}/>
        </label>
        <label class="ft-check"><input type="checkbox" checked={s().unnamedAliases?.[c.index] === ""}
          onChange={e => setUnnamed(c.index, e.currentTarget.checked ? "" : undefined)}/>跳过 {c.letter} 列</label>
      </div>}</For>
    </section>
  </Show>
  <Show when={props.mode === "merge"}><details class="ft-mapping"><summary>设置输出列名</summary>
    <p>相同的输出列名会合并到一列。留空可跳过该列。</p>
    <div class="ft-aliases"><For each={columns()}>{c =>
      <label>{c.letter} · {c.name}<input type="text" list={"ft-names-" + s().id} value={s().aliases[c.index] ?? ""}
        onInput={e => props.change({aliases:{...s().aliases,[c.index]:e.currentTarget.value}})}/></label>
    }</For></div><datalist id={"ft-names-"+s().id}><For each={props.suggestions}>{name => <option value={name}/>}</For></datalist>
  </details></Show>
  <Show when={props.mode === "unpivot"}><div class="ft-spread"><strong>要展开的列</strong><div class="ft-checks">
    <For each={columns()}>{c => <label><input type="checkbox" checked={s().spread?.includes(String(c.index))}
      onChange={e => props.change({spread:e.currentTarget.checked ? [...s().spread,String(c.index)] : s().spread.filter(i => i !== String(c.index))})}/>{c.name}</label>}</For>
  </div><label><input type="checkbox" checked={s().fillDown || false}
    onChange={e => props.change({fillDown:e.currentTarget.checked})}/>用上一行补齐保留列中的空白（适用于合并单元格）</label></div></Show>
  <Show when={props.mode} keyed>{mode =>
    <Templates mode={mode} side={props.index} source={s()} change={props.change}/>
  }</Show>
  <details open class="ft-source-preview"><summary>表头与明细 <span>{columns().length} 列 · 最多显示 4 行</span></summary>
    <Show when={!s().loading} fallback={<p>正在读取所选范围…</p>}>
      <DataPreview headers={["行号", ...columns().map(c => c.name)]} rows={s().view.rows} label={s().name + " 来源明细"}/>
    </Show>
  </details>
  </article>;
}
