// Drives the real rendered pages of the test instance started by verify.ps1.
import assert from "node:assert/strict";
import { resolve, dirname, basename } from "node:path";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const [phase, workbook, marker, runtime, previewPath] = process.argv.slice(2);
const folder = basename(dirname(workbook));
const appPath = resolve(runtime).replaceAll("\\", "/").toLowerCase() + "/";
const endpoint = "http://127.0.0.1:8080/json/list";

async function until(label, fn) {
  const deadline = Date.now() + 45000;
  let detail;
  do {
    try { const value = await fn(); if (value) return value; }
    catch (err) { detail = err.message; }
    await delay(200);
  } while (Date.now() < deadline);
  throw new Error(`${label} timed out${detail ? " (" + detail + ")" : ""}`);
}

async function connectPage(kind) {
  const page = await until(kind, async () => {
    const pages = await (await fetch(endpoint)).json();
    return pages.find(p => decodeURIComponent(p.url).toLowerCase().includes(appPath) &&
      (kind === "home" ? p.url.startsWith("onlyoffice:") : p.url.includes("/apps/api/documents/")));
  });
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let sequence = 0;
  const pending = new Map(), contexts = new Set();
  ws.onmessage = ({data}) => {
    const m = JSON.parse(data);
    if (m.method === "Runtime.executionContextCreated" && m.params.context.auxData?.isDefault)
      contexts.add(m.params.context.id);
    if (m.method === "Runtime.executionContextDestroyed") contexts.delete(m.params.executionContextId);
    if (m.method === "Runtime.executionContextsCleared") contexts.clear();
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  async function send(method, params = {}) {
    const id = ++sequence;
    const message = await new Promise(resolve => {
      pending.set(id, resolve); ws.send(JSON.stringify({id, method, params}));
    });
    if (message.error) throw new Error(message.error.message);
    return message.result;
  }
  async function evaluate(contextId, expression) {
    const reply = await send("Runtime.evaluate", {contextId, expression, returnByValue:true});
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    return reply.result.value;
  }
  await send("Runtime.enable");
  const context = await until(kind + " ready", async () => {
    for (const id of contexts) {
      if (await evaluate(id, kind === "home" ? "!!document.querySelector('nav a')" :
        "!!document.querySelector('#ws-canvas') && !!window.Asc?.editor?.asc_getCellInfo()?.asc_getText")) return id;
    }
  });
  return {evaluate: expr => evaluate(context, expr), send, close: () => ws.close()};
}

if (phase === "browse") {
  const home = await connectPage("home");
  await home.evaluate("document.querySelector('nav a[href$=\"/open\"]').click()");
  await until("open file picker", () => home.evaluate("(()=>{const button=document.querySelector('.open-page .file-drop-zone button'); if(button){button.click();return true;}})()"));
  home.close();
  process.exit(0);
}
if (phase === "pick-tool" || phase === "read-tool") {
  const home = await connectPage("home");
  const command = previewPath === "header" ? "header:pick" : "finance:pick";
  const reply = previewPath === "header" ? "header:result" : "finance:sources";
  if (phase === "pick-tool") {
    await home.evaluate(`(() => {
      window.toolTestReply = null;
      const onReply = (name, raw) => {
        if (name !== ${JSON.stringify(reply)}) return;
        window.AscDesktopEditor.remove("on_native_message", onReply);
        window.toolTestReply = JSON.parse(raw);
      };
      window.AscDesktopEditor.on("on_native_message", onReply);
      window.AscDesktopEditor.execCommand(${JSON.stringify(command)}, "{}");
    })()`);
  } else {
    const result = await until("tool read while editor is open", () => home.evaluate("window.toolTestReply"));
    assert.ok(!result.error, result.error);
    if (previewPath === "header") {
      assert.equal(result.type, "books");
      assert.equal(resolve(result.books[0].path), resolve(workbook));
      assert.ok(result.books[0].sheets.length);
    } else {
      const path = result.paths[0], saved = result.readPaths[path];
      assert.equal(resolve(path), resolve(workbook));
      assert.ok(saved && resolve(saved) !== resolve(workbook));
      const url = saved.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/");
      await home.evaluate(`window.AscDesktopEditor.loadLocalFile(${JSON.stringify(url)}, bytes => {
        window.toolTestBytes = bytes?.length ? Array.from(bytes) : [];
      })`);
      const bytes = await until("snapshot through CEF file resolver", () => home.evaluate("window.toolTestBytes"));
      assert.ok(bytes.length);
      const { read } = await import("../build/home/node_modules/xlsx/xlsx.mjs");
      const book = read(Uint8Array.from(bytes), {type:"array"});
      assert.equal(book.Sheets[book.SheetNames[0]].A1?.v ?? "", marker);
    }
    console.log("Verified open workbook as a source for", command);
  }
  home.close();
  process.exit(0);
}
if (["reopen", "preview-home", "preview-open"].includes(phase)) {
  const home = await connectPage("home");
  assert.deepEqual(await home.evaluate("[...document.querySelectorAll('nav a, nav button')].map(a => a.innerText.trim())"), ["主页","打开","工作区","工具"]);
  if (phase === "reopen") {
    await home.evaluate("document.querySelector('nav a[href$=\"/tools\"]').click()");
    const modes = await home.evaluate("[...document.querySelectorAll('.ft-mode')].map(b=>b.textContent)");
    for (const mode of modes) {
      await home.evaluate(`[...document.querySelectorAll('.ft-mode')].find(b=>b.textContent===${JSON.stringify(mode)}).click()`);
      await until(mode + " recent workbook folder", async () => {
        const folders = await home.evaluate(`(() => {
          const picker = [...document.querySelectorAll('.ft-source-picker select')].find(el=>el.getBoundingClientRect().width);
          return Array.from(picker?.options ?? [], option=>option.value).filter(Boolean);
        })()`);
        return folders.some(path => resolve(path).toLowerCase() === dirname(resolve(workbook)).toLowerCase());
      });
    }
  }
  await home.evaluate("document.querySelector('nav a').click()");
  const match = JSON.stringify(basename(workbook));
  await until("recent workbook", () => home.evaluate(`[...document.querySelectorAll('#box-recent .row')].some(e=>e.querySelector('.name')?.textContent===${match})`));
  assert.equal(await home.evaluate("document.querySelector('.home-page h1').innerText.trim()"), "最近使用的文件");
  assert.equal(await home.evaluate("document.body.classList.contains('theme-white')"), true);
  assert.equal(await home.evaluate("getComputedStyle(document.querySelector('#box-recent .file-list-head')).backgroundColor"), "rgb(255, 255, 255)");
  const columns = await home.evaluate(`(() => {
    const list = document.querySelector('#box-recent');
    const row = [...list.querySelectorAll('.row')].find(r => r.querySelector('.name')?.textContent === ${match});
    const measure = e => {
      const r = e.getBoundingClientRect();
      return {left:r.left, right:r.right, width:r.width, height:r.height, text:e.innerText.trim()};
    };
    const cells = el => ['.col-name','.col-location','.col-date'].map(selector => measure(el.querySelector(selector)));
    return {width:list.clientWidth, header:cells(list.querySelector('.file-list-head')), row:cells(row)};
  })()`);
  assert.ok(columns.width > 0, "recent list should be visible");
  if (columns.width >= 560) {
    for (const cells of [columns.header, columns.row]) {
      for (const cell of cells) assert.ok(cell.width > 0 && cell.height > 0 && cell.text, "all three columns must be visible and populated");
      assert.ok(cells[0].right <= cells[1].left && cells[1].right <= cells[2].left, "columns overlap");
    }
    console.log(`Verified three visible recent-file columns at ${columns.width} CSS px`);
  }
  async function capturePage() {
    const {data} = await home.send("Page.captureScreenshot", {format:"png"});
    await writeFile(previewPath, Buffer.from(data, "base64"));
    home.close();
  }
  if (phase === "preview-home") { await capturePage(); process.exit(0); }
  await home.evaluate("document.querySelector('nav a[href$=\"/open\"]').click()");
  await until("recent folder", () => home.evaluate(`[...document.querySelectorAll('#box-recent-folders .name')].some(e=>e.textContent===${JSON.stringify(folder)})`));
  assert.equal(await home.evaluate("document.querySelector('.open-page h1').innerText.trim()"), "最近使用的文件夹");
  assert.ok(await home.evaluate(`[...document.querySelectorAll('#box-recent-folders .row')].some(row => row.getBoundingClientRect().height > 0 &&
    row.querySelector('.name')?.innerText === ${JSON.stringify(folder)} && row.querySelector('.col-location')?.textContent.trim())`), "recent folder row must have a name and parent directory");
  if (phase === "preview-open") { await capturePage(); process.exit(0); }
  await home.evaluate("document.querySelector('nav a').click()");
  await until("click recent workbook", () => home.evaluate(`(()=>{const row=[...document.querySelectorAll('#box-recent .row')].find(e=>e.querySelector('.name')?.textContent===${match}); if(row){row.click();return true;} })()`));
  home.close();
}

const editor = await connectPage("editor");
const cell = "window.Asc.editor.asc_getCellInfo().asc_getText()";
async function key(name, code, modifiers = 0) {
  for (const type of ["keyDown", "keyUp"]) {
    await editor.send("Input.dispatchKeyEvent",{type,key:name,code:code===13?"Enter":code===36?"Home":"Key"+name.toUpperCase(),
      windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,modifiers});
  }
}
// Ctrl+Home also makes readback independent of the selection stored in the file.
await editor.send("Page.bringToFront");
await editor.evaluate("window.Asc.editor.asc_enableKeyEvents(true)");
await key("Home",36,2);
if (phase === "edit" || phase === "edit-on-close") {
  assert.notEqual(await editor.evaluate(cell), marker);
  // Type through ONLYOFFICE's formula bar and commit into the selected cell.
  await editor.evaluate("document.getElementById('ce-cell-content').focus()");
  await editor.send("Input.insertText",{text:marker});
  await key("Enter",13);
  await key("Home",36,2);
  await until("edited A1", async () => (await editor.evaluate(cell)) === marker);
  await until("unsaved change", () => editor.evaluate("window.Asc.editor.asc_isDocumentModified()"));
  if (phase === "edit-on-close") {
    console.log("Edited A1 and left the workbook modified for the native close prompt");
  } else {
    await editor.evaluate("document.getElementById('id-toolbar-btn-save').click()");
    await until("save completed", () => editor.evaluate("!window.Asc.editor.asc_isDocumentModified()"));
    console.log("Edited A1 in spreadsheet editor and invoked Save");
  }
} else if (phase === "reopen") {
  await until("reopened A1", async () => (await editor.evaluate(cell)) === marker);
  console.log("Verified navigation entries, recent folder, recent workbook and persisted A1");
} else throw new Error("Expected edit or reopen");
editor.close();
