// 边栏 = 当前节点的出边列表（journal 2026-09-09 拍板：左栏不是 folder tree，是这个节点的边；反链是一次查询；检索至少两字、结果临时）。
// created 2026-09-10 by Claude Fable 5.1。零态度：无全图、无计数、无衰减；占位符只是虚线名字。
import type { ProjectMode } from "./mode.ts";
import { t } from "../i18n/index.ts";
import { togglePopupMenu, closePopupMenu } from "../ui/popup-menu.ts";
import { openInputSheet, openConfirmSheet } from "../sheets.ts";

export interface EdgeSidebarDeps {
  el: HTMLElement;
  mode: ProjectMode;
  setStatus: (text: string, opts?: { error?: boolean }) => void;
  focusEditor: () => void;
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
    <div class="edge-head">
      <button type="button" class="row-icon-button edge-back" id="edgeBack" title="${esc(t("edge.back"))}" aria-label="${esc(t("edge.back"))}">${icon("back")}</button>
      <div class="edge-titles"><div class="edge-node" id="edgeNode"></div><div class="edge-project" id="edgeProject"></div></div>
    </div>
    <input type="search" class="edge-search" id="edgeSearch" placeholder="${esc(t("edge.searchPh"))}" aria-label="${esc(t("edge.search"))}" autocomplete="off" />
    <ul class="edge-list" id="edgeList" role="list"></ul>
    <div class="edge-foot">
      <div class="edge-add"><input type="text" class="edge-add-input" id="edgeAddInput" placeholder="${esc(t("edge.addLinkPh"))}" aria-label="${esc(t("edge.addLink"))}" autocomplete="off" /><button type="button" class="auth-action" id="edgeAddBtn">${esc(t("edge.addLink"))}</button></div>
      <div class="edge-actions">
        <button type="button" class="auth-action" id="edgeSpawn" title="${esc(t("edge.spawnHint"))}">${icon("new")}${esc(t("edge.spawn"))}</button>
        <button type="button" class="auth-action" id="edgeBacklinks">${esc(t("edge.backlinks"))}</button>
        <button type="button" class="auth-action" id="edgeDownload" hidden>${esc(t("edge.download"))}</button>
      </div>
    </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>("#" + id)!;
  const list = $("edgeList"), nodeEl = $("edgeNode"), projEl = $("edgeProject"), search = $<HTMLInputElement>("edgeSearch"), addInput = $<HTMLInputElement>("edgeAddInput");

  function row(name: string, opts: { stub?: boolean; menu?: boolean; sub?: string }): HTMLLIElement {
    const li = document.createElement("li"); li.className = "edge-row" + (opts.stub ? " stub" : "") + (name === d.mode.current() ? " current" : "");
    const main = document.createElement("button"); main.type = "button"; main.className = "edge-main"; main.title = opts.stub ? t("edge.stub", { name }) : name;
    main.innerHTML = `<span class="edge-name">${esc(name)}</span>` + (opts.sub ? `<span class="edge-sub">${esc(opts.sub)}</span>` : "");
    main.addEventListener("click", () => { d.mode.jump(name); clearQuery(); d.focusEditor(); });
    li.appendChild(main);
    if (opts.menu) {
      const more = document.createElement("button"); more.type = "button"; more.className = "row-icon-button edge-more"; more.title = t("edge.more"); more.setAttribute("aria-label", t("edge.more")); more.innerHTML = icon("more");
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePopupMenu({ anchor: more, align: "left", items: () => [
          { id: "up", label: t("edge.up") }, { id: "down", label: t("edge.down") },
          { id: "rename", label: t("edge.rename"), icon: "edit-enabled", separatorBefore: true },
          { id: "unlink", label: t("edge.unlink"), icon: "x" },
          { id: "delete", label: t("edge.delete"), icon: "trash-can", danger: true, hidden: !!opts.stub },
        ], onPick: (id) => { void onRowAction(id, name); } });
      });
      li.appendChild(more);
    }
    return li;
  }
  async function onRowAction(id: string, name: string): Promise<void> {
    if (id === "up") d.mode.moveLink(name, -1);
    else if (id === "down") d.mode.moveLink(name, 1);
    else if (id === "unlink") d.mode.removeLink(name);
    else if (id === "rename") {
      const v = await openInputSheet(t("edge.renameTitle"), { defaultValue: name, placeholder: t("edge.namePh"), okLabel: t("common.ok") });
      if (v != null && v.trim() && v.trim() !== name) d.mode.renameNode(name, v);
    } else if (id === "delete") {
      if (await openConfirmSheet(t("edge.deleteTitle", { name }), t("edge.deleteMsg"), { danger: true, okLabel: t("edge.delete") })) d.mode.deleteNode(name);
    }
    render();
  }
  function clearQuery(): void { query = ""; search.value = ""; backlinksOpen = false; }
  function render(): void {
    closePopupMenu();
    const m = d.mode;
    if (!m.active()) { el.hidden = true; return; }
    el.hidden = false;
    const cur = m.current();
    nodeEl.textContent = cur ?? "";
    projEl.textContent = m.displayName() ?? "";
    $("edgeBack").toggleAttribute("disabled", !m.canGoBack());
    $("edgeDownload").hidden = !(m.home()?.kind === "local" && d.onDownload);
    list.innerHTML = "";
    const s = m.session()!;
    if (backlinksOpen && cur) {
      const bl = s.backlinksOf(cur);
      list.appendChild(headerRow(t("edge.backlinksOf", { name: cur })));
      if (!bl.length) list.appendChild(emptyRow(t("edge.backlinksNone")));
      for (const n of bl) list.appendChild(row(n, {}));
      return;
    }
    if (query.length >= 2) {
      const hits = s.find(query);
      list.appendChild(headerRow(t("edge.results", { q: query })));
      if (!hits.length) list.appendChild(emptyRow(t("edge.noResults")));
      for (const n of hits) list.appendChild(row(n, {}));
      return;
    }
    const edges = s.sidebar();
    if (!edges.length) { list.appendChild(emptyRow(t("edge.empty"))); return; }
    for (const e of edges) list.appendChild(row(e.name, { stub: e.stub, menu: true }));
  }
  const headerRow = (text: string) => { const li = document.createElement("li"); li.className = "edge-row header"; li.textContent = text; return li; };
  const emptyRow = (text: string) => { const li = document.createElement("li"); li.className = "edge-row empty"; li.textContent = text; return li; };

  $("edgeBack").addEventListener("click", () => { if (d.mode.goBack()) { clearQuery(); render(); d.focusEditor(); } });
  search.addEventListener("input", () => { query = search.value.trim(); backlinksOpen = false; render(); });
  search.addEventListener("keydown", (e) => { if (e.key === "Escape") { clearQuery(); render(); d.focusEditor(); } });
  const submitAdd = () => { const v = addInput.value.trim(); if (!v) return; if (d.mode.addLink(v)) { addInput.value = ""; render(); } };
  $("edgeAddBtn").addEventListener("click", submitAdd);
  addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } });
  $("edgeSpawn").addEventListener("click", () => { void d.mode.spawnFromSelection().then((ok) => { if (ok) render(); }); });
  $("edgeBacklinks").addEventListener("click", () => { backlinksOpen = !backlinksOpen; query = ""; search.value = ""; render(); });
  $("edgeDownload").addEventListener("click", () => d.onDownload?.());
  return { render, el };
}
export type EdgeSidebar = ReturnType<typeof createEdgeSidebar>;
