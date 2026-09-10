# ADR-0015 书（zip）的落盘 / 推云节律：IDB 与云不同心跳、增量重打（passThrough）、切页即落盘、本地防抖随体重放缓
> created 20260910 · by Claude Fable 5.1 (claude-fable-5-1) · status: accepted（**出处 = 图片 session 2026-09-10 报告转述的 user 拍板**，经协调 session 转给树 session 落地；本 ADR 作者没有亲耳听到这些话，引文以该报告为准；落地 = v2.1.2）

## 背景（图片 session 报告的定性；数字是估算非实测）
- as-of v2.1.0：本地改动 → 200 ms 防抖 → `session.flush` → `packProject` **整包重打**（graph.json + 每页 + editor-state + 封面；zip.js `useWebWorkers:false` + JS deflate 主线程，为同内容同字节）→ store 写 IDB。云：min(15 s 防抖, 首次脏起 30 s 心跳) → 整包交库。切页不标脏，editor-state 随下次保存写（ADR-0010）。
- 成本与书大小线性：每 200 ms 一次整包重压 + IDB 写；推云每 15 s 整包上传；图片页进来后先撞到。user 原话（报告转述）：「其实不要图片，2.0 的书就需要重新思考这个模型了」。
- user 拍板（报告转述）：① 不做总重机制（async 上传以后落）；② 「同意 idb 和云不同心跳」；③ 三方向「a 居然这么好，要 b 同意 c 同意」（a 脏页增量重打 / b 本地节律随体重放缓 / c async 上传合并）；④ 换页 = 触发本地落盘不触发推云（user 未反对）。

## 决定
1. **IDB 与云不同心跳**：本地落盘节律与推云节律各自独立；推云节律（15 s 防抖 / 30 s 心跳，config.ts「别再动」）**不变**。
2. **a. 增量重打（passThrough）**：`Project.rawCache: WeakMap<Uint8Array, RawEntry>`——解包时把每个页 / 封面 entry 的**已压缩字节 + method + crc + uncompressedSize** 挂在它的字节对象上；打包时字节对象还在缓存里的 entry 用 zip.js `add(..., { passThrough: true })` 原样塞回，只有新 / 改过的对象才 deflate，打完从产物里收割刚压的 entry 进缓存。键是**对象身份**：`writeNodeText` 换新 Uint8Array 自然失效，改名 / 搬树不换对象照样命中——**不需要脏页集合**。graph.json / editor-state 小且每次都变，永远重压。**仍整包重写**（ADR-0008 §4 不变）；**同内容同字节不变量不动**（passThrough 的字节就是上次的确定性输出；测试：解包 → 打包 = 与首次全压逐位相同）。
3. **d. 切页即落盘**：`mode.jump / goBack` 在 commitEditor 后若有挂着的本地防抖或 session 脏 → 取消防抖、立刻 `persist(false)`；**不额外推云**——落完照旧排原来的推云节律（15 s / 30 s）。读法说明：报告里的「不触发推云」在这里读成「切页不是推云的触发点」，而不是「切页后的改动永不推云」——后者会重蹈 v2.0.4「工程永远推不上云」的坑。
4. **b. 本地防抖随体重放缓**：书的本地防抖 = `clamp(200 ms, 上次落盘耗时 × 5, 3 s)`（`src/project/cadence.ts`，`BOOK_LOCAL_SAVE_*` 常量）；只量本地那次（打包 + 写 IDB），推云那次含网络不算。**只对书**，txt 稿的常量不动。a 落地后大多数书仍停在 200 ms，b 只在仍慢的书上生效。
5. **c. 推云 async 上传 + 合并 = `@internal/store` 库改动，本轮不做**（家规：改库前必须 escalate；WeebPaint 5 MB ora 是同一需求）——待 user 立项。

## 否决 / 不做
- 总重机制（user ①）；切页推云（④）；改推云常量；按路径记脏页集合（对象身份已够，且改名 / 搬树零重压）。

## 后果
- **b 的丢字窗口**：崩溃 / 强杀最多丢「上次落盘耗时 × 5」那几秒的字（封顶 3 s）；a 之后这窗口几乎不出现，出现也只在很胖的书上。切页（d）与显式保存不受此窗口影响。
- 内存：rawCache 多占约一份 zip 大小的已压缩字节（AI 参考书 165 KB 级）。
- 用别的压缩器写出的书（如迁移轮 Python zipfile）解包再打包时，未改的页原样带着那个压缩器的字节；同一 app 内两次打包仍逐位相同（`tmp/migration/verify.mjs`）。
- 测试：`test/project-format.test.mjs`「增量重打」两条（改一页只重压一页、其余 entry 逐位相同；解包→打包 = 全压字节）、`test/project-cadence.test.mjs`；`tools/ui-audit.mjs` 探针「切页即落盘」。
- c 待 user；a/b/d 真机零。
