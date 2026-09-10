// 侧栏（☰ 唯一入口）：顶部两个入口（书库 / 设置）+ 工程内导航 = 当前节点的出边列表（journal 2026-09-09 拍板：左栏不是 folder tree，是这个节点的边；反链是一次查询）。
// created 2026-09-10 by Claude Fable 5.1；同日晚按 user 打回重做：「editor sidebar 只有一个三条杠，打开之后是工程内导航，上面是回书库和设置的入口」
//   「侧栏不应默认开」「新建节点用 list 最下面的一个加号按钮」「节点应该加在末尾」「检索不限字数，这样可以搜全量孤儿」「还是不显示扩展名吧」。
// 零态度：无全图、无计数、无衰减；占位符只是虚线名字。节点改名不在这里（章节名框，mode.ts）。
import type { ProjectMode } from "./mode.ts";
import { nodeDisplayName } from "./naming.ts";
import { t } from "../i18n/index.ts";
import { togglePopupMenu, closePopupMenu } from "../ui/popup-menu.ts";
import { openInputSheet, openConfirmSheet } from "../sheets.ts";

export interface EdgeSidebarDeps {
  el: HTMLElement;
  mode: ProjectMode;
  setStatus: (text: string, opts?: { error?: boolean }) => void;
  focusEditor: () => void;
  /** 顶部两个入口。 */
  onLibrary: () => void;
  onSettings: () => void;
  /** 跳到某节点之后（窄屏浮层要收起）。 */
  afterNavigate?: () => void;
  /** 无地工程：「下载一份」入口（store 工程不显示）。 */
  onDownload?: () => void;
}
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const icon = (id: string) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;

