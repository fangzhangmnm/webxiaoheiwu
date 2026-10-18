// bundle 加载前的兜底：任何脚本错误糊一张红条（Quest 无 devtools）。bundle 就绪后 error-badge 接管 __xhw_showFatal。
// 2026-10-17 从 index.html 内联 <script> 搬成独立文件：CSP（index.html 的 meta）不放行内联脚本。created 2026-09-03 by Claude Fable 5.1，moved by Claude Opus 5.5
// classic script、同步加载（在 bundle 之前）；SW 预缓存（service-worker.js STATIC_PRECACHE）。
(function () {
  function show(text) {
    var bar = document.getElementById("errBanner");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "errBanner"; bar.className = "err-banner";
      bar.addEventListener("click", function () { bar.classList.add("hidden"); });
      (document.body || document.documentElement).appendChild(bar);
    }
    bar.classList.remove("hidden", "warning");
    bar.textContent = text + "  (点击关闭)";
  }
  window.__xhw_showFatal = show;
  window.addEventListener("error", function (e) {
    if (window.__xhw_showFatal !== show) return;
    var m = (e && e.message) || "脚本错误";
    var src = e && e.filename ? " (" + e.filename.split("/").pop() + ":" + e.lineno + ")" : "";
    show(m + src);
  });
  window.addEventListener("unhandledrejection", function (e) {
    if (window.__xhw_showFatal !== show) return;
    var r = e && e.reason; show((r && r.message) || String(r || "promise rejection"));
  });
  // CSP 拦了脚本（bundle 还没接管时）= 白屏的一种：糊红条说清楚，别让人对着空页。接管后由 app.ts 记黑匣子。
  document.addEventListener("securitypolicyviolation", function (e) {
    if (window.__xhw_showFatal !== show) return;
    if (!/^script-src/.test(e.effectiveDirective || "")) return;
    show("脚本被安全策略（CSP）拦下：" + (e.blockedURI || "inline"));
  });
})();
