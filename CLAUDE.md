# WebXiaoHeiWu 网页版小黑屋（家族总规则见上级 CLAUDE.md）

> rewritten 2026-09-03 by Claude Fable 5.1（v2 换代）。架构 SSoT = `ai-docs/20260903-v2-architecture.md`；决策 = `ai-docs/adr/`。

无干扰中文写作 PWA。**Meta Quest 是一等公民**（无中文 IME → vendored RIME 双拼 WASM），PC/iOS 次之。产品语言中文（i18n SSoT `src/i18n/strings.ts` 默认 zh，en 备）。已毕业级标准：logging 英文、用户文案全走 i18n、零系统对话框、共享 sprite 图标。

- **store**：`@internal/store` 0.11.3 + `@internal/encryption` 0.1.0（`vendor-pkgs/` tgz）。唯一接缝 `src/app-store.ts`（值级 import 只准这里；`src/encryption.ts` 是加密器官接缝）；`scripts/build.sh` 与 `test/redline-guard.test.mjs` 守着。缺接口 escalate 改库，绝不在 app 端绕。升级 = `bash "../20260813 internal-store/scripts/pull-package.sh" <ver>`。
- **数据**：身份 = `YYYYMMDD 标题.txt`（appfolder 根平铺，ADR-0001）；加密稿 = 库透明容器（云端 `….txt.zip`，ADR-0002）；冲突 = 库 sheet + .backup（ADR-0003）；v1 的 `.enc/` `.crypto/` `.userdata/` `voice.json` 只读遗留（ADR-0004）。IDB/localStorage：只经库 + `src/device-kv.ts`。
- **人类钉死的行为（别削弱）**：15s 防抖 + 30s 心跳推云；idle 2 分钟锁屏、解锁前必复查云端（「Quest 是核电池，可能开一年」）；never trust remote filenames；Shift 单击切中英、状态栏点击是 IME 唯一开关、Left Ctrl PTT（keydown 即起录，250ms 门）；加密永不自动弹框、错密码不碰任何文件、解密要红字警告、加密稿禁云端语音；IME/语音开关 per-device 不跟云；打开落在开头；状态文案不跳。
- **产品墙**：接近 sealed class。论文/LaTeX 是另一个产品；警惕滑坡成 pastebin。悬案不动：WebDAV/坚果云线、自托管 Whisper。
- **第三方派生缓存**：RIME worker 自持 IDB（词典缓存 + IDBFS /rime），可再生；user 追认待记。

## 发版 ritual（main → /dev/；prod 分支 → /，push prod 必问）

1. `./bump.sh v0.0.N-YYYY-MM-DD`（patch AI 例行；minor 需 user 说出版本号）。
2. `npm test`（34 条，秒级）→ `bash scripts/build.sh`（tsc 门 + 接缝 lint + sprite 对账 + 裸中文扫描 + esbuild content-hash → `dist/xiaoheiwu-<hash>.mjs`，自动改 index.html）→ `npm run smoke`（headless boot 13 项，借 WeebPaint 的 playwright）。
3. 重构/大功能：`bash scripts/gen-api.sh` 重打 `api/`。
4. `git add -A && git commit && git push origin main`。prod = `git push origin main:prod`（**先问人**）。

图标：`python3 "../20260708 SVG Icons/extract-icons.py" assets/icons.svg <ids…> --catalog` → `python3 tools/inline-sprites.py`。缺的先烤 stopgap（`tools/bake-stopgap-glyphs.py` SPECS）+ 登记图标库 `TODO.md`；现登记：`settings` `microphone`。
