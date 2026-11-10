// 端到端同步测试的分区表（唯一的一份；运行器 run.mjs 和守卫 test/e2e-sync-areas.test.mjs 都读它）。
// created 2026-11-10 by Claude Fable 5.2（user 11-10「你能顺便把测试分级做一下吗。以后不要跑那么久了」；规矩 = ai-docs/20261110-test-tiers.md；样板 = MoonSinger test/e2e/areas.mjs）。
//   场景属于哪一区 = 看场景名（每个场景至少要落进一区，否则 npm test 红——漏登记 = 那一区静默漏跑）。
//   改了哪个文件该跑哪几区 = SOURCES，从上往下第一条命中的算数；没登记的 src/** = 整套（宁多跑不漏跑，登记了再缩）。

/** 区名 → 说明 + 按场景名认的正则。一个场景可以落进几区。 */
export const AREAS = {
  swap:     { title: "换稿：文本稿 / 书之间切换、读失败、存不上时的出口", match: /^换稿 / },
  conflict: { title: "冲突面、云端快进、备份箱",                         match: /推送冲突|云端覆盖本地|干净快进|^备份箱 / },
  wake:     { title: "挂机 / 锁屏 / 页面被回收之后回来",                 match: /挂机|页面被回收/ },
  gate:     { title: "网盘闸门、回来补传",                               match: /^闸门 |^回来 / },
  enc:      { title: "加密稿：先封再存、副产品、出门、第二台设备",       match: /^加密副产品|^先封再存|第一次开加密稿|^加密稿出门|^加密 txt/ },
  dict:     { title: "输入法词库（明文 / 加密）",                         match: /^词库|^加密词库/ },
  rename:   { title: "改名 / 挪夹（撞上分叉时问「旧的怎么办」）",         match: /改名/ },
};
/** 断言里量时长的场景（「罩 < 300 ms」这类）：并行时机器忙会假红 → 运行器等别的都跑完，再一条一条跑它们。
 *  写新场景的规矩：等「状态到了」用轮询，别用固定毫秒猜机器多快；真要量时长的才登记到这里。 */
export const SOLO = [/^闸门 ② /];
export const areasOf = (scenarioName) => Object.keys(AREAS).filter((a) => AREAS[a].match.test(scenarioName));

const ALL = "all";
/** 源码路径（相对仓根，正斜杠）→ 该跑哪几区。areas: "all" = 整套；[] = 没有端到端同步测试管它（只跑 npm run check）。note = 运行器顺带提醒的别的脚本。 */
export const SOURCES = [
  // —— 不归端到端同步测试管的 ——
  { re: /^(ai-docs|api|dist|probe|journal|journals|weekly|\.claude)\//, areas: [], why: "文档 / 生成物 / 探针" },
  { re: /^(CLAUDE\.md|README\.md|bump\.sh|src\/version\.ts|\.gitignore)$/, areas: [], why: "说明 / 版本号" },
  { re: /^test\/e2e-sync\//, areas: ALL, why: "套件自己（架子、假网盘桥、场景、分区表）" },
  { re: /^test\/(boot-smoke|e2e-reference|e2e-remember|asr-e2e)\.mjs$/, areas: [], why: "别的脚本自己", note: "改了哪个脚本就跑哪个" },
  { re: /^test\//, areas: [], why: "单元测试：npm run check 管" },
  { re: /^tools\//, areas: [], why: "审计 / 生成脚本自己" },
  // —— 中枢：谁都可能动 ——
  { re: /^(src\/app\.ts|index\.html|package\.json|package-lock\.json|tsconfig\.json|scripts\/|vendor-pkgs\/|src\/app-store\.ts|src\/i18n\/|src\/config\.ts|src\/sheets\.ts|src\/store-ui\.ts)/, areas: ALL, why: "中枢（app 胶水 / 库 / 文案 / 面 / 构建）；场景按文案认面" },
  // —— 一块一块的 ——
  { re: /^src\/editor\.ts$/, areas: ["swap", "conflict", "wake", "enc", "rename"], why: "文本稿：换稿、保存、推送、快进、改名" },
  { re: /^src\/project\//, areas: ["swap", "conflict", "enc"], why: "书：开 / 关 / 保存 / 快进 / 格式" },
  { re: /^src\/(docs|rescue|doc-model|identifiers|zip|sevenzip)\.ts$/, areas: ["swap", "conflict", "wake", "enc", "rename"], why: "稿的读写、留底、命名、容器" },
  { re: /^src\/drawer\.ts$/, areas: ["swap", "gate"], why: "抽屉：扔稿、列表" },
  { re: /^src\/gallery-host\.ts$/, areas: ["conflict", "gate", "swap"], why: "书库：备份箱、要处理的、进出书库" },
  { re: /^src\/(cloud-gate|cloud-gate-ui|cloud-return|idle-gate|settle-hold)\.ts$/, areas: ["gate", "wake"], why: "闸门、回来补传、闲置" },
  { re: /^src\/(crypto-state|encryption|remember-password)\.ts$/, areas: ["enc", "dict"], why: "口令、封 / 解", note: "记住密码另跑 npm run e2e:remember" },
  { re: /^src\/(ime|ime-fuzzy|enc-dict|rime-userdb)\.ts$|^vendor\/my-rime\//, areas: ["dict"], why: "输入法、词库" },
  { re: /^src\/(diag-log|diag-log-ui|error-badge)\.ts$/, areas: ["gate", "enc"], why: "黑匣子（闸门 ⑧、加密副产品都翻它）" },
  { re: /^src\/reference-host\.ts$/, areas: [], why: "参考窗", note: "跑 npm run e2e:ref" },
  { re: /^(service-worker\.js|manifest\.webmanifest|src\/pwa-shell\.ts|src\/first-frame-watchdog\.ts|src\/factory-reset\.ts)$/, areas: [], why: "离线壳 / 开机 / 还原出厂", note: "跑 npm run smoke" },
  { re: /^(styles\.css|assets\/|src\/ui\/|src\/export\/|src\/image\/|src\/adv\/|src\/pip\.ts|src\/fonts\.ts|src\/zh-punct\.ts|src\/text-edit\.ts|src\/share-platform\.ts|src\/load-script\.ts|src\/device-kv\.ts)/, areas: [], why: "界面 / 导出 / 排版：端到端同步测试不碰", note: "改了界面跑 node tools/ui-audit.mjs；稿纸 / 字号跑 node tools/ruled-audit.mjs" },
  { re: /^src\/input\//, areas: ["swap"], why: "输入道：换稿前要把排着的改字先落下（flushText）", note: "改了输入跑 node tools/kb-audit.mjs" },
  { re: /^(src\/voice\/|src\/asr\/)/, areas: [], why: "语音", note: "改了语音跑 npm run e2e:asr" },
  // —— 兜底 ——
  { re: /^(src|vendor)\//, areas: ALL, why: "没登记的源码：整套（登记进 test/e2e-sync/areas.mjs 再缩）" },
  { re: /./, areas: [], why: "没有测试管" },
];
/** 一个改动的文件 → { areas, why, note }。 */
export function areasForPath(path) {
  const p = path.replace(/\\/g, "/");
  const hit = SOURCES.find((s) => s.re.test(p));
  return { areas: hit.areas, why: hit.why, note: hit.note ?? null };
}
