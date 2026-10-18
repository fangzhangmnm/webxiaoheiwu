// CSP 守卫（2026-10-17，user「csp…一起上」）：index.html 头上的内容安全策略不许被悄悄放松，页面也不许长回内联脚本 / 内联事件。
// 运行时的另一半在 boot smoke + e2e-remember：任何 securitypolicyviolation 都算红（策略挡了真功能）。created 2026-10-17 by Claude Opus 5.5
import { readFileSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";

const html = readFileSync("index.html", "utf8");
const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
const policy = new Map((m?.[1] ?? "").split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v]; }));

describe("csp-guard", () => {
  it("index.html 有 CSP meta，且在第一个 <script> 之前", () => {
    assert(m, "no CSP meta");
    assert(html.indexOf(m[0]) < html.indexOf("<script"), "CSP meta must come before any script");
  });
  it("脚本只准本站 + wasm：没有 unsafe-inline / unsafe-eval / 通配 / 外站", () => {
    const s = policy.get("script-src") ?? [];
    eq(s.join(" "), "'self' 'wasm-unsafe-eval'");
  });
  it("object-src none、base-uri self、form-action self、default-src self", () => {
    eq((policy.get("object-src") ?? []).join(" "), "'none'");
    eq((policy.get("base-uri") ?? []).join(" "), "'self'");
    eq((policy.get("form-action") ?? []).join(" "), "'self'");
    eq((policy.get("default-src") ?? []).join(" "), "'self'");
  });
  it("iframe 只准本站 + 微软登录（MSAL 后台续登录）", () => {
    eq((policy.get("frame-src") ?? []).join(" "), "'self' https://login.microsoftonline.com https://login.live.com");
  });
  it("index.html 没有内联脚本、没有内联事件属性", () => {
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].map((x) => x[0]);
    eq(inline.length, 0, `inline <script>: ${inline.join(" ")}`);
    const handlers = html.match(/\s on[a-z]+\s*=\s*["']/gi) ?? [];
    eq(handlers.length, 0, `inline handlers: ${handlers.join(",")}`);
  });
});
