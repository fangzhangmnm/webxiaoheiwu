# 测试分档：改了哪一块跑哪一档

> created 20261110 by Claude Fable 5.2 · as-of v3.0.19 / 2026-11-10 · 家族周账 F-86
> user 2026-11-10：「顺便看一下这个测试要跑多久，如果超过一分钟的时候，记周账让fable做分级制度」「你能顺便把测试分级做一下吗。以后不要跑那么久了」。
> 样板 = MoonSinger `ai-docs/20261013-test-tiers.md`（三档 + 一张「源码 → 该跑哪些」的表 + 并行运行器）。家规：测试最多一分钟，别动不动跑全量。

## 0. 一句话

账全在端到端同步测试上：71 个场景一条一条跑要 11 分多。没有砍测试，改成**三档 + 一张分区表 + 并行**：每改一下跑快门（9 秒）；改完一块只跑它那几区（16–43 秒）；推开发版之后整套并行（75 秒）。

## 1. 量过的数（2026-11-10，本机 WSL，16 核）

| 什么 | 命令 | 时长 |
|---|---|---|
| 类型检查 + 单元（436 条，含守卫） | `npm run check` | 9 s |
| 打包 | `bash scripts/build.sh` | 3 s |
| 开机冒烟 | `npm run smoke` | 31 s |
| 参考窗 | `npm run e2e:ref` | 27 s |
| 记住密码 | `npm run e2e:remember` | 10 s |
| 端到端同步 71 个场景，一条一条跑（旧） | — | 675 s（11 分 15 秒） |
| 同上，并行 8 条 | `npm run e2e:sync -- --jobs=8` | 93 s（连跑三遍全绿） |
| 同上，并行 12 条（现在的默认） | `npm run e2e:sync` | 74–76 s（连跑四遍全绿） |

并行的下限 = 最慢的那个场景（加密词库清空，42 秒）。

## 2. 三档

| 档 | 命令 | 多久 | 什么时候 |
|---|---|---|---|
| **快门** | `npm run check` | 9 s | 每改一下都跑 |
| **这一区** | `npm run e2e:sync -- --changed`（自己看 git 改了什么）<br>或 `npm run e2e:sync -- @swap @gate`（点名几区）<br>或 `npm run e2e:sync -- "换稿 ㉑"`（场景名子串） | 16–43 s | 一块改完、提交之前。**反证（换回旧代码再跑一遍看它红）只在这一档做** |
| **整套** | `npm run e2e:sync` | 75 s | 推开发版之后立刻跑（先推、后验：人先看到）；红了修了再推 |
| **整套 + 壳** | 整套 + `npm run smoke` + `npm run e2e:ref` + `npm run e2e:remember` | 约 2.5 分钟 | 推正式版之前；bump minor 之前 |

界面 / 键盘 / 稿纸的三个审计脚本照旧按改动种类跑（`node tools/ui-audit.mjs` / `kb-audit.mjs` / `ruled-audit.mjs`），`--changed` 会按改到的文件提醒。

## 3. 区（唯一的一份 = `test/e2e-sync/areas.mjs`；`npm run e2e:sync -- --list` 看每区有哪些场景）

| 区 | 管什么 | 场景数 | 并行用时 |
|---|---|---|---|
| `@swap` | 换稿：文本稿 / 书之间切换、读失败、存不上时的出口 | 22 | 25 s |
| `@conflict` | 冲突面、云端快进、备份箱 | 11 | 18 s |
| `@gate` | 网盘闸门、回来补传 | 17 | 26 s |
| `@dict` | 输入法词库（明文 / 加密） | 8 | 43 s |
| `@enc` `@wake` `@rename` | 加密稿 / 挂机回来 / 改名（三区一起） | 14 | 16 s |

场景属于哪一区看**场景名**（正则在分区表里）。一个场景可以落进几区。

## 4. 改了哪个文件 → 跑哪几区

也在 `test/e2e-sync/areas.mjs`（`SOURCES`，从上往下第一条命中的算数）。要点：

