# 本 app 的图标

14 icons · 提取自家族图标库 `../20260708 SVG Icons/icons.svg` · 由 `extract-icons.py` 生成，别手改。

用法：把 sprite 整段内联到 `<body>` 顶部，然后按 id 引用；
⚠ sprite 根自带的隐藏样式（1×1 + `opacity:0`）别换成 `display:none`——
不渲染的子树里 `<mask>`/`<clipPath>` 不生效，靠遮罩留白的图标会静默糊掉；
颜色跟随 CSS `color`（全部 `currentColor`）：

```html
<!-- 内联 icons.svg -->
<svg width="24" height="24"><use href="#new"/></svg>
```

> ⚠ 库里还没有这些图标，当前用 `icon-missing` 占位：`settings`、`microphone`
> 等它们进 `icons.svg` 后重跑本脚本即可换成真图标。


## file

| name | 说明 |
|------|------|
| `new` | 新建:纯加号(等长十字线) |
| `clear-trash` | 清空回收站:桶身改虚线表示已空 |
| `trash-can` | 垃圾桶:桶身收口(feather 是直筒);与 fluent(圆提手/更低)、heroicons(弧形透视)亦不同 — own |
| `restore-trash` | 同上但盖只掀 -16° |

## hierarchy

| name | 说明 |
|------|------|
| `lock` | 锁:体 13x11+锁梁抬高(腿3.5),整体居中 |
| `unlock` | 开锁:同 lock 体型+锁梁弹开 |
| `edit-disabled` | 不可编辑:同 pencil 加删除线, 方向与笔身垂直(笔身是 ↗, 所以线走 ↘) |
| `edit-enabled` | 可编辑:Bootstrap Icons 的 pencil(MIT) |

## common

| name | 说明 |
|------|------|
| `x` | 叉 |
| `back` | 返回:左向整箭头(带杆;裸 chevron-left 曾因小尺寸渲染差被 sunset) |

## cloud

| name | 说明 |
|------|------|
| `refresh` | 刷新:顺时针 3/4 圆 + 箭头(从 12 点绕到 9 点, 箭头尖在右上) |

## ui

| name | 说明 |
|------|------|
| `menu` | 汉堡菜单:三条等长横线(y=7/12/17) |

## missing

| name | 说明 |
|------|------|
| `settings` ⚠占位 | 缺图标占位 — settings 尚未进 icons.svg |
| `microphone` ⚠占位 | 缺图标占位 — microphone 尚未进 icons.svg |