export function createEdgeSidebar(d: EdgeSidebarDeps) {
  const el = d.el;
  let query = "";
  let backlinksOpen = false;
  el.innerHTML = `
    <div class="edge-entries">
      <button type="button" class="edge-entry" id="edgeLibrary">${icon("gallery")}<span>${esc(t("sidebar.library"))}</span></button>
      <button type="button" class="edge-entry" id="edgeSettings">${icon("wrench")}<span>${esc(t("ui.settings"))}</span></button>
    </div>
    <div class="edge-pane" id="edgePane" hidden>
      <div class="edge-head">
        <button type="button" class="row-icon-button edge-back" id="edgeBack" title="${esc(t("edge.back"))}" aria-label="${esc(t("edge.back"))}">${icon("back")}</button>
        <div class="edge-titles"><div class="edge-project" id="edgeProject"></div><div class="edge-node" id="edgeNode"></div></div>
      </div>
      <input type="search" class="edge-search" id="edgeSearch" placeholder="${esc(t("edge.searchPh"))}" aria-label="${esc(t("edge.search"))}" autocomplete="off" />
      <ul class="edge-list" id="edgeList" role="list"></ul>
      <div class="edge-foot">
        <button type="button" class="auth-action" id="edgeSpawn" title="${esc(t("edge.spawnHint"))}">${esc(t("edge.spawn"))}</button>
        <button type="button" class="auth-action" id="edgeLink">${esc(t("edge.linkExisting"))}</button>
        <button type="button" class="auth-action" id="edgeBacklinks">${esc(t("edge.backlinks"))}</button>
        <button type="button" class="auth-action" id="edgeDownload" hidden>${esc(t("edge.download"))}</button>
      </div>
    </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>("#" + id)!;
  const pane = $("edgePane"), list = $("edgeList"), nodeEl = $("edgeNode"), projEl = $("edgeProject"), search = $<HTMLInputElement>("edgeSearch");

  function row(name: string, opts: { stub?: boolean; menu?: boolean }): HTMLLIElement {
    const li = document.createElement("li"); li.className = "edge-row" + (opts.stub ? " stub" : "") + (name === d.mode.current() ? " current" : "");
    const main = document.createElement("button"); main.type = "button"; main.className = "edge-main";
    const shown = nodeDisplayName(name);
    main.title = opts.stub ? t("edge.stub", { name: shown }) : shown;
    main.innerHTML = `<span class="edge-name">${esc(shown)}</span>`;
    main.addEventListener("click", () => { d.mode.jump(name); clearQuery(); d.focusEditor(); d.afterNavigate?.(); });
    li.appendChild(main);
    if (opts.menu) {
      const more = document.createElement("button"); more.type = "button"; more.className = "row-icon-button edge-more"; more.title = t("edge.more"); more.setAttribute("aria-label", t("edge.more")); more.innerHTML = icon("more");
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePopupMenu({ anchor: more, align: "left", items: () => [
          { id: "up", label: t("edge.up") }, { id: "down", label: t("edge.down") },
          { id: "unlink", label: t("edge.unlink"), icon: "x", separatorBefore: true },
          { id: "delete", label: t("edge.delete"), icon: "trash-can", danger: true, hidden: !!opts.stub },
        ], onPick: (id) => { void onRowAction(id, name); } });
      });
      li.appendChild(more);
    }
    return li;
  }
  /** 列表末尾的「+」：新节点直接生（第 N 章），边加末尾，跳过去改名。 */
  function addRow(): HTMLLIElement {
    const li = document.createElement("li"); li.className = "edge-row add";
    const b = document.createElement("button"); b.type = "button"; b.className = "edge-main edge-add"; b.id = "edgeAdd"; b.title = t("edge.newNode");
    b.innerHTML = `${icon("new")}<span class="edge-name">${esc(t("edge.newNode"))}</span>`;
    b.addEventListener("click", () => { if (d.mode.newNode()) { clearQuery(); render(); d.afterNavigate?.(); } });
    li.appendChild(b);
    return li;
  }
  async function onRowAction(id: string, name: string): Promise<void> {
    if (id === "up") d.mode.moveLink(name, -1);
    else if (id === "down") d.mode.moveLink(name, 1);
    else if (id === "unlink") d.mode.removeLink(name);
    else if (id === "delete") {
      if (await openConfirmSheet(t("edge.deleteTitle", { name: nodeDisplayName(name) }), t("edge.deleteMsg"), { danger: true, okLabel: t("edge.delete") })) d.mode.deleteNode(name);
    }
    render();
  }
  function clearQuery(): void { query = ""; search.value = ""; backlinksOpen = false; }
  function render(): void {
    closePopupMenu();
    const m = d.mode;
    pane.hidden = !m.active();
    if (!m.active()) return;
    const cur = m.current();
    nodeEl.textContent = cur ? nodeDisplayName(cur) : "";
    projEl.textContent = m.displayName() ?? "";
    $("edgeBack").toggleAttribute("disabled", !m.canGoBack());
    $("edgeDownload").hidden = !(m.home()?.kind === "local" && d.onDownload);
    list.innerHTML = "";
    const s = m.session()!;
    if (backlinksOpen && cur) {
      const bl = s.backlinksOf(cur);
      list.appendChild(headerRow(t("edge.backlinksOf", { name: nodeDisplayName(cur) })));
      if (!bl.length) list.appendChild(emptyRow(t("edge.backlinksNone")));
      for (const n of bl) list.appendChild(row(n, {}));
      return;
    }
    if (query.length >= 1) {   // 不限字数（user 2026-09-10）：一个字就搜，能把孤儿全扫出来
      const hits = s.find(query);
      list.appendChild(headerRow(t("edge.results", { q: query })));
      if (!hits.length) list.appendChild(emptyRow(t("edge.noResults")));
      for (const n of hits) list.appendChild(row(n, {}));
      return;
    }
    const edges = s.sidebar();
    if (!edges.length) list.appendChild(emptyRow(t("edge.empty")));
    for (const e of edges) list.appendChild(row(e.name, { stub: e.stub, menu: true }));
    list.appendChild(addRow());
  }
  const headerRow = (text: string) => { const li = document.createElement("li"); li.className = "edge-row header"; li.textContent = text; return li; };
  const emptyRow = (text: string) => { const li = document.createElement("li"); li.className = "edge-row empty"; li.textContent = text; return li; };

  $("edgeLibrary").addEventListener("click", () => d.onLibrary());
  $("edgeSettings").addEventListener("click", () => d.onSettings());
  $("edgeBack").addEventListener("click", () => { if (d.mode.goBack()) { clearQuery(); render(); d.focusEditor(); d.afterNavigate?.(); } });
  search.addEventListener("input", () => { query = search.value.trim(); backlinksOpen = false; render(); });
  search.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); clearQuery(); render(); d.focusEditor(); } });
  $("edgeSpawn").addEventListener("click", () => { void d.mode.spawnFromSelection().then((ok) => { if (ok) { clearQuery(); render(); d.afterNavigate?.(); } }); });
  $("edgeLink").addEventListener("click", () => {
    void openInputSheet(t("edge.linkTitle"), { message: t("edge.linkHint"), placeholder: t("edge.namePh"), okLabel: t("common.ok") }).then((v) => {
      if (v == null || !v.trim()) return;
      if (d.mode.addLink(v)) { clearQuery(); render(); }
    });
  });
  $("edgeBacklinks").addEventListener("click", () => { backlinksOpen = !backlinksOpen; query = ""; search.value = ""; render(); });
  $("edgeDownload").addEventListener("click", () => d.onDownload?.());
  render();
  return { render, el };
}
export type EdgeSidebar = ReturnType<typeof createEdgeSidebar>;
