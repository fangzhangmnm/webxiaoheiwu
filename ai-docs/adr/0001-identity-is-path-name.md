# ADR-0001 稿的身份 = 路径/文件名（不再是 OneDrive itemId）
> created 20260903 · **2026-09-03 修订**：ADR-0006 允许一层文件夹前缀；命名改「有名保名，无名 yyyymmdd-hex4」（对齐 WeebPaint naming.ts，user 拍板）——日期前缀不再是结构 · by Claude Fable 5.1 · status: accepted

## 决定
v2 起，一篇稿的身份就是 appfolder 根下的文件名 `YYYYMMDD 标题.txt`（与家族 MASTER §A「identity = path/name」一致）。改标题 = 改身份（`file.tryMove`），撞名追加 ` 1` ` 2`…。

## 背景
v1 用 OneDrive itemId(GUID) 作 IDB 主键、path 只是显示名——与家族红线正面冲突（MASTER §A 修订 4：provider 的 ref 是行李牌不是身份）。user 2026-09-03：只有本人在用、OneDrive 是 SSoT、本地可重建 → 直接换。

## 后果
- 明文稿零迁移（v1 就是同名平铺）；本地 IDB 换新命名空间 `webxiaoheiwu.defaultStore`，旧库成孤儿不读不删。
- 云端改名 = 别的设备看像「旧名没了 + 新名冒出」（wart E，家族接受）。
- 「never trust remote filenames」仍成立：解析永不抛，不匹配的名当整个 stem 是标题。

## 否决
- 内容哈希身份（家族 2026-06 否决）。
- 在 collection 里维护 GUID→path 登记表（0607「不铸 id」判决延伸）。
