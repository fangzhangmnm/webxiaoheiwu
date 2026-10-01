# vendor/fonts —— 内置字体（兜底）

> created 20260930 · by Claude Fable 5.1 (claude-fable-5-1)

app 的正文字体：编辑器、长图、PDF 嵌字共用这一份。**定位 = 兜底**（user 2026-09-30「还是全量兜底吧，别的语言也兜底，就用全量但是压缩」）：全量字形、不取子集，只做无损压缩。

| 文件 | 是什么 |
|---|---|
| `sans.ttf.gz` | **思源黑体 / Noto Sans SC Regular**（静态 TrueType，glyf 轮廓，31,036 字形）的 gzip。按角色起名、不带品牌：以后换字体只换这个文件 |
| `OFL.txt` | 许可证全文（SIL Open Font License 1.1；版权行在文件头） |
| `pinyin.ttf.gz` | **萌神手写体 Mengshen-Handwritten 2.0**（汉字头上带拼音的注音字体，64,762 字形）的 gzip。**只给导出用**（长图 / PDF），选了才取 |
| `OFL-pinyin.txt` | 萌神的许可证全文（SIL OFL 1.1；文件头抄了字体 name 表里的版权行） |
| `pixel.ttf.gz` | **Mono8px**（user 自己整理的 8×8 像素字体，11,600 字形、汉字 10,464）的 gzip。编辑器和导出都能选，选了才取 |
| `LICENSE-pixel.txt` | 像素字体的出处链和许可声明 |

## 出处与制作（可复现）

1. 上游：Google Fonts `google/fonts` 仓 `ofl/notosanssc/NotoSansSC[wght].ttf`（可变字体，wght 100–900，**缺省 100**），提交 `2894aab31764f10f29c421bdfd2340d3b382d384`（2022-12-09「Noto Sans SC hotfix2」）。sha256 `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`，17,772,300 字节。
2. 定字重：`python3 -m fontTools.varLib.instancer "NotoSansSC[wght].ttf" wght=400 --update-name-table -o NotoSansSC-Regular.ttf`（fontTools 4.66.1）。PDF 嵌字要的是轮廓表里那一套——可变字体的轮廓表存的是缺省字重（极细），所以必须先定成 400。产物 10,595,876 字节，sha256 `2703f0e86f4723cf19a9881c162a76afe4c10ea25e0939b26d5c9b8cd0d9201a`，字体名仍是 Noto Sans SC / Regular（没用保留名「Source」）。
3. 压缩：`gzip -9 -n` → `sans.ttf.gz` 6.3 MB，sha256 `e29b80bf17ad17bbd07b59642a817b04075b5a9001c53f4783e42c82188d575a`。浏览器里 `DecompressionStream("gzip")` 解一次（没有就退 vendored fflate），解出来与第 2 步逐字节相同。

没有取子集、没有删表。

## 覆盖

CJK 基本区 20,976 字（全）、扩展 A 6,582 字（全）——简体 / 繁体 / 日文汉字都在；GB2312 6763 / 6763、Big5 常用 5495 / 5495；假名、注音、拉丁、希腊、西里尔。**没有韩文谚文**（落到系统字体；PDF 里印方框并报数）。

## 许可证

SIL OFL 1.1：可随软件再分发、可修改（本目录做了「定字重」这一处修改）、不得单独售卖字体文件；随附版权行与许可证全文（`OFL.txt`）。保留字体名是「Source」，我们没用。设置页「维护」一节有署名。

## 没走的路（别再提）

- 霞鹜新晰黑：IPA Font License，随 app / 网页分发要给「换回 IPA 原版」的办法，霞鹜自己的嵌入须知不建议做 Web Font（user 看过两条单图后说思源「更舒服」且许可更宽）。
- 取子集到通规 8105（≈3 MB）：user 否决，「全量兜底」。
- WOFF2：再小 30%，但 PDF 嵌字要原始 TTF 表，得另带解码器。

## 萌神手写体（`pinyin.ttf.gz`，2026-10-01 进仓；by Claude Fable 5.1）

user 2026-10-01「萌神拼音也vendor进去吧，导出的时候还蛮需要的」。

1. 上游：GitHub `MaruTama/Mengshen-pinyin-font`，release **`v20260721-150022`**（提交 `1370f59dd5675f58fc99d5bb14e6e7c684286dda`）的资产 `Mengshen-Handwritten.ttf`：19,747,620 字节，sha256 `53087a7b6d57cc782afac793c24162bcdd434a15dfc5db7a183b0e6a5ba28166`，字体自报 Version 2.0。底字 = 小赖字体 Xiaolai + 濑户字体 SetoFontSP。**没有改动**。
   - user 本机试样用的那份（`OneDrive/Lib/Fonts/cute/萌神手写体.ttf`）= 上游 release `1.02` 的同名文件（sha256 `bf99b132…` 逐字节相同）。进仓选 2.0 是因为上游 2026-07 修了拼音数据和 GSUB 的替换表（release 说明：「stop generating corrupted lookup_aalt_1, correct GSUB ss-index mapping and pinyin data」）。
