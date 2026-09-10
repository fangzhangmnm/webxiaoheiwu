// 侧栏（☰ 唯一入口）：顶部两个入口（书库 / 设置）+ 工程内导航 = 当前节点的出边列表（journal 2026-09-09 拍板：左栏不是 folder tree，是这个节点的边；反链是一次查询）。
// created 2026-09-10 by Claude Fable 5.1；同日晚按 user 打回重做：「editor sidebar 只有一个三条杠，打开之后是工程内导航，上面是回书库和设置的入口」
//   「侧栏不应默认开」「新建节点用 list 最下面的一个加号按钮」「节点应该加在末尾」「检索不限字数，这样可以搜全量孤儿」「还是不显示扩展名吧」
//   「分裂选中 连接已有 指向这里这三个先去掉。我以后觉得有必要了再加 ui」（分裂仍有 Ctrl+Enter；连边/反链的动词留在 mode/session，只是没钮）。
// 零态度：无全图、无计数、无衰减；占位符只是虚线名字。节点改名不在这里（章节名框，mode.ts）。
import type { ProjectMode } from "./mode.ts";
import { nodeDisplayName } from "./naming.ts";
import { t } from "../i18n/index.ts";
import { togglePopupMenu, closePopupMenu } from "../ui/popup-menu.ts";
import { openConfirmSheet } from "../sheets.ts";

