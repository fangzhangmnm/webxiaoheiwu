# WebXiaoHeiWu 网页版小黑屋（家族总规则见上级 CLAUDE.md）

> rewritten 2026-09-03 by Claude Fable 5.1（v2 换代）。架构 SSoT = `ai-docs/20260903-v2-architecture.md`；决策 = `ai-docs/adr/`。

无干扰中文写作 PWA。**Meta Quest 是一等公民**（无中文 IME → vendored RIME 双拼 WASM），PC/iOS 次之。产品语言中文（i18n SSoT `src/i18n/strings.ts` 默认 zh，en 备）。已毕业级标准：logging 英文、用户文案全走 i18n、零系统对话框、共享 sprite 图标。

- **store**：`@internal/store` 0.13.0 + `@internal/encryption` 0.1.0 + `@internal/gallery` 0.2.1（`vendor-pkgs/` tgz；gallery 收货后把它的 `src/gallery.css` 拷到 `vendor/internal-css/`）。唯一接缝 `src/app-store.ts`（值级 import 只准这里；`src/encryption.ts` 是加密器官接缝）；`scripts/build.sh` 与 `test/redline-guard.test.mjs` 守着。缺接口 escalate 改库，绝不在 app 端绕。升级 = `bash "../20260813 internal-store/scripts/pull-package.sh" <ver>`。
- **2.0 书模式（2026-09-10，user 真机三轮打回后的形状；SSoT = `ai-docs/20260910-v2-ui-handoff.md` §4 末 + ADR-0008–0011 及其 09-10 修订）**：用户面名词 = **书**（zip）/ **页**（节点；graph.json 键 09-10 已吃书成 `pages`）。☰ 在顶栏最右 = 侧栏（默认关、纯浮层不推纸面、右侧；顶 = 书库/设置；工程内导航 = 当前页出边列表，行小字 = 修改时间，末尾「+」加页；回退/进页不自动收）；☰ 左边「+」= 加页；页名 = 纸面顶部章节名框（改了即改名）；新页/分裂都弹名字框（placeholder 提示下一章号，按语言生成，不预填）；新边加末尾；显示无 .txt；**删除模型 = 丢引用**（行菜单「移出」；成孤儿改名 `_废-`/`_dropped-`；只有孤儿能彻底删、弹框；书里无 .trash）；editor-state `{last, back}` 不标脏保存随手捞；**修改锁跟着作品**（graph.json `readOnly`，txt 无锁）；容器 = `pages/` + graph.json `pages`（09-10 吃书，旧 `contents/` 拒开）；加页名字框不提示章号，只有第一页有默认名。**z-index 只准出现在 `styles.css` 顶部 `:root` 的 `--z-*` band 表**（test 执法，抄 WeebPaint）。改 UI 后跑 `node tools/ui-audit.mjs` 再交。edited by Claude Fable 5.1 2026-09-10
- **2.1 图片页 + 封面（2026-09-10，user 两圈 grill；ADR-0012 / ADR-0013）**：`pages/*.jpg|png|webp|gif` 与 txt 同表，GIF 动图直通；进门单一漏斗 `src/image/`（魔数嗅探；长边 ≤2048 只剥 metadata、>2048 缩 + JPEG q85、「保留高清」勾 4096；EXIF 方向≠1 重编码；GIF >2 MB 二次确认；撞名 `名-hex4.ext`，txt 稿 / 书撞名同改 hex4）；解码边界 = `src/image/codec.ts`（app 唯一 canvas 点，重采样走 gallery 包、编码走 vendored jpeg-js / UPNG）；**封面 = `Thumbnails/thumbnail.png` 本身**（最后一个 entry、≤256²、≤70 KB，iTXt Description = 腰封；graph.json 无 cover 字段；「设为封面」/「替换图片」在图片页下方；加密书封面走 store `makePeek` 密文尾片）；书库缩略图 = gallery `policy.thumbs`（IDB `webxiaoheiwu-thumbs`）、tile 2:3 窄屏三列、角标「打开中」；侧栏「谁指向这里」入边段可「断开」（纯 unlink）；加页 sheet 副按钮「从图片…」（多选）；拖放 / 粘贴同漏斗；页脚字数统计（设置可关）；书库出 → 回来在书库（device-kv `last-scene`）。edited by Claude Fable 5.1 2026-09-10
- **v2 主干树 + links（2026-09-10 深夜，ADR-0014；v2.1.1 落地，SSoT = `ai-docs/20260910-v2-tree-schema-handoff.md` + `20260910-v2-ui-handoff.md` §4 末）**：graph.json `version: 2` = 顶层 `tree`（嵌套数组，一页至多一个父亲、兄弟有序、成员可选 = 散页合法；无 folder / 节点类型 / compile 标记）+ `pages[名].links`（指向）。一句话：**兄弟 = 顺序，孩子 = 归属，link = 指向**。`version !== 2` 一律拒开、**零 legacy 分支**；占位符废止（打新名 = 当场建空文件）；孤儿 = 不在树 + 无入链。侧栏 = 当前页邻域（`..` / 兄弟 / 子节 / 链接 / 谁指向这里），**不铺整棵树**；树移动六件走行菜单（拖拽等手感再议）；上一页 / 下一页 = 全树前序 DFS（页脚，首尾不绕回，散页灰）；「导出这一支」= 子树 DFS 拼 txt；「+」拆成 + 兄弟 / + 子节。不做：全树视图 / 孤儿面板 / 计数 / 自动归档 / 自动起名 / shelf / edges / dim。夹具 = `tmp/migration/` 四本（`verify.mjs` 回归；不进 git）。edited by Claude Fable 5.1 2026-09-10
- **数据**：身份 = `[夹/]<名>.txt`，**文件名 = 管理用句柄，不是标题**（ADR-0007，2026-09-04 user 拍板：住顶栏、点了改名、编辑器无标题框；**加密稿出生名 = 日期码，转加密自动改日期码，藏标题零 store 改动**），**有名保名，无名 `yyyymmdd-hex4`**（对齐 WeebPaint `naming.ts`，2026-09-03 user；一层文件夹，根 = 默认夹；ADR-0001 + ADR-0006）；加密稿 = 库透明容器（云端 `….txt.zip`，ADR-0002；每篇密码 ADR-0005）；冲突 = 库 sheet + .backup（ADR-0003）；v1 的 `.enc/` `.crypto/` `.userdata/` `voice.json` **不读不删**（ADR-0004 superseded：2026-09-03 user「不做 backward compatibility」）。IDB/localStorage：只经库 + `src/device-kv.ts`。
- **人类钉死的行为（别削弱）**：15s 防抖 + 30s 心跳推云；idle 2 分钟锁屏、解锁前必复查云端（「Quest 是核电池，可能开一年」）；never trust remote filenames；Shift 单击切中英、状态栏点击/设置页「改用系统输入法」切内置 IME（**默认开、全平台 inputmode=none**，2026-09-03 user「不用系统输入法…隐私 paranoid」；方案 全拼/微软双拼/五笔86）、Left Ctrl PTT（keydown 即起录，250ms 门）；加密永不自动弹框、错密码不碰任何文件、解密要红字警告；**加密在新建时就定好**（空新稿切锁钮 = 预定，物化即封；「新建加密稿」钮 2026-09-03 user 拍板删掉——「精简」）；**每篇可有自己的密码，保存永远用打开时那把，换钥匙只能显式**（ADR-0005）；密码无最少位数；**语音全本机（家规硬规则 #8，2026-09-03）：加密稿也能听写**；IME 逃生开关与方案 per-device 不跟云；**语音默认开、无开关，下载语音包那一下 = consent，没包绝不碰麦克风**（2026-09-03 user「无须 consent 默认开」）；打开落在开头；状态文案不跳。
- **产品墙**：接近 sealed class。~~论文/LaTeX 是另一个产品~~ → **2026-09-04 user 解禁 LaTeX / 代码块 / 表格，进下一纪元契约：所见即所得 markdown 编辑（标题 = `# `，方言待钉进 ADR；轮廓见 `ai-docs/20260904-0.3-knight-and-store-backlog.md`）**；警惕滑坡成 pastebin 仍在。悬案不动：WebDAV/坚果云线。自托管 Whisper 死案（2026-09-03，离线本机替代）。edited by Claude Fable 5.1 2026-09-04
- **第三方派生缓存**：见下「持久层白名单」表（RIME IDB 待追认；模型包 Cache `pwa-models` 2026-09-03 已批）。
- **离线语音（0.1 纪元，2026-09-03）**：`src/asr/`（worker 下载/校验/缓存/挂载/解码，主线程 `engine.ts` 门面；`packs.generated.ts` 内嵌模型仓 manifest = 信任根，`node tools/gen-asr-packs.mjs` 重生）+ `src/voice/local.ts`（麦克风→worker→锚点）；运行时 `vendor/sherpa-onnx-wasm/`（自编，README 记参数）。产品模型 = SenseVoice（主）+ zh-14M（实验）。验证：`npm run e2e:asr`（下载+解码整链）、`npm run probe:asr` / `/dev/probe/asr/`（跑分）。SSoT = `ai-docs/20260903-offline-voice.md`。

