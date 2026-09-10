
## 修订 2026-09-10 深夜（吃书；user「同意 pages」「不 backward support 都行」「3 应该不需要（version 不升）」；edited by Claude Fable 5.1）
完整目录清单（as-of v2.0.9）：
```
作品.webxiaoheiwu.zip
├─ graph.json                       { format:"webxiaoheiwu", version:1, wroteWith, readOnly?:true, pages:{ "<完整文件名>": { links[], created, modified } } }
├─ pages/                           扁平，不许子目录；*.txt 打开，别的扩展名合法但 2.0 不打开（地图、插画将来也是一页）
│   └─ 第一章.txt
└─ .webxiaoheiwu/editor-state.json  { last, back }   导航态：不标脏、保存随手捞（ADR-0010）
```
- `contents/` → `pages/`，graph.json `nodes` → `pages`；**不读旧格式**：读到 `contents/` 或 `nodes` 键 → `legacy` 拒开（不能读成空书再整包覆盖）。version 仍 1（dev 语义本来就不稳定）。
- `readOnly`（修改锁）**跟着作品**进 graph.json 顶层（user「zip 锁跟着作品」）；切换 = 正经改动，标脏、立即落盘/推云。txt 没有修改锁（本机 `readonly-names` 名单删除）。
- 名词：用户面「书 / 页」；内存 Map 与代码标识符（nodes/contents）不动。
