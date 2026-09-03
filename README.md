<!-- rewritten 2026-09-03 by Claude Fable 5.1（v2 换代）-->

# 网页版小黑屋

只写字的地方：一张纸、一个标题、一个字数。打开就是上次写到的那一句。

- **用它**：https://fangzhangmnm.github.io/webxiaoheiwu/
- **开发版**（改完即见，可能坏）：https://fangzhangmnm.github.io/webxiaoheiwu/dev/

> as-of v0.0.82 · 2026-09-03

## 它做什么

- **Quest 里写中文**：Meta Quest 浏览器没有中文输入法，这里自带自然码双拼（RIME WASM，离线可用）。点状态栏切换；Shift 单击切中英。PC / iPad 用系统输入法就好，默认不接管。
- **OneDrive 同步**：登录个人 Microsoft 账号，稿子存进网盘的 `Apps/WebXiaoHeiWu/` 文件夹——app 只能碰这个文件夹，看不到你网盘里别的东西。文件就是普通的 `YYYYMMDD 标题.txt`，用什么都能打开。停手 15 秒自动上传；两台设备同时改了同一篇会问你留哪边，被替换的那份留在备份里，不会丢。
- **离线**：装成 PWA 后没网也能写；联网自动补传。
- **加密稿**：一篇一篇选，加密后网盘和本机存的都是密文（7-Zip 格式，用 7-Zip 输密码也能打开）。密码只在内存里，忘了就真的找不回。加密稿上禁用云端语音输入。
- **语音输入**：浏览器 Web Speech（免费）或 Groq / OpenAI Whisper（自备 key，key 存在你自己的网盘设置里）。按住左 Ctrl 说话。
- **闲置锁屏**：两分钟没动就锁；解锁前先去网盘看看有没有新版本，再让你接着写——挂机一年的旧设备醒来也盖不掉新稿。

## 安装成 app

- **Quest**：浏览器打开链接 → 菜单「添加到主屏幕」。
- **iPad / iPhone**：Safari 分享 → 「添加到主屏幕」。
- **PC**：Chrome / Edge 地址栏的安装图标。

## 自己部署

纯静态站：fork 后 `npm install && bash scripts/build.sh`，把仓库交给 GitHub Pages（`.github/workflows/deploy.yml`：`prod` 分支 → `/`，`main` → `/dev/`）。OneDrive 同步要自己的 Azure 应用注册（Personal accounts only，权限只要 `Files.ReadWrite.AppFolder`），clientId 填进 `src/config.ts`；两个地址都要登记为 SPA redirect URI。

## 技术说明

TypeScript + esbuild；云同步引擎 = 家族共享库 `@internal/store`（无 LWW、处处 If-Match、删除进回收站、冲突必现形）；加密 = `@internal/encryption`。设计文档在 `ai-docs/`。
