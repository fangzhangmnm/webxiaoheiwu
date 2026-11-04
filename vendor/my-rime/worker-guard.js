// worker-guard.js —— 本 app 写的薄垫片，不是上游文件（上游 = 旁边的 worker.js，一字没动）。created 2026-11-03 by Claude Opus 5.5（家族工单 D2）
//   为什么要它：上游 worker 每次上屏后把内存盘 /rime 同步进 IndexedDB（process → FS.syncfs(false)），输入法学到的词就这样落盘，再由 app 同步上云。
//   加密稿里学到的词不许落盘（家族规则书 §1 第 5 条：加密稿的一切副产品只存密文；Fable 11-03 裁定：只进内存层，本次会话能联想，关稿即忘）。上游没有这个开关，也没有不学词的运行时选项。
//   只多一条消息 setMemoryOnly(on)：开着时「写回 IndexedDB」变成空操作（读不受影响）；打开的那一下先把之前（明文稿）学到的落盘。丢内存层的那一步在 src/ime.ts（要关数据库，归主线程排队）。
//   其余消息原样交给上游。消息协议同上游：{ name, args } → { type: "success", result } / { type: "error", error: { message } }。
importScripts("./worker.js");
(function () {
  const upstream = self.onmessage;
  let memoryOnly = false;
  let realSync = null;
  function install() {
    if (realSync) return;
    const FS = self.Module.FS;
    realSync = FS.syncfs;
    FS.syncfs = function (populate, callback) {
      if (memoryOnly && populate === false) { callback(null); return; }
      return realSync.call(FS, populate, callback);
    };
  }
  self.onmessage = (event) => {
    if (event.data?.name !== "setMemoryOnly") return upstream.call(self, event);
    (async () => {
      const on = !!event.data.args?.[0];
      install();
      if (on && !memoryOnly) await new Promise((resolve, reject) => { realSync.call(self.Module.FS, false, (e) => { if (e) reject(e); else resolve(); }); });
      memoryOnly = on;
      self.postMessage({ type: "success", result: null });
    })().catch((e) => { self.postMessage({ type: "error", error: { message: String(e?.message ?? e) } }); });
  };
})();
