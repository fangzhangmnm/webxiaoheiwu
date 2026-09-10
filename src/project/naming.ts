// 页名显示（app 层小工具，无 DOM）。created 2026-09-10 by Claude Fable 5.1
//   · 显示名不带扩展名（user 2026-09-10「吃书：还是不显示扩展名吧」）：只剥 `.txt`（app 自己建的页永远是 .txt）；别的扩展名照显，免得 .md/.jpg 混淆。
//     身份仍是带扩展名的完整文件名（ADR-0009 §1/§5 不动，只改渲染）。
//   · 2026-09-10 深夜起**没有任何自动起名**：加页 / 分裂一律用户自己打；唯一的默认 = 新建书的第一页 = 「作品」及各语言对应词（同书的默认名，app.ts 用 t("project.defaultName")；
//     user「不用自动第 xx 章命名。不同的人会用节，幕，所以不要替用户做决定」「只有一个 default 就是默认节点」「默认节点命名是《作品》and their language counterpart 吗」）。
/** 渲染用名字：剥 .txt。 */
export const nodeDisplayName = (name: string): string => name.replace(/\.txt$/i, "");