## 持久层白名单（user 2026-09-03「touch idb or local storage 必须显式白名单」；`test/storage-whitelist.test.mjs` 机械执法）

| 文件 | 持久层 | 用途 |
|---|---|---|
| `@internal/store`（vendor-pkgs tgz） | IDB `webxiaoheiwu.*` + localStorage 前缀键 + sessionStorage | 库本体（稿件/回收站/备份/collections/同步态）——app 只经 `src/app-store.ts` |
| `@internal/gallery`（vendor-pkgs tgz） | IDB `webxiaoheiwu-thumbs` | 书库封面缩略图派生缓存（gallery-native；key = store 身份、token = lastModified/size、全删可再生；user 2026-09-10「weebpaint 不是一直 idb 的吗」批；`src/gallery-host.ts` 只传库名） |
| `src/device-kv.ts` | localStorage（GUID 前缀） | device 层标量唯一器官：imeEnabled / voiceEnabled / voiceModelSource / lang / lastOpen / gallery-folder / **last-scene**（书库里离开 → 回来在书库，2026-09-10）/ **diag-log**（黑匣子环 500 条，2026-09-09；经 deviceKvSetJson，diag-log.ts 自己不碰 localStorage） |
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

1. `./bump.sh v0.0.N-YYYY-MM-DD`（patch AI 例行；minor 需 user 说出版本号；2.1.0 = user 2026-09-10「版号可以 bump minor」）。
2. `npm test`（91 条，秒级）→ `bash scripts/build.sh`（tsc 门 + 接缝 lint + sprite 对账 + 裸中文扫描 + esbuild content-hash → `dist/xiaoheiwu-<hash>.mjs`，自动改 index.html）→ `npm run smoke`（headless boot 13 项，借 WeebPaint 的 playwright）。
3. 重构/大功能：`bash scripts/gen-api.sh` 重打 `api/`。
4. `git add -A && git commit && git push origin main`。prod = `git push origin main:prod`（**先问人**）。

图标：`python3 "../20260708 SVG Icons/extract-icons.py" assets/icons.svg <ids…> --catalog` → `python3 tools/inline-sprites.py`。缺的先烤 stopgap（`tools/bake-stopgap-glyphs.py` SPECS）+ 登记图标库 `TODO.md`；现登记：`settings` `microphone`。
