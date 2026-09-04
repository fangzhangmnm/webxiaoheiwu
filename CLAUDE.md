# WebXiaoHeiWu 网页版小黑屋（家族总规则见上级 CLAUDE.md）

> rewritten 2026-09-03 by Claude Fable 5.1（v2 换代）。架构 SSoT = `ai-docs/20260903-v2-architecture.md`；决策 = `ai-docs/adr/`。

无干扰中文写作 PWA。**Meta Quest 是一等公民**（无中文 IME → vendored RIME 双拼 WASM），PC/iOS 次之。产品语言中文（i18n SSoT `src/i18n/strings.ts` 默认 zh，en 备）。已毕业级标准：logging 英文、用户文案全走 i18n、零系统对话框、共享 sprite 图标。

- **store**：`@internal/store` 0.11.4 + `@internal/encryption` 0.1.0（`vendor-pkgs/` tgz）。唯一接缝 `src/app-store.ts`（值级 import 只准这里；`src/encryption.ts` 是加密器官接缝）；`scripts/build.sh` 与 `test/redline-guard.test.mjs` 守着。缺接口 escalate 改库，绝不在 app 端绕。升级 = `bash "../20260813 internal-store/scripts/pull-package.sh" <ver>`。
- **数据**：身份 = `YYYYMMDD 标题.txt`（appfolder 根平铺，ADR-0001）；加密稿 = 库透明容器（云端 `….txt.zip`，ADR-0002；每篇密码 ADR-0005）；冲突 = 库 sheet + .backup（ADR-0003）；v1 的 `.enc/` `.crypto/` `.userdata/` `voice.json` **不读不删**（ADR-0004 superseded：2026-09-03 user「不做 backward compatibility」）。IDB/localStorage：只经库 + `src/device-kv.ts`。
- **人类钉死的行为（别削弱）**：15s 防抖 + 30s 心跳推云；idle 2 分钟锁屏、解锁前必复查云端（「Quest 是核电池，可能开一年」）；never trust remote filenames；Shift 单击切中英、状态栏点击是 IME 唯一开关、Left Ctrl PTT（keydown 即起录，250ms 门）；加密永不自动弹框、错密码不碰任何文件、解密要红字警告；**加密在新建时就定好**（「新建加密稿」/ 空新稿切锁钮 = 预定，物化即封；2026-09-03 user）；**每篇可有自己的密码，保存永远用打开时那把，换钥匙只能显式**（ADR-0005）；密码无最少位数；**语音全本机（家规硬规则 #8，2026-09-03）：加密稿也能听写**；IME 开关 per-device 不跟云；**语音默认开、无开关，下载语音包那一下 = consent，没包绝不碰麦克风**（2026-09-03 user「无须 consent 默认开」）；打开落在开头；状态文案不跳。
- **产品墙**：接近 sealed class。论文/LaTeX 是另一个产品；警惕滑坡成 pastebin。悬案不动：WebDAV/坚果云线。自托管 Whisper 死案（2026-09-03，离线本机替代）。
- **第三方派生缓存**：见下「持久层白名单」表（RIME IDB 待追认；模型包 Cache `pwa-models` 2026-09-03 已批）。
- **离线语音（0.1 纪元，2026-09-03）**：`src/asr/`（worker 下载/校验/缓存/挂载/解码，主线程 `engine.ts` 门面；`packs.generated.ts` 内嵌模型仓 manifest = 信任根，`node tools/gen-asr-packs.mjs` 重生）+ `src/voice/local.ts`（麦克风→worker→锚点）；运行时 `vendor/sherpa-onnx-wasm/`（自编，README 记参数）。产品模型 = SenseVoice（主）+ zh-14M（实验）。验证：`npm run e2e:asr`（下载+解码整链）、`npm run probe:asr` / `/dev/probe/asr/`（跑分）。SSoT = `ai-docs/20260903-offline-voice.md`。

## 持久层白名单（user 2026-09-03「touch idb or local storage 必须显式白名单」；`test/storage-whitelist.test.mjs` 机械执法）

| 文件 | 持久层 | 用途 |
|---|---|---|
| `@internal/store`（vendor-pkgs tgz） | IDB `webxiaoheiwu.*` + localStorage 前缀键 + sessionStorage | 库本体（稿件/回收站/备份/collections/同步态）——app 只经 `src/app-store.ts` |
| `src/device-kv.ts` | localStorage（GUID 前缀） | device 层标量唯一器官：imeEnabled / voiceEnabled / voiceModelSource / lang / lastOpen |
| `service-worker.js` | Cache `xiaoheiwu-<hash>` | app 壳预缓存 + 运行时缓存 |
| `src/pwa-shell.ts` | Cache（读键/删） | forceReset 清壳缓存，跳过 `pwa-models` |
| `src/asr/worker.ts` | Cache `pwa-models`（家族共享名） | 语音模型包；可再生派生缓存（批） |
| `src/factory-reset.ts` | IDB 删库（RIME `ime` / `/rime`）+ 清全部 Cache + 注销 SW | 还原出厂设置（store 命名空间走库 `wipeAppNamespace` typed consent；前置无未同步稿）|
| `vendor/msal/msal-browser.min.js` | IDB / localStorage / sessionStorage | MSAL token 缓存，由库的 auth 配置驱动，app 不直接调 |
| `vendor/my-rime/worker.js` + `vendor/my-rime/dist/rime.js` | IDB（词典缓存 + IDBFS `/rime`；rime.js 是 emscripten 胶水） | RIME 第三方派生缓存，可再生；**user 追认待记** |

不在表里的任何文件碰 IDB / localStorage / sessionStorage / Cache / `navigator.storage` = 测试红。

## 黄线区（外接服务白名单，家规 2026-09-03）

| 服务 | 用途 | 约束 |
|---|---|---|
| OneDrive（`@internal/store`） | 稿件/偏好同步 | appfolder scope，personal only（硬规则 #6/#7） |
| 模型源（默认 `https://fangzhangmnm.github.io/pwa-models`，用户可改镜像） | 拉语音模型包分片 | 只读 GET；逐片 sha256 对 app 内嵌 manifest；唯一允许 fetch 非相对 URL 的文件 = `src/asr/worker.ts`（`test/redline-guard.test.mjs` 守） |

Web Speech / Groq / OpenAI 2026-09-03 sunset（语音字节永不外发）；旧 synced 偏好里的 `voiceGroqKey`/`voiceOpenaiKey` 不再读、不删（用户数据）。

## 发版 ritual（main → /dev/；prod 分支 → /，push prod 必问）

1. `./bump.sh v0.0.N-YYYY-MM-DD`（patch AI 例行；minor 需 user 说出版本号）。
2. `npm test`（34 条，秒级）→ `bash scripts/build.sh`（tsc 门 + 接缝 lint + sprite 对账 + 裸中文扫描 + esbuild content-hash → `dist/xiaoheiwu-<hash>.mjs`，自动改 index.html）→ `npm run smoke`（headless boot 13 项，借 WeebPaint 的 playwright）。
3. 重构/大功能：`bash scripts/gen-api.sh` 重打 `api/`。
4. `git add -A && git commit && git push origin main`。prod = `git push origin main:prod`（**先问人**）。

图标：`python3 "../20260708 SVG Icons/extract-icons.py" assets/icons.svg <ids…> --catalog` → `python3 tools/inline-sprites.py`。缺的先烤 stopgap（`tools/bake-stopgap-glyphs.py` SPECS）+ 登记图标库 `TODO.md`；现登记：`settings` `microphone`。
