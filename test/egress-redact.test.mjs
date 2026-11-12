// 出口关（黑匣子 / 横幅写之前的最后一道）：src/egress-redact.ts。created 2026-11-12 by Claude Opus 5.5（统筹 Claude Fable 5.2 重审裁定二）
//   第二层，靠样式匹配；第一层 = 同步库 2.3.5 起自己的报错不带上游原文。这里拿统筹攻击脚本的 14 种写法拼出来的字去撞。
import { readFileSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";
import { redactForEgress, originOnly } from "../src/egress-redact.ts";

const HOST = "public.dm.files.1drv.com";
const S = { path: "SECRETPATH", auth: "SECRETAUTH", sig: "SECRETSIG" };
// 统筹 11-12 scrub-attack.ts 的 14 种写法（报错的字长什么样）；第三项 = 这一层挡不住路径（没有协议头）——靠第一层
const ATTACKS = [
  ["地址原样在字里", `Failed to fetch https://${HOST}/y4m${S.path}/a.txt?download=1&tempauth=${S.auth}&sig=${S.sig}`],
  ["路径里带括号", `Failed to fetch https://${HOST}/y4m/a%20(1).txt?download=1&tempauth=${S.auth}&sig=${S.sig}`],
  ["路径里带撇号", `Failed to fetch https://${HOST}/y4m/it's.txt?tempauth=${S.auth}&sig=${S.sig}`],
  ["地址包在括号里", `fetch failed (https://${HOST}/y4m${S.path}/a.txt?tempauth=${S.auth})`],
  ["地址包在双引号里", `fetch "https://${HOST}/y4m${S.path}/a.txt?tempauth=${S.auth}" failed`],
  ["查询串里带引号", `Failed to fetch https://${HOST}/y4m/a.txt?x="1"&tempauth=${S.auth}`],
  ["查询串里带尖括号", `Failed to fetch https://${HOST}/y4m/a.txt?x=<1>&tempauth=${S.auth}`],
  ["没有协议头", `Failed to fetch ${HOST}/y4m${S.path}/a.txt?tempauth=${S.auth}`, "path-survives"],
  ["大写协议头", `Failed to fetch HTTPS://${HOST}/y4m${S.path}/a.txt?tempauth=${S.auth}`],
  ["错误里再套一层（拼进一行）", `fetch failed ← connect ECONNREFUSED https://${HOST}/y4m${S.path}/a.txt?tempauth=${S.auth}`],
  ["错误对象上另挂的地址字段（被 JSON 带出来）", JSON.stringify({ message: "fetch failed", url: `https://${HOST}/y4m${S.path}/a.txt?tempauth=${S.auth}` })],
  ["抛的不是 Error", `boom https://${HOST}/y4m${S.path}/a.txt?tempauth=${S.auth}`],
  ["DOMException 的字", `[AbortError] The operation was aborted: https://${HOST}/y4m${S.path}/a.txt?tempauth=${S.auth}`],
  ["查询串前有换行", `Failed to fetch https://${HOST}/y4m/a.txt\n?download=1&tempauth=${S.auth}`],
];

describe("出口关 · 统筹的 14 种写法", () => {
  for (const [label, text, mode] of ATTACKS) {
    it(label, () => {
      const out = redactForEgress(text);
      assert(!out.includes(S.auth) && !out.includes(S.sig), `签名 / 授权值抹掉：${out}`);
      if (mode !== "path-survives") assert(!out.includes(S.path), `有协议头的路径截到主机：${out}`);
      else assert(out.includes(S.path), "没有协议头的路径这一层认不出（如实：靠第一层——库不把上游原文放进报错）");
      assert(out.includes(HOST) || out.includes(HOST.toUpperCase()) || !text.includes(HOST), "主机名留着（诊断要它）");
    });
  }
});

describe("出口关 · 规则", () => {
  it("地址只留到主机：路径、查询串、片段都去掉；userinfo 也去掉", () => {
    eq(redactForEgress("see https://graph.microsoft.com/v1.0/me/drive/items/X?$select=id#frag ok"), "see https://graph.microsoft.com ok");
    eq(redactForEgress("u=https://user:pass@example.com:8443/p?q=1"), "u=https://example.com:8443");
  });
  it("密钥参数：七个一看就是密钥的名字出现在哪都抹", () => {
    for (const k of ["tempauth", "sig", "signature", "access_token", "id_token", "refresh_token", "client_secret"]) {
      const out = redactForEgress(`x ${k}=VALUE123 y`);
      assert(!out.includes("VALUE123") && out.includes(`${k}=[redacted]`), `${k}：${out}`);
    }
  });
  it("code / token / key 只在像查询串的位置抹（前面紧挨着 ? & # ;）", () => {
    eq(redactForEgress("cb ?code=AUTHCODE&state=1"), "cb ?code=[redacted]&state=1");
    eq(redactForEgress("frag #token=T1;key=K1"), "frag #token=[redacted];key=[redacted]");
  });
  it("★ 续签失败那行的原因码原样留着（闸门判「登录过期 / 没回应」的唯一线索；库 auth.ts 的行格式）", () => {
    const line = "[auth] silent token renewal failed (retry-silent): name=InteractionRequiredAuthError code=interaction_required sub=consent_required msg=x";
    eq(redactForEgress(line), line);
    eq(redactForEgress("silent renew (boot): failed elapsed=812ms name=BrowserAuthError code=network_error sub="), "silent renew (boot): failed elapsed=812ms name=BrowserAuthError code=network_error sub=");
  });
  it("Bearer 后面的串抹掉", () => {
    eq(redactForEgress("Authorization: Bearer eyJhbGciOi.abc-def_123"), "Authorization: Bearer [redacted]");
  });
  it("没有地址、没有密钥的字一个不动（只删不加）", () => {
    const s = "conflict sheet \"日记/20261112 草稿.txt\" occasion=push contentFailing → cancel";
    eq(redactForEgress(s), s);
  });
});

describe("出口关 · CSP 只记来源", () => {
  it("网址只留协议 + 主机；关键字照原样；data / blob 只留协议名；认不出的不抄", () => {
    eq(originOnly(`https://${HOST}/y4m${S.path}/a.txt?tempauth=${S.auth}`), `https://${HOST}`);
    eq(originOnly("inline"), "inline");
    eq(originOnly("eval"), "eval");
    eq(originOnly("data:image/png;base64,AAAA"), "data");
    eq(originOnly("blob:https://write.weebpaint.com/1234-5678"), "blob");
    eq(originOnly("not a url ?tempauth=x"), "(unparsed)");
  });
});

describe("出口关 · 接线守卫", () => {
  const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  it("黑匣子写入口和导出都过 redactForEgress", () => {
    const d = src("src/diag-log.ts");
    assert(/m: redactForEgress\(String\(msg\)\)\.slice\(0, MAX_MSG\)/.test(d), "record() 写之前过一遍");
    assert(/\$\{redactForEgress\(e\.m\)\}/.test(d), "toText() 导出时每条再过一遍");
  });
  it("横幅 / 黑匣子 / 诊断环的字都从同一个过了关的 msg 来", () => {
    assert(/const msg = redactForEgress\(errToText\(err\)\);/.test(src("src/error-badge.ts")), "reportError 第一句");
  });
  it("CSP 那行只记来源，不再截地址前 120 个字", () => {
    const a = src("src/app.ts");
    assert(/originOnly\(String\(e\.blockedURI\)\)/.test(a), "用 originOnly");
    assert(!/blockedURI\)\.slice\(0, 120\)/.test(a), "旧写法没了");
  });
});