| 改了什么 | 跑 |
|---|---|
| `src/editor.ts`、`src/docs.ts`、`src/rescue.ts` 等稿的读写 | @swap @conflict @wake @enc @rename |
| `src/project/**` | @swap @conflict @enc |
| `src/cloud-gate*.ts`、`src/cloud-return.ts` | @gate @wake |
| `src/crypto-state.ts`、`src/encryption.ts` | @enc @dict |
| `src/ime.ts`、`src/enc-dict.ts`、`vendor/my-rime/**` | @dict |
| `src/drawer.ts`、`src/gallery-host.ts`、`src/input/**` | 见表 |
| **`src/app.ts`、`src/i18n/**`、`src/sheets.ts`、`src/app-store.ts`、`index.html`、`package.json`、`scripts/**`、`vendor-pkgs/**`、`test/e2e-sync/**`** | **整套**（中枢；场景按文案认面） |
| 界面 / 导出 / 排版 / 语音 | 不归这套管，运行器提醒该跑哪个脚本 |
| `ai-docs/`、`CLAUDE.md`、`api/`、`dist/`、单元测试 | 只跑快门 |
| 没登记的 `src/**` | 整套（宁多跑不漏跑；登记了再缩） |

## 5. 规矩

- **新加的场景必须落进一区**，否则 `npm test` 红（`test/e2e-sync-areas.test.mjs`）：分档靠这张表，漏登记 = 那一区静默漏跑。
- **等「状态到了」用轮询，不用固定毫秒猜机器多快。** 并行时机器忙，固定等待会假红。
- **断言里真要量时长的**（「罩 < 300 ms」这类）登记进分区表的 `SOLO`：运行器等别的都跑完再一条一条跑它们。现在只有「闸门 ②」。
- **偶发红不重试。** 先分清是测试猜了机器速度，还是 app 真有一个对快慢敏感的毛病（见第 6 节）。查偶发红时加 `--serial` 一条一条跑做对照。
- 红了接着跑，最后一起列红的场景和红的那几项。每个场景的输出攒成一整块再打，不会串行。
- 上次每个场景的用时记在 `tmp/e2e-sync/times.json`（不进仓），慢的先跑。

## 6. 这次并行顺带查出来的两件

1. **「闸门 ②」的「罩 < 300 ms」**：十几个浏览器同时起的时候量到 530 ms。是测试在量时长，不是 app 慢 → 进 `SOLO`。
2. **「加密 txt · 挂机」**（周账 F-239，之前记的是「测试不可靠」）：真原因在 app。新稿第一次落盘时，建稿那一步一回来「已存的字」就对上了，「欠推」的标记要等后面那次写完才立；这中间按推送（保存钮、锁屏那一下）会被当成干净的直接跳过，十几秒后的定时推送才补上。机器忙时加密稿封得慢，测试正好撞进去，于是「加密稿已上云」拿不到、后面「丢回执」的门没装上、几项白白通过。**改了 app**（`src/editor.ts pushNow`：「不脏」把排着的保存也算上，和交给库的 `localDirty` 同一个定义）+ 测试那一步改成轮询。改前照「先跑闸门区、紧接着跑加密区」的顺序 5 次红 4 次，改后 3 次全绿。

## 7. 没做的

- 开机冒烟、参考窗、记住密码、三个审计脚本没并进这个运行器（各自是独立脚本，10–31 秒）。
- 没有 CI（部署流程只部署、不跑测试，和兄弟项目一样）。
- 架子借的是 WeebPaint 仓里的 playwright（老样子，没动）。

## 8. 操作卡

```
改一下          → npm run check                         （9 秒）
改完一块        → npm run e2e:sync -- --changed          （或 @区名 / 场景名子串；16–43 秒）
                  反证：换回旧代码，再跑同一条，看它红
推开发版        → 推完立刻 npm run e2e:sync               （75 秒）
推正式版 / 升 minor → 再加 smoke、e2e:ref、e2e:remember   （共约 2.5 分钟）
加了场景        → 名字要能落进 test/e2e-sync/areas.mjs 的一区（不落 npm test 红）
```
