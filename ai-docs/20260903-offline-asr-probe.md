# 离线中文语音识别：可行性验证 + 权重分发骨架（0.1 纪元第一刀）

> as-of v0.1.0 / 2026-09-03 · created 2026-09-03 by Claude Fable 5.1
> 出处纪律：标【拍板】= user 本日原话决策；其余为 AI 设计 / 实测数据。

## 0. 结论一句话

网页/Quest 离线中文识别**可行**：sherpa-onnx WASM（SIMD、单线程、无 pthreads → 不需要 COOP/COEP，GitHub Pages 直接跑）+ 阿里系/k2 中文模型。桌面 headless 三档全通；**Quest 真机数还没有**（探针已上线，见 §5）。

## 1. 【拍板】台账（2026-09-03）

- 不用任何系统/机构的识别器（Chrome on-device Web Speech、Google/MS 云），**我们自己算**；自托管 Whisper 死（要开服务器）。story 精确版：声音不出设备；文字只去你自己的网盘；加密稿连网盘也只见密文。
- 权重走 **models 仓**（顺便给 weebpaint-genai 铺路）；**托管 = GitHub + Hugging Face**（官网现在只是 GH 跳转，无所谓）。
- 反弃坑：**网址不写死**；用户可自传；OneDrive 不是正路但给 dump/load 的 store 通道。
- 「最好就是一个 curl 协议（需要校验！防供应链攻击）」。
- 候选杯型：极限小杯（zh-14M）+ 理智推荐杯（SenseVoice-small）；「多几个试试都行」→ 加了 Dolphin-base。
- 0.1.0 纪元开版前 prod 已推 v0.0.82。

## 2. 分发骨架（已落地：`../20260903 PWA Models` = GitHub `fangzhangmnm/pwa-models`，Pages 主源）

- **信任根 = app 里钉的 `manifest.json` sha256（= pack id）；主机只是运输**。任何来源（Pages / HF 镜像 / 用户自传 / OneDrive）同一套校验。
- 包 = files 按序拼接 → **24 MiB 切片**（想当镜像的主机里最小上限：Cloudflare Pages 25 MiB；GitHub 50 MiB 警告线下）→ manifest（文件偏移表、逐片 sha256、整体 sha256、engineConfig、许可证快照 `LICENSE.txt`、出处）。打包器 `tools/pack.py`。
- 哈希用 **vendored 流式 SHA-256**（`probe/asr/sha256.js`，~80 行，边下边算 O(1) 内存），不用 `crypto.subtle.digest`（非流式，会把切片大小绑在内存上；user 2026-09-03 追问后改）。
- 主机实测（curl 带 Origin）：GitHub Pages `ACAO:*`+Range ✅；HF `resolve` CORS+Range ✅；ModelScope `ACAO:*` ✅；archive.org 无 CORS ❌；GitHub Release 302→S3 无 CORS ❌（只当人类下载渠道）；OneDrive 匿名链 ❌；Cloudflare R2 免费档要绑卡；Cloudflare Pages 单文件 25 MiB。
- 许可证核实：SenseVoiceSmall = FunASR 模型协议 v1.1（可再分发，须署名+保留模型名；维护者 issue #334 澄清商用允许）；Dolphin = Apache-2.0（code+weights 明写）；zh-14M HF 仓标 apache-2.0；**paraformer-zh-small 79MB 出处为社区账号 crazyant、许可证空 → 弃**；k2 multi-zh-hans / zh-2025 权重无 license 标签 → 未用。署名义务：产品设置/关于页要显示模型名与来源。

## 3. 运行时（vendored `vendor/sherpa-onnx-wasm/`，README 记构建参数）

sherpa-onnx v1.13.7 `wasm/web` 目标（`MODULARIZE` + `EXPORT_NAME=SherpaOnnx` + 导出 `FS`，**不烤模型进 .data**），emsdk 4.0.23，onnxruntime 1.27.1；本地把 `INITIAL_MEMORY` 512MB→64MB（按需长，暴露真实用量）。wasm 15 MB 含 TTS 等全家桶，**生产前裁**。构建现场 `~/jupyter/third-party/sherpa-onnx-wasm/`。

加载管线（`probe/asr/probe.js` = 生产原型）：fetch 分片流式读 → 边读边 SHA-256 边填按文件预分配的 buffer → `FS.createDataFile(canOwn=true)` 零拷贝挂 MEMFS → 建识别器 → `FS.unlink`。

## 4. 桌面 headless 实测（Chromium 149 headless，x86 单线程，`npm run probe:asr`）

| 模型 | 包 | wasm 堆峰值 | 渲染进程峰值 RSS | 建识别器 | 5.6s 音频 | RTF | zh.wav 文本（真值「开放时间早上九点至下午五点」） |
|---|---|---|---|---|---|---|---|
| zh-14M 流式（30 MB） | 30 | **77 MB** | 414 | 0.97 s | 0.68 s | 0.12 | 差放时间早上九点四下午五点（2 错，无标点） |
| Dolphin-base（99 MB） | 99 | **229 MB** | 589 | 0.81 s | 1.54 s | 0.28 | 开放放时间早上九点至下午五点。（1 叠字） |
| SenseVoice-small（228 MB） | 228 | **331 MB** | 755 | 1.79 s | 1.32 s | 0.24 | 开饭时间早上9点至下午5点。（1 错；标点 + 数字 ITN） |

线上路径（页 = webxiaoheiwu `/dev/probe/asr/`，模型 = pwa-models Pages）同样三档全通；SenseVoice 从 Pages 拉 228 MB ≈ 11 s（本机网络）。JS 流式 SHA-256 桌面 ≈ 80–100 MB/s。

## 5. Quest 真机（待跑，唯一未知）

`https://fangzhangmnm.github.io/webxiaoheiwu/dev/probe/asr/index.html` → 点一档 → 等就绪 → 点内置 wav → 🎤 录 5 秒 → 「复制全部日志」贴回。要的四个数：下载秒数、建识别器 ms、wasm 堆 MB、RTF；外加 tab 有没有崩、麦克风文本准不准。三档都点一遍最好（每换一档建议刷新页，wasm 堆不缩）。

## 6. 下一步（等 Quest 数再定杯型）

产品接入：settings「下载离线语音包」（per-device、SW Cache 独立前缀活过版本更新、按 pack id 键、可删）→ `src/voice/local.ts` 新 backend（形状 = WhisperSession：start/stop/abort，松键后一次插入；流式 zipformer 则套 SpeechSession 的 anchor 重写）→ `voiceProviderIsLocal()` 对 local 返 true（加密稿开语音）→ 三通道（curl / 自传 / OneDrive dump-load 走 store）→ 署名行。HF 镜像需 user 自己的 HF 账号上传。wasm 裁 TTS 重编。
