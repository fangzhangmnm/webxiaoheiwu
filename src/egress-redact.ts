// egress-redact.ts —— 字离开 app 之前的最后一道关（黑匣子 / 报错横幅）。纯函数，不碰 DOM、不碰存储。
// created 2026-11-12 by Claude Opus 5.5（小黑屋维修线，统筹 Claude Fable 5.2 重审裁定二）
//   黑匣子是给人导出去发给别人的（设置页「复制 / 分享」），横幅会被截图。同步库 2.3.5 起保证自己的报错不带上游原文（第一层）；
//   这里是第二层：不管字从哪来（库、浏览器、MSAL、我们自己），写进黑匣子和横幅之前都过一遍。第二层靠样式匹配是可以的，配测试
//   （test/egress-redact.test.mjs）。规则：
//   ① 任何「协议://主机/后面…」只留到主机（userinfo 也去掉）——带签名的临时下载地址、分页地址、回调地址都在这一步断掉；
//   ② 已知的密钥参数抹掉值：tempauth / sig / signature / access_token / id_token / refresh_token / client_secret 出现在哪都抹；
//      code / token / key 这三个名字太常见，只在像查询串的位置（前面紧挨着 ? & # ;）抹——黑匣子里续签失败那行的「 code=<原因码>」
//      是闸门判「登录过期还是没回应」的唯一线索（库 auth.ts _logSilentFailure 的行格式），不能抹；
//   ③ Bearer 后面的串抹掉。

const URL_RE = /\b([a-z][a-z0-9+.-]*):\/\/([^\s/?#"'<>()\\]*)[^\s"'<>]*/gi;
const ALWAYS = "tempauth|sig|signature|access_token|id_token|refresh_token|client_secret";
const IN_QUERY = "code|token|key";
const ALWAYS_RE = new RegExp(`\\b(${ALWAYS})=[^&\\s"'<>;#]*`, "gi");
const QUERY_RE = new RegExp(`([?&#;])(${IN_QUERY})=[^&\\s"'<>;#]*`, "gi");
const BEARER_RE = /\bBearer\s+[^\s"'<>]+/gi;
const MASK = "[redacted]";

/** 字离开 app（黑匣子 / 横幅）之前过一遍。只删不加：结果永远不比原文长出地址或密钥。 */
export function redactForEgress(text: string): string {
  return String(text)
    .replace(URL_RE, (_m, scheme: string, authority: string) => `${scheme}://${authority.slice(authority.lastIndexOf("@") + 1)}`)
    .replace(ALWAYS_RE, (_m, name: string) => `${name}=${MASK}`)
    .replace(QUERY_RE, (_m, lead: string, name: string) => `${lead}${name}=${MASK}`)
    .replace(BEARER_RE, `Bearer ${MASK}`);
}

/** CSP 拦截记录用：被拦的东西只记来源（协议 + 主机）；不是地址的关键字（inline / eval / data / blob）照原样记那个词。 */
export function originOnly(uri: string): string {
  const s = String(uri ?? "");
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "ws:" || u.protocol === "wss:") return u.origin;
    return u.protocol.replace(/:$/, "");   // data: / blob: / chrome-extension: 之类：只留协议名
  } catch {
    return /^[a-z-]{1,20}$/i.test(s) ? s : "(unparsed)";
  }
}
