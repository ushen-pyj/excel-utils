import { For, onMount, Show } from "solid-js";
import { command } from "../sdk/bridge";

export function SavedOutput(props) {
  let panel;
  const open = () => command("open:output", {path: props.path});
  onMount(() => panel.scrollIntoView({block:"nearest"}));
  return <div class="ft-saved ft-saved-output" ref={panel}>
    <div role="status">{props.children}
      <button type="button" class="ft-output-link" onClick={open} aria-label={"打开 " + props.path}>{props.path}</button>
    </div>
    <button type="button" class="ft-primary" onClick={open}>打开文件</button>
  </div>;
}

export function TaskProgress(props) {
  const determinate = () => Number.isFinite(props.value);
  const percent = () => Math.min(100, Math.max(0, props.value));
  return <div class="ft-progress">
    <div class="ft-progress-copy"><strong role="status"><span class="ft-motion-sheet" aria-hidden="true"><i/><i/></span>{props.label}</strong>
      <Show when={props.detail}><span>{props.detail}</span></Show>
    </div>
    <div class="ft-progress-track" role="progressbar" aria-label={props.label}
      aria-valuemin="0" aria-valuemax="100" aria-valuenow={determinate() ? percent() : undefined}>
      <i classList={{"ft-indeterminate": !determinate()}}
        style={determinate() ? {width: percent() + "%"} : undefined} />
    </div>
  </div>;
}

export function DataPreview(props) {
  return <div class="ft-table-wrap" role="region" tabindex="0" aria-label={props.label}>
    <table><thead><tr><For each={props.headers}>{h => <th scope="col">{h}</th>}</For></tr></thead>
      <tbody><For each={props.rows}>{row => <tr><For each={row}>{cell =>
        <td title={String(cell ?? "")}>{cell ?? ""}</td>
      }</For></tr>}</For></tbody>
    </table>
    <Show when={!props.rows?.length}><p class="ft-no-rows">{props.empty || "当前范围没有明细。"}</p></Show>
  </div>;
}

export function ResultChart(props) {
  const maximum = () => Math.max(0, ...props.chart.items.map(item => Math.abs(item.value))) || 1;
  return <figure class="ft-chart"><figcaption>{props.chart.title}</figcaption>
    <For each={props.chart.items}>{item => <div class="ft-chart-row">
      <span title={item.name}>{item.name}</span>
      <div class="ft-chart-track" aria-hidden="true"><i classList={{"ft-negative":item.value < 0}}
        style={{width: (Math.abs(item.value) / maximum() * 100) + "%"}}/></div><b>{item.text}</b>
    </div>}</For>
  </figure>;
}