export interface EdgeSidebarDeps {
  el: HTMLElement;
  mode: ProjectMode;
  setStatus: (text: string, opts?: { error?: boolean }) => void;
  focusEditor: () => void;
  /** 顶部两个入口。 */
  onLibrary: () => void;
  onSettings: () => void;
  /** 加一页（问名字 → mode.newNode）；顶栏「+」与列表末尾「+」同一个流程。返回 true = 已建/已跳。 */
  onAddPage: () => Promise<boolean>;
  /** txt 模式：把这篇草稿变成书（user 2026-09-10）。canLift = 有正文可 lift。 */
  onLift: () => Promise<boolean>;
  canLift: () => boolean;
  /** 无地工程：「下载一份」入口（store 工程不显示）。 */
  onDownload?: () => void;
}
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** 节点时间戳的短显示：今年 → M/D HH:mm；别的年 → YYYY/M/D。0 = 不知道 → 空。 */
function fmtTime(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms), now = new Date(); const p2 = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}` : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
const icon = (id: string) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;

export function createEdgeSidebar(d: EdgeSidebarDeps) {
  const el = d.el;
  let query = "";
  el.innerHTML = `
    <div class="edge-entries">
      <button type="button" class="edge-entry" id="edgeLibrary">${icon("gallery")}<span>${esc(t("sidebar.library"))}</span></button>
      <button type="button" class="edge-entry" id="edgeSettings">${icon("wrench")}<span>${esc(t("ui.settings"))}</span></button>
    </div>
    <div class="edge-txt" id="edgeTxtPane" hidden>
      <button type="button" class="edge-entry edge-lift" id="edgeLift">${icon("book")}<span>${esc(t("lift.entry"))}</span></button>
    </div>
    <div class="edge-pane" id="edgePane" hidden>
      <div class="edge-head">
        <button type="button" class="row-icon-button edge-back" id="edgeBack" title="${esc(t("edge.back"))}" aria-label="${esc(t("edge.back"))}">${icon("back")}</button>
        <div class="edge-titles"><div class="edge-project" id="edgeProject"></div><div class="edge-node" id="edgeNode"></div></div>
      </div>
      <input type="search" class="edge-search" id="edgeSearch" placeholder="${esc(t("edge.searchPh"))}" aria-label="${esc(t("edge.search"))}" autocomplete="off" />
      <ul class="edge-list" id="edgeList" role="list"></ul>
      <div class="edge-foot" id="edgeFoot" hidden>
        <button type="button" class="auth-action" id="edgeDownload" hidden>${esc(t("edge.download"))}</button>
      </div>
    </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>("#" + id)!;
  const pane = $("edgePane"), list = $("edgeList"), nodeEl = $("edgeNode"), projEl = $("edgeProject"), search = $<HTMLInputElement>("edgeSearch");

  function row(name: string, opts: { stub?: boolean; menu?: "edge" | "orphan" }): HTMLLIElement {
    const li = document.createElement("li"); li.className = "edge-row" + (opts.stub ? " stub" : "") + (name === d.mode.current() ? " current" : "");
    const main = document.createElement("button"); main.type = "button"; main.className = "edge-main";
    const shown = nodeDisplayName(name);
    const meta = opts.stub ? null : d.mode.session()?.project.nodes.get(name);
    main.title = opts.stub ? t("edge.stub", { name: shown }) : meta ? t("edge.times", { created: fmtTime(meta.created), modified: fmtTime(meta.modified) }) : shown;
    main.innerHTML = `<span class="edge-name">${esc(shown)}</span>` + (meta && meta.modified ? `<span class="edge-sub">${esc(fmtTime(meta.modified))}</span>` : "");   // 同一行小字 = 修改时间（user 2026-09-10）
    main.addEventListener("click", () => { d.mode.jump(name); clearQuery(); d.focusEditor(); });   // 不自动收（user 2026-09-10「进节点的时候也不要自动弹回」）
    li.appendChild(main);
    if (opts.menu) {
      const more = document.createElement("button"); more.type = "button"; more.className = "row-icon-button edge-more"; more.title = t("edge.more"); more.setAttribute("aria-label", t("edge.more")); more.innerHTML = icon("more");
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePopupMenu({ anchor: more, align: "left", items: () => (opts.menu === "orphan"
          ? [{ id: "purge", label: t("edge.purge"), icon: "trash-can", danger: true }]                       // 孤儿：只有彻底删除（弹框确认）
          : [
            { id: "up", label: t("edge.up") }, { id: "down", label: t("edge.down") },
            { id: "drop", label: t("edge.drop"), icon: "x", separatorBefore: true },                        // 删除模型 = 丢引用（GC 语义）
          ]), onPick: (id) => { void onRowAction(id, name); } });
      });
      li.appendChild(more);
    }
    return li;
  }
  /** 列表末尾的「+」：问名字（user 2026-09-10「不应该自动生成名字，而是让你输入」；placeholder 提示下一个章号，不预填）→ 新节点，边加末尾，跳过去。 */
  function addRow(): HTMLLIElement {
    const li = document.createElement("li"); li.className = "edge-row add";
    const b = document.createElement("button"); b.type = "button"; b.className = "edge-main edge-add"; b.id = "edgeAdd"; b.title = t("edge.newNode");
    b.innerHTML = `${icon("new")}<span class="edge-name">${esc(t("edge.newNode"))}</span>`;
    b.addEventListener("click", () => { void d.onAddPage().then((ok) => { if (ok) { clearQuery(); render(); } }); });
    li.appendChild(b);
    return li;
  }
  async function onRowAction(id: string, name: string): Promise<void> {
    if (id === "up") d.mode.moveLink(name, -1);
    else if (id === "down") d.mode.moveLink(name, 1);
    else if (id === "drop") { if (d.mode.dropRef(name)) { const nn = d.mode.lastDropped(); d.setStatus(nn ? t("edge.droppedOrphan", { name: nodeDisplayName(nn) }) : t("edge.dropped")); } }
    else if (id === "purge") {
      if (!d.mode.isOrphan(name)) { d.setStatus(t("edge.notOrphan"), { error: true }); }
      else if (await openConfirmSheet(t("edge.purgeTitle", { name: nodeDisplayName(name) }), t("edge.purgeMsg"), { danger: true, okLabel: t("edge.purge") })) d.mode.purgeOrphan(name);
    }
    render();
  }
  function clearQuery(): void { query = ""; search.value = ""; }
  function render(): void {
    closePopupMenu();
    const m = d.mode;
    pane.hidden = !m.active();
    $("edgeTxtPane").hidden = m.active() || !d.canLift();
    if (!m.active()) return;
    const cur = m.current();
    nodeEl.textContent = cur ? nodeDisplayName(cur) : "";
    projEl.textContent = m.displayName() ?? "";
    $("edgeBack").toggleAttribute("disabled", !m.canGoBack());
    const canDownload = m.home()?.kind === "local" && !!d.onDownload;
    $("edgeDownload").hidden = !canDownload; $("edgeFoot").hidden = !canDownload;
    list.innerHTML = "";
    const s = m.session()!;
    if (query.length >= 1) {   // 不限字数（user 2026-09-10）：一个字就搜，能把孤儿全扫出来
      const hits = s.find(query);
      list.appendChild(headerRow(t("edge.results", { q: query })));
      if (!hits.length) list.appendChild(emptyRow(t("edge.noResults")));
      for (const n of hits) list.appendChild(row(n, { menu: m.isOrphan(n) ? "orphan" : undefined }));   // 检索结果里的孤儿：行菜单只有「彻底删除」
      return;
    }
    const edges = s.sidebar();
    if (!edges.length) list.appendChild(emptyRow(t("edge.empty")));
    for (const e of edges) list.appendChild(row(e.name, { stub: e.stub, menu: "edge" }));
    list.appendChild(addRow());
  }
  const headerRow = (text: string) => { const li = document.createElement("li"); li.className = "edge-row header"; li.textContent = text; return li; };
  const emptyRow = (text: string) => { const li = document.createElement("li"); li.className = "edge-row empty"; li.textContent = text; return li; };

  $("edgeLibrary").addEventListener("click", () => d.onLibrary());
  $("edgeLift").addEventListener("click", () => { void d.onLift().then((ok) => { if (ok) render(); }); });
  $("edgeSettings").addEventListener("click", () => d.onSettings());
  $("edgeBack").addEventListener("click", () => { if (d.mode.goBack()) { clearQuery(); render(); d.focusEditor(); } });   // 不自动收（user「点 return back 的时候侧栏不应自动弹回」）
  search.addEventListener("input", () => { query = search.value.trim(); render(); });
  search.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); clearQuery(); render(); d.focusEditor(); } });
  $("edgeDownload").addEventListener("click", () => d.onDownload?.());
  render();
  return { render, el };
}
export type EdgeSidebar = ReturnType<typeof createEdgeSidebar>;
