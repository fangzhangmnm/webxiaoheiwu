# ADR-0018 页面头上一条 CSP：脚本只准本站文件 + wasm
> created 20261017 · by Claude Opus 5.5 (claude-opus-5-5) · status: **accepted**（user 2026-10-17「csp是什么？甲一起上」——跟 ADR-0017 记住密码一起上）

## 决定
`index.html` 头上（第一个 `<script>` 之前）一条 `<meta http-equiv="Content-Security-Policy">`。GitHub Pages 不能配响应头，只能用 meta。

| 指令 | 值 | 为什么 |
|---|---|---|
| `script-src` | `'self' 'wasm-unsafe-eval'` | 承重的那条：注入的 `<script>` / 内联事件 / `eval` 都不跑。wasm（RIME、7z、语音）要 `wasm-unsafe-eval` |
| `connect-src` | `'self' https: blob: data:` | **故意放宽**：语音模型的镜像地址人能自己改（家规「用户可改成任何镜像」），OneDrive 的下载 / 上传主机也不固定。脚本跑不起来，这条放宽的代价就小 |
| `frame-src` | `'self' https://login.microsoftonline.com https://login.live.com` | MSAL 后台续登录用隐藏 iframe（个人账号会转到 login.live.com）。**真机未验**：要是后台续登录开始失败，先看黑匣子里有没有 `[csp] blocked frame-src` |
| `worker-src` | `'self' blob:` | 语音 / RIME worker 是本站文件；blob 留给库 |
| `img-src` / `media-src` / `font-src` | `'self' data: blob:` | 封面、导出、字体都是本站或 blob |
| `style-src` | `'self' 'unsafe-inline'` | 图标 sprite、模板里大量 `style=""`；CSS 注入的代价远小于脚本 |
| `object-src 'none'`、`base-uri 'self'`、`form-action 'self'`、`default-src 'self'`、`manifest-src 'self'` | | 常规收口 |

- 原来 index.html 里那段「bundle 加载前糊红条」的内联脚本搬成 `boot-fatal.js`（SW 预缓存）；它顺带在 bundle 接管前把「脚本被 CSP 拦下」糊成红条（白屏的一种）。
- 运行时被拦的东西进黑匣子（`[csp] blocked …`，app.ts）。
- 书库（`@internal/gallery`）原来要在运行时编译 Vue 模板（`new Function`）→ 被拦、书库打不开。修在库里：**gallery 0.8.4 构建时编好模板**，宿主递整个 Vue 模块就零 eval（`gallery-host.ts` 改成 `import * as Vue`）。这一步连带收了 store 0.18.6（gallery 0.8.3 起要 ≥ 0.18.5）。

## 守卫
`test/csp-guard.test.mjs`（策略逐条钉死、不许内联脚本 / 内联事件）；boot smoke 与 `e2e:remember` 里任何 `securitypolicyviolation` = 红。放宽任何一条 = 改这张表 + 说为什么。

## 否决
- `script-src 'unsafe-eval'`（让书库照旧运行时编译）：Vue 模板注入这类洞会重新打开；库里预编译是一次性的活。
- `connect-src` 收成白名单：用户自定义的镜像会被拦，违背反弃坑。
