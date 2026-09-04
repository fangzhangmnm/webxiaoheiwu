# 审计第一轮台账（2026-09-03，user「感觉现在 app bug 好多，派 subagent 彻查」）

> as-of v0.1.7 / 2026-09-03 · created 2026-09-03 by Claude Fable 5.1
> 两个只读审计 subagent（逻辑/状态机 28 条 + UI/DOM/CSS/i18n 34 条）→ 本轮修了 44 条（v0.1.7），其余标注状态。编号 L=逻辑审计，U=UI 审计。

## 已修（v0.1.7）

| # | 问题 | 修法 |
|---|---|---|
| L1 | 自动推云/改名裹全屏 busy | store **0.11.4** `busy(label, fn, key)` 透传 key（user 2026-09-03「改库」）；`store-ui.ts` 按 key 把 `sync.pushing`/`file.renaming` 静默执行 |
| L2 | 离线每 15s 红横幅循环 | `pushNow` 离线只落本地不推；失败指数退避封顶 5 min；只第一次亮横幅 |
| L3 | persist 无 gen 守卫、双建稿/绑错稿 | persist 串行（`persistInFlight`）+ 每个 await 后比 `loadGen`；`flushLocal` 等 in-flight |
| L4 | SW 重启 `CACHE_NAME` 回落 boot | fetch 时从 `caches.keys()` 找回 `xiaoheiwu-<hash>`（**WeebPaint 同款坑，家族级，未修**） |
| L5 | SW 把 /pwa-models/ 分片复制进壳缓存 | fetch handler 只接管 `SCOPE_PATH` 前缀 |
| L6 | 新设备首设密码 LWW 盖掉云端 verifier | `ensureUnlocked` 首设前 `reconcileCollections()`；失败/离线拒绝 |
| L7 | 改名与打字竞争 | `renameInFlight` 期间 persist 挂起，改名完补落盘 |
| L8/M | 预定加密物化失败仍推明文 | `encryptPending`：保持加密态、不推云、状态栏常驻、下次 persist 重试 |
| L9/U30 | boot 死等 1.5s 开空新稿 | `drawer.firstFrame()`（最多 3s） |
| L10 | 冷启动 open 就写云端 lastActive | `booted` 旗后才记 |
| L11 | RIME 词库自回灌 | push 前先记 `dictRestoredSavedAt` |
| L12/U12 | 语音 cancelled 旗被下一次 start 重置；error 永不回 idle；权限框未回就松键；Ctrl 和弦报权限错 | 会话代 `gen`、`_fail` 报完回 idle、`stopRequested`、cancelled 不报 |
| L13 | 转写落进切走后的稿 | `onBeforeLoad` 中止语音会话；`noteExternalEdit` 看 `canEdit` |
| L15/U8 | 冷启动/锁定/重置后自动弹密码框 | `open(name,{promptUnlock})` 只在抽屉点开/锁图标手势 |
| L16 | 纯云端加密稿首开报「不可用」 | `readDoc` open 返 null 后再判 `isEncrypted` |
| L17 | 回收当前稿后 last-open 仍指它 | `clear()` 清 last-open |
| L18 | 改名结果旗标全丢 | `renameDoc` 返 `oldKept/cloudDeferred`，状态栏告知 |
| L19 | 同 slug 重打包旧分片免验 | packId 变了先清分片 |
| L20 | 出厂重置 RIME worker 活着必 blocked；离线清壳白屏 | `ime.dispose()`；离线拒绝 |
| L25 | ASR worker 崩不 terminate；进度 1.5 万条 | terminate；≥1 MiB 报一次 |
| L27 | 预缓存 .map | 去掉 |
| U1 | 话筒/设置图标是虚线占位 | `inline-sprites.py` 让位正则识别 `data-missing`，占位被 stopgap 顶掉；assets 测试同步 |
| U2 | `cryptoToggle/lockToggle` hidden 被 CSS 覆盖 | `[hidden]{display:none!important}` |
| U3 | `pushNow` 不查 `canEdit`（other-password 态空容器覆盖） | `pushNow`/`persist` 都守 |
| U4 | 回收当前稿后可打字永不落盘 | `clear()` = 空新稿（有 pendingDate） |
| U5 | choice sheet 死「确定」钮 | `.crypto-button.hidden` |
| U6 | 抽屉开着状态被遮罩压住 | `setStatus` 镜像到抽屉底部 `#drawerStatus` |
| U7 | keyBanner 挤走 .page | absolute 定位 |
| U9 | 危险钮 hover 白字压淡粉 | 统一深红 hover |
| U10 | 首选候选永不高亮 | `.buffer-chip + .candidate-chip` |
| U11 | 长状态挤没标题 | `.status` 省略号 |
| U13 | 删语音包后报「已就绪」 | 文案按 job |
| U14 | CSS emoji 徽标 | 去掉（meta 行文字已说明） |
| U15 | boot 前可打字被 open 覆盖 | 初值 `unavailable:true` |
| U16 | 设置页 sheet 按 Esc 连抽屉一起关 | `defaultPrevented` 早退 |
| U17 | 删语音包钮字看不见 | `--danger` |
| U18 | 隐藏抽屉可 Tab 到 | `visibility:hidden` |
| U21 | IME 加载中连点起两个 worker | init promise 缓存 |
| U22 | 未登录 online 钉「正在同步」 | 登录后才 |
| U23 | 未登录状态先「未同步」再跳「本地草稿」 | 直接「本地草稿」 |
| U24 | Ctrl 和弦话筒闪一下 | PTT 250ms 门过了才画 |
| U26 | aria/title/`<title>` 无 i18n；「Natural Code」硬编码；`wc.words` zh 是英文 | 全走 SSoT |
| U31 | 切语言 reload 不 flush | flush 后 reload |
| U32 | 229 vs 228 MB | 统一 228 |
| U33 | reduced-motion 漏 recording | 补 |
| U34 | 别的设备改模型本机设置页不刷 | `prefs.onChange("voiceProvider")` |

## 挂起（低/需设计）

- L14 idle 解锁期间输入未门住（resume 完成前保持 shown）——要动 idle-gate 交互，单独做。
- L21 sync gate 单槽覆盖（两条 gate 同时出现）——库/sheets 协同设计。
- L22 切只读 200ms 内击键丢；L23 几处状态文案互盖；L24 `signInHandled` 不复位（redirect 登录现状无害）；L26 watchDocs 每次落盘重读整份字节；L27 其余（`notifyUpdate` 旗随 SW 重启失效、cacheFirst 命中也后台重拉词典——这是更新检测设计）；L28 pagehide 只 `void flushLocal()`。
- U19 只读/锁定态编辑区零视觉提示；U20 切稿不清候选串；U25 窄屏 toast/横幅压话筒；U27 死 CSS 规则；U28 空态贴底；U29 手机 .page 无水平 margin。

## 家族级 / escalate

- **L4 SW `CACHE_NAME` 重启回落**：WeebPaint `service-worker.js:30` 同款——建议同修（本仓已修，形状可抄）。
- **L1**：已改库（0.11.4 `busy` 带 key），小黑屋 v0.1.9 收货；WeebPaint 同步收货中。
