# v2 架构（换代到 WeebPaint 毕业级标准）

> created 20260903 · by Claude Fable 5.1 · as-of v0.0.82 / 2026-09-03
> user 2026-09-03 拍板：「优先把 wxhw 做到 weebpaint 的毕业级别…东西都在 onedrive 里面，而且只有我用，所以可以打破旧数据结构，按照 weebpaint 的对齐。」

## 模块地图（依赖只准向下）

| 层 | 文件 | 职责 |
|---|---|---|
| 组合根 | `src/app.ts` | 接线与事件编排（无业务规则） |
| UI 控制器 | `src/editor.ts` `src/drawer.ts` `src/idle-gate.ts` `src/sheets.ts` | 编辑器（节律/只读/加密态）· 抽屉三视图 · 闲置锁屏 · in-app 模态原语 |
| 文档层 | `src/docs.ts` | store 之上「一篇稿」动词：列表订阅 / 读写 / 改名 / 回收站 / 加密切换 / 新鲜度 |
| 纯模型 | `src/doc-model.ts` `src/zh-punct.ts` | 文件名约定、排序、字数、编码、采纳验真；标点全角化 |
| 接缝 | `src/app-store.ts`（唯一 `@internal/store` 值级 import）· `src/store-ui.ts` · `src/encryption.ts`（唯一 `@internal/encryption` 值级 import）· `src/crypto-state.ts` | createStore 装配 + collections · StoreUI 回调束 · 加密器官 · 密码政策 |
| 平台 | `src/pwa-shell.ts` `src/device-kv.ts` `src/error-badge.ts` `src/i18n/` `src/load-script.ts` | SW 注册+4 路更新 · localStorage 唯一器官 · 错误汇拢 · 文案 SSoT · 惰性 UMD 注入 |
| 输入 | `src/ime.ts` `src/voice/local.ts` + `src/asr/{engine,worker,packs}.ts` | RIME 双拼 · 本机离线听写（sherpa-onnx WASM worker，硬规则 #8；详 20260903-offline-voice.md） |
| 遗留 | （无）| v1 `.enc/` `.crypto/` `.userdata/` `voice.json` 不读不删（adr/0004 superseded，2026-09-03 不做 backward compatibility） |

`scripts/build.sh` 守：tsc 门 · 接缝 lint（值级 import 只准两处；禁 deep import）· sprite 内联对账 · 裸中文扫描。`test/redline-guard.test.mjs` 守：接缝之外零裸 localStorage/IDB/MSAL/Graph。

## 数据类 → store 映射

| 数据类 | 归宿 | 备注 |
|---|---|---|
| 稿（Work） | `store.file("YYYYMMDD 标题.txt", {isZip:false})`，appfolder 根平铺 | 身份 = 路径/名（adr/0001）；与 v1 明文稿零迁移 |
| 加密稿 | 同名，库透明容器；云端 at-rest `….txt.zip` | adr/0002；`crypt.ext="txt"`、peek 空（verifyPassword 靠它） |
| 回收站 | 库 `.trash`（两端聚合）| v1 的 `.trash/*.txt` 直接可见 |
| 跨设备偏好 | collection `synced-user-preference`：readingMode / voiceProvider（`local-sensevoice`｜`local-zh14m`；旧值 webspeech/groq/openai 落默认）；`voiceGroqKey`/`voiceOpenaiKey`/`voiceVocab` 为遗留死键（不读不删） | v1 `voice.json` 不再搬（2026-09-03） |
| 跨设备 app 态 | collection `synced-app-state`：lastActive{name,savedAt,device} / passwordVerifier（`legacyImport.*` 为死键） | lastActive 只在冷启动尊重（Separated 指针模式） |
| RIME 用户词库 | collection `rime-user-dict` item `dump` | uat-LWW，可再生；2min 节流推、idle/unload flush |
| per-device | device-kv：imeEnabled / voiceEnabled / voiceModelSource（模型源镜像，默认空=官方源）/ lang / last-open / readonly-names | user 拍板 IME/语音开关不跟云 |
| 第三方派生缓存 | RIME worker 自持 IDB（词典下载缓存 + IDBFS /rime） | **需 user 追认**（家规 2026-08-15 逐案）；可再生 |

createStore 表态：`persistence:"app-managed"`（登录手势 / Ctrl+S 手势申请 persist）· `reconcilePolicy:"app-driven"`（focus/online/idle 复查 + 60s 前台轮询）· `autoCacheOpenedFile:true` · `offlineUploadReplay:"auto"` · `validateAdopt` = 文本可解码且非 HTML。

## 节律（editor.ts；v1 人类终形原样）

击键 → 200ms 本地落盘（`save(tryPush:false)`）→ 15s 防抖 / 30s 心跳推云（`save(tryPush:true)`）；标题改名 1.5s 防抖 `tryMove`；切后台 / idle 锁屏 / Ctrl+S 立即推；回前台 / 联网 / idle 解锁 → `pullIfClean`（只干净快进；dirty 留给推送的冲突 sheet）；`resolution:"takeCloud"` → 整体重载。

## v1 → v2 对照（打破的旧结构）

| v1 | v2 |
|---|---|
| IDB `WebXiaoHeiWu` 自研缓存，身份 = OneDrive itemId | 库 IDB `webxiaoheiwu.defaultStore`，身份 = 名；旧库不读不删（孤儿，几 MB） |
| sibling-copy 冲突（「不要 diff」） | 库 sheet 二选一 + 败方 .backup（仍不 diff，adr/0003） |
| `.enc/enc-*.bin` AES-GCM + `.crypto/salt.json` | 同名 `.txt.zip` 容器 + verifier 进 collection；旧件**不导入**（adr/0004 superseded 2026-09-03） |
| `CACHE_VERSION`/`APP_VERSION` 双写 | content-hash bundle + `src/version.ts` |
| 系统 `confirm()` ×5、emoji ×2 | in-app sheet；共享 sprite（缺 `settings`/`microphone` 已登记图标库 TODO，stopgap 烤字） |
| 裸中文 | i18n SSoT（zh 默认，en 备）；logging 英文 |
| `beforeunload` keepalive PUT | 取消（库无此面；靠 15s 节律 + 切后台推 + 本地已落盘下次补推） |

## 未做 / 待拍板

- 版本号：占位 `0.0.82`，提议开 `0.1.0` 纪元（需 user 说出口）。
- 加密稿标题可见（adr/0002 取舍）——要藏标题需改成「加密稿文件名只留日期+随机码、标题写在容器 meta」。
- WebDAV/坚果云线（v1 悬案不动）。自托管 Whisper 死案（2026-09-03 离线本机替代）。
- 多源（「另一朵云」folder provider）未接；WeebPaint 的 gallery-registry 未抽包前不做。
