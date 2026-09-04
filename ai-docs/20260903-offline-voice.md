# 离线语音听写（本机 ASR）——架构 SSoT

> as-of v0.1.1 / 2026-09-03 · created 2026-09-03 by Claude Fable 5.1
> 前史（可行性、主机实测、许可证、杯型数据）= [20260903-offline-asr-probe.md](20260903-offline-asr-probe.md)。
> 出处纪律：【拍板】= user 2026-09-03 原话决策。

## 0. 规则

- 【拍板】「现在验收的时候语音严格禁止外发」「系统的语音 sunset」→ 家规硬规则 #8：**语音/音频字节永不离开设备**。Web Speech / Groq / OpenAI 三后端删除（不是隐藏）。
- 【拍板】「以后需要外接服务需要开白名单进黄线区」→ 家规「黄线区」+ 本仓 `CLAUDE.md` 黄线区表；`test/redline-guard.test.mjs` 机械执法（系统识别 API / 云语音域名 / 白名单外的非相对 fetch / WebSocket / XHR / sendBeacon 全红）。
- 【拍板】杯型：理智杯 SenseVoice 为主，极限小杯 zh-14M 做 interesting option；Quest 未测先做进产品。
- 加密稿禁语音的门随之消失（全本机 = 加密稿也能听写）。

## 1. 形状

```
设置页 ──下载/导入/删除──▶ src/asr/engine.ts ──postMessage──▶ dist/asr-worker-<hash>.js (src/asr/worker.ts)
                                                              │ importScripts vendor/sherpa-onnx-wasm/{web.js, asr.js}
mic 钮 / Left Ctrl PTT ──▶ src/voice/local.ts ──Float32 16k──▶ │ Cache "pwa-models" ⇄ MEMFS(createDataFile canOwn) ⇄ ORT session
        ▲ 锚点插入 + zh-punct ◀── text ────────────────────────┘
```

- **worker 独占 wasm**（单线程 SIMD，无 pthreads → 不需要 COOP/COEP）；请求严格串行；主线程永远不冻。
- **信任根 = `src/asr/packs.generated.ts`**（模型仓 manifest 原样内嵌，`node tools/gen-asr-packs.mjs` 重生；`test/asr.test.mjs` 守不漂移）。分片从「模型源 URL / 用户自传文件」来都逐片对 `chunks[].sha256`（vendored 流式 SHA-256 `src/asr/sha256.ts`），对不上整包拒收；网址不写死（设置里可换镜像，device-kv `voiceModelSource`）。
- **缓存 = Cache Storage `pwa-models`**：家族共享名（同 origin 兄弟 SW 只清各自前缀，已核实），key = `/__pwa-models__/<slug>/chunk-NNN` 合成路径 + `verified.json` 标记（packId）；可续传（已有且尺寸对的分片跳过）；`pwa-shell.forceReset` 跳过它；设置页有专门删除钮。可再生派生缓存，user 2026-09-03 批。
- **挂载**：按文件预分配 buffer → 分片拷入 → `FS.createDataFile(canOwn=true)` 零拷贝 → 建识别器（SenseVoice=`OfflineRecognizer`；zh-14M=`createOnlineRecognizer`，喂完整段 + 0.5s 尾静音）→ unlink。语言（zh/en 按 IME 状态）SenseVoice 经 `setConfig` 热切。
- **会话** `LocalSession`：start 立刻 getUserMedia（PTT 前 250ms 也要）并**并行**让 worker load（首次 1–10 s）；采集 = AudioContext(16k) + ScriptProcessor；RMS VAD 有声后 1 s 静音自停，上限 60 s；stop → 重采样 16k → decode → 全角标点 → 锚点插入；cancelled 旗处理 PTT 短按竞态。状态行：录音中 / 加载识别模型… / 识别中 / 语音包未下载（设置 → 语音输入）。

## 2. 设置页（语音输入）+ 默认开

**默认开、无开关**（user 2026-09-03「无须 consent 默认开」；v0.1.8）：consent = 下载语音包那一下点击。话筒常驻（稿可编辑即显示）；没包点话筒 → sheet「下载语音识别模型？（名字 · 体积）」→ 就地下载、进度走状态栏；没包按 Ctrl → 状态栏一句提示，**绝不碰 getUserMedia**（`LocalSession.start` 先查 `asr.isKnownReady`，首次一次缓存查询）。有包第一次真用才弹麦克风权限。设置页：识别模型下拉（synced `voiceProvider`：`local-sensevoice`｜`local-zh14m`；旧值落默认）→ 语音包状态行（未下载/部分/已就绪）+ 进度条 + 下载 / 从文件导入（整个 `.bin` 或全部 `chunk-NNN`）/ 删除（in-app 确认 sheet）→ 模型源 URL（per-device）→ 署名行（`voice.attr.*`：SenseVoiceSmall 阿里巴巴通义实验室 FunASR 模型协议 v1.1 / zh-14M k2-fsa Apache-2.0；运行时 sherpa-onnx Apache-2.0）。

## 3. 构建 / 验证

- `scripts/build.sh`：第二入口 `src/asr/worker.ts` → `dist/asr-worker-<hash>.js`（iife），URL 注入 `index.html <meta name="asr-worker">`；SW 安装期把它一起预缓存（模型包不预缓存）。
- `npm test`（40）：SHA-256 向量 / manifest 不漂移 / 旧 provider 值映射 / 黄线区守卫。
- `npm run e2e:asr`：headless 起服（仓库根 + `/models/` 挂模型仓）→ 设置页真点「下载语音包」→ 已就绪 → worker 解码 zh.wav → 删除归零。两档全过（桌面：SenseVoice 下载+校验 6.6 s、建器 2.3 s、wasm 331 MB、RTF 0.28）。
- `npm run probe:asr` / 线上 `/dev/probe/asr/`：跑分探针（Quest 真机数仍待 user）。

## 4. 已知边 / 后续

- Quest 真机未测（内存/RTF）；iOS ScriptProcessor 与 AudioContext(16k) 待验。
- zh-14M 走批式（未做边说边出字的流式部分结果）；无标点。
- wasm 15 MB 含 TTS 等全家桶，生产前裁（关 `SHERPA_ONNX_ENABLE_TTS` 等重编）。
- OneDrive dump/load 通道（【拍板】「不是正路但提供」）未做：形状 = `.models/<slug>/chunk-NNN` 走 store `openStream` 读→同一 verifier；等要跨设备省流量时再开。
- HF 镜像未建（需 user 自己的 HF 账号）；模型仓可另发 `<slug>.bin`（分片拼接）到 GitHub Release 供人类下载后「从文件导入」。
- 旧 synced 偏好里的 `voiceGroqKey`/`voiceOpenaiKey`/`voiceVocab` 是遗留死键（不读不删）；v1 `voice.json` 不再导入。
