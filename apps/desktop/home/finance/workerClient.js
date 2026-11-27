import FinanceWorker from "./financeWorker.mjs?worker&inline";

export function createFinanceWorker() {
  let worker, sequence = 0;
  const pending = new Map();
  function close(message = "工作线程已关闭。") {
    worker?.terminate();
    worker = undefined;
    for (const p of pending.values()) p.reject(Error(message));
    pending.clear();
  }
  function request(action, parameters = {}, transfer = []) {
    if (!worker) {
      worker = new FinanceWorker();
      worker.onmessage = ({data}) => {
        const p = pending.get(data.id);
        if (!p) return;
        pending.delete(data.id);
        if (data.error) p.reject(Error(data.error));
        else p.resolve(data.value);
      };
      worker.onerror = event => close(event.message || "工作线程异常退出，请重新添加工作簿。");
    }
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      try { worker.postMessage({action, ...parameters, id}, transfer); }
      catch (e) { pending.delete(id); reject(e); }
    });
  }
  return { request, close };
}