2. 压缩：`gzip -9 -n` → `pinyin.ttf.gz` 12,162,659 字节，sha256 `354bf347aa43f09aae2712bbb329498a39d14af1a413e25088954b424f3d8c6a`。
3. 许可证：SIL OFL 1.1（上游仓库 `LICENSE`，GitHub 标注 OFL-1.1）。字体 name 表里没有许可证字段，版权行是「[萌神PROJECT] Copyright © 2020 mengshen project with Copyright © 2020 LXGW」。设置页「维护」一节有署名。

**它怎么给多音字选读音**（接线的人要知道的三件事）：
- 每个汉字字形自带一个缺省读音的拼音；别的读音是另一个字形（`uniXXXX.ssNN`）。按词选读音靠 GSUB 的 `rclt`（链式上下文替换）。
- **Chromium 的 canvas 画字不做 rclt**（网页正文做；实测 2026-10-01）。所以长图不能指望浏览器：`src/export/ttf.ts` 自己实现了 rclt（和 HarfBuzz 对 9,289 字语料逐字比过，零差异），再用 cmap 14 的**变体选择符**（U+E01E0 起，每个读音一个）把选好的读音写进文字——canvas 认变体选择符。PDF 直接用选好的字形号。
- 读音对不对取决于字体自带的词表：表里有的词（银行、音乐、朝阳、首都…）选得对，没有的多音字用缺省读音，**可能是错的**（实测「头发很长」的长标成 zhǎng、「重庆」标成 zhòng）。导出给孩子看之前要人过一遍。手动指定读音（在字后面打变体选择符）以后可以做，现在没有入口。

升级这份字体：换文件后跑 `npm test`（`test/pdf.test.mjs` 里有一组 HarfBuzz 录的期望字形号——字形号变了要重录：开发机 `pip install uharfbuzz` 后照测试文件头的说明）。

## 像素字体 Mono8px（`pixel.ttf.gz`，2026-10-01 进仓；by Claude Fable 5.1）

user 2026-10-01「先用我做的那个大的字体可以吗」「字体进」。

1. 文件：`OneDrive/2D/20250823_pixel_fonts/20250808_font/workbench/Mono8px.ttf`（user 的工作文件，name 表：family `Mono8px`、版权栏 `fangzhangmnm`、`Version 3`、FontForge 12-8-2025）。2,467,188 字节，sha256 `1d735cbc6ccceaa1f3051c3603a41576f5764890f40ac79cb96e56881f7c815f`。**没有改动**，`gzip -9 -n` → `pixel.ttf.gz` 453,420 字节，sha256 `64f79786e51ae646ff926a55dabb94ab9275e339c2069b773ea33cf86b0f5c25`。
2. 形状：glyf 轮廓（PDF 引擎直接能用）、1024 units/em（8 格 × 128）、汉字一格宽、拉丁半格宽（等宽）、有假名；没有 GSUB。
3. **字形从哪来（进仓前核的，2026-10-01）**：它的汉字集合和「观致 8×8 像素字体」逐字相同（10,464 对 10,464，互相都不多不少）；抽 201 个常用字把两边的轮廓各栅成 8×8 点阵，**201 个全部相同**；和寒蝉点阵体 7px 一个都不同。所以汉字来自观致，轮廓是 user 重新描的（点阵 → 矢量），另加了 user 自己画的 toki pona。user 的说法是「三个 7x7 的（8x8=7x7）其实是互相抄，我自己做了个精简然后修了 metadata」「我的许可应该就是继承寒蝉的最开放开源的选择，加上我自己画的toki pona」。
4. 许可：观致 8px 基于日文的美咲フォント（Misaki）补了 GB2312 汉字；字体站的说明是「授权与美咲一致：不论是否修改、是否商用，都可以无限制地使用、复制、分发」（来源：猫啃网收录页，二手说明——**没找到观致作者本人的声明原文**，字体 name 表版权栏只写了 `Misaki`）。美咲フォント的许可原文是「These fonts are free software. Unlimited permission is granted to use, copy, and distribute them, with or without modification, either commercially or noncommercially. THESE FONTS ARE PROVIDED "AS IS" WITHOUT WARRANTY.」。按这条链，本文件可以随 app 再分发；出处链和这段原文在 `LICENSE-pixel.txt`，设置页「维护」有署名。
5. 用它的注意：字号要是 8 的整数倍才不糊——编辑器基准 24px（手机 16px），长图一个字 32 像素；字号档不是「标准」时会有点糊。它没有的字落回黑体。

要精修这款字体：换文件、改上面的哈希，跑 `npm test` 和 ruled-audit。每换一版 git 多存约 0.45 MB。
