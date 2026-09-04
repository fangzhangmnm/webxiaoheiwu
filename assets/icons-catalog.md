# 本 app 的图标

27 icons · 提取自家族图标库 `../20260708 SVG Icons/icons.svg` · 由 `extract-icons.py` 生成，别手改。

用法：把 sprite 整段内联到 `<body>` 顶部，然后按 id 引用；
⚠ sprite 根自带的隐藏样式（1×1 + `opacity:0`）别换成 `display:none`——
不渲染的子树里 `<mask>`/`<clipPath>` 不生效，靠遮罩留白的图标会静默糊掉；
颜色跟随 CSS `color`（全部 `currentColor`）：

```html
<!-- 内联 icons.svg -->
<svg width="24" height="24"><use href="#move-to-file"/></svg>
```

> ⚠ 库里还没有这些图标，当前用 `icon-missing` 占位：`microphone`
> 等它们进 `icons.svg` 后重跑本脚本即可换成真图标。


## edit

| name | 说明 |
|------|------|
| `move-to-file` | 文件+绕行箭头(移到文件) |

## file

| name | 说明 |
|------|------|
| `new` | 新建:纯加号(等长十字线) |
| `clear-trash` | 清空回收站:桶身改虚线表示已空 |
| `trash-can` | 垃圾桶:桶身收口(feather 是直筒);与 fluent(圆提手/更低)、heroicons(弧形透视)亦不同 — own |
| `restore-trash` | 同上但盖只掀 -16° |
| `folder` | 文件夹:左边 tab + 矩形主体 |
| `folder-open` | 打开的文件夹:背板止于盖顶 T 接,不再互相压线 |

## hierarchy

| name | 说明 |
|------|------|
| `lock` | 锁:体 13x11+锁梁抬高(腿3.5),整体居中 |
| `unlock` | 开锁:同 lock 体型+锁梁弹开 |
| `edit-disabled` | 不可编辑:同 pencil 加删除线, 方向与笔身垂直(笔身是 ↗, 所以线走 ↘) |
| `edit-enabled` | 可编辑:Bootstrap Icons 的 pencil(MIT) |
| `create-folder` | 加号做成右下角徽标 |

## common

| name | 说明 |
|------|------|
| `x` | 叉 |
| `back` | 返回:左向整箭头(带杆;裸 chevron-left 曾因小尺寸渲染差被 sunset) |

## cloud

| name | 说明 |
|------|------|
| `refresh` | 刷新:顺时针 3/4 圆 + 箭头(从 12 点绕到 9 点, 箭头尖在右上) |
| `cloud` | 云 |
| `cloud-synced` | 云+勾 |
| `cloud-upload` | 云+上传箭头 (云形统一为 feather 的) |
| `cloud-download` | 云+下载箭头:cloud-upload 的精确上下镜像(箭头绕 y=14 翻转); WeebPaint gallery 同步徽章 newer-on-cloud, 12px 用量 (甲方 20260825 拍板候选 1 号) |
| `cloud-conflict` | 云+感叹号(2.4 描边整体收在云内不破轮廓, 点半径=描边半宽; 与 cloud-pending 问号云成对但云为实线); WeebPaint gallery 同步徽章 conflict, 12px 用量 (甲方 20260825 拍板候选 5 号=大号收内) |
| `cloud-unavailable` | — |
| `cloud-pending` | 待判定:虚线云 + 云内问号(加粗 2.4, 遮罩描边留白与云脱开;问号下点的半径=描边半宽) |

## ui

| name | 说明 |
|------|------|
| `menu` | 汉堡菜单:三条等长横线(y=7/12/17) |
| `wrench` | 扳手:斜置组合扳手轮廓(feather:wrench 衍生), 20260724 候选 1 号入库 |
| `more` | 溢出菜单:横向三点(原 ⋯ 字符跨平台字形不一) |
| `database` | — |

## missing

| name | 说明 |
|------|------|
| `microphone` ⚠占位 | 缺图标占位 — microphone 尚未进 icons.svg |
