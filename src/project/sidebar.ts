// 侧栏（☰ 唯一入口）：顶部两个入口（书库 / 设置）+ 书内导航 = **当前页的邻域**（ADR-0014 §7 反清单化：不铺整棵树、不画第三层）：
//   `..`（父；顶层 = 书，不可点）→ 兄弟（当前页高亮）→ 子节 → 链接（出边，手排）→ 谁指向这里（反链 = 查询）。散页没有 ../兄弟/子节，只有链接 + 「+ 子节」（链出去）。
// created 2026-09-10 by Claude Fable 5.1；同日晚按 user 打回重做（「editor sidebar 只有一个三条杠」「侧栏不应默认开」「检索不限字数」「还是不显示扩展名吧」「分裂选中 连接已有 指向这里这三个先去掉」）；
//   深夜 v2 树 session 接入邻域（user「树重新变成清单 → 看到的是 sibling 和一个 ..」「上一章下一章就是对主树做 dfs」）。
// 行菜单：树行 = 上移 / 下移 / 升级 / 降级 / 移出树 / 废弃 / 导出这一支；链接行 = 上移 / 下移 / 归档到这页之后·之下（目标是散页时）/ 断开链接 / 废弃；入边行 = 断开；检索里的 `_废-` 页 = 彻底删除。
//   删除模型三动词各归一层、无引用计数无孤儿（user 2026-09-10 深夜「不同意引用计数，那又是 cleverness. 删除是一个不同的语义」；ADR-0014 §8）。
// 零态度：无全图、无计数、无衰减。页改名不在这里（章节名框，mode.ts）。
import type { ProjectMode } from "./mode.ts";
import { nodeDisplayName } from "./naming.ts";
import { nodeKind } from "./format.ts";
import { t } from "../i18n/index.ts";
import { togglePopupMenu, closePopupMenu, type PopupMenuItem } from "../ui/popup-menu.ts";
import { openConfirmSheet } from "../sheets.ts";

export interface EdgeSidebarDeps {
  el: HTMLElement;
  mode: ProjectMode;
  setStatus: (text: string, opts?: { error?: boolean }) => void;
  focusEditor: () => void;
  /** 顶部两个入口。 */
  onLibrary: () => void;
  onSettings: () => void;
  /** 「+ 兄弟」「+ 子节」（问名字 → mode.newSibling / newChild；散页上的子节 = 链出去）。返回 true = 已建/已跳。 */
  onAddSibling: () => Promise<boolean>;
  onAddChild: () => Promise<boolean>;
  /** 「导出这一支…」（app 层：问名字 → 落库 / 下载）。 */
  onExportBranch: (name: string) => Promise<void>;
  /** txt 模式：把这篇草稿变成书（user 2026-09-10）。canLift = 有正文可 lift。 */
  onLift: () => Promise<boolean>;
  canLift: () => boolean;
  /** 无地的书：「下载一份」入口（store 的书不显示）。 */
  onDownload?: () => void;
}
type Block = "parent" | "siblings" | "children" | "links" | "incoming" | "results";
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** 页时间戳的短显示：今年 → M/D HH:mm；别的年 → YYYY/M/D。0 = 不知道 → 空。 */
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
        <button type="button" class="row-icon-button edge-forward" id="edgeForward" title="${esc(t("edge.forward"))}" aria-label="${esc(t("edge.forward"))}">${icon("forward")}</button>
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

  /** 一行 = 一页：点 = 跳；`block` 决定行菜单。 */
  function row(name: string, block: Block): HTMLLIElement {
    const li = document.createElement("li"); li.className = "edge-row" + (name === d.mode.current() ? " current" : ""); li.dataset.block = block; li.dataset.name = name;
    const main = document.createElement("button"); main.type = "button"; main.className = "edge-main";
    const shown = nodeDisplayName(name);
    const meta = d.mode.session()?.project.nodes.get(name);
    main.title = meta ? t("edge.times", { created: fmtTime(meta.created), modified: fmtTime(meta.modified) }) : shown;
    const kindIcon = nodeKind(name) === "image" ? `<svg class="ico edge-kind" aria-hidden="true"><use href="#image"/></svg>` : "";   // 图片页行首图标（2.1）
    main.innerHTML = kindIcon + `<span class="edge-name">${esc(shown)}</span>` + (meta && meta.modified ? `<span class="edge-sub">${esc(fmtTime(meta.modified))}</span>` : "");   // 同一行小字 = 修改时间（user 2026-09-10）
    main.addEventListener("click", () => { d.mode.jump(name); clearQuery(); d.focusEditor(); });   // 不自动收（user 2026-09-10「进节点的时候也不要自动弹回」）
    li.appendChild(main);
    const items = menuItems(name, block);
    if (items.length) {
      const more = document.createElement("button"); more.type = "button"; more.className = "row-icon-button edge-more"; more.title = t("edge.more"); more.setAttribute("aria-label", t("edge.more")); more.innerHTML = icon("more");
      more.addEventListener("click", (e) => { e.stopPropagation(); togglePopupMenu({ anchor: more, align: "left", items: () => menuItems(name, block), onPick: (id) => { void onRowAction(id, name); } }); });
      li.appendChild(more);
    }
    return li;
  }
  /** 行菜单。修改锁 / 加密未解锁 / 格式太新 → 改动项全灰（导出仍可用）：UI 只画灰，判定在 session（user「不要 ad hoc add hooks」）。 */
  function menuItems(name: string, block: Block): PopupMenuItem[] {
    const m = d.mode; const cur = m.current(); const ro = !m.canEdit();
    const grey = (items: PopupMenuItem[]) => items.map((it) => (it.id === "export" ? it : { ...it, disabled: ro }));
    return grey(rawMenuItems(name, block, cur));
  }
  function rawMenuItems(name: string, block: Block, cur: string | null): PopupMenuItem[] {
    const m = d.mode;
    if (block === "results") return m.isDiscarded(name) ? [{ id: "purge", label: t("edge.purge"), icon: "trash-can", danger: true }] : [];   // 检索结果里的 `_废-` 页：彻底删除（弹 sheet 写明有几页链接到它）
    if (block === "incoming") return [{ id: "cut", label: t("edge.cutIncoming"), icon: "x" }];   // 入边：断开（user「显示入度的时候需要加一个删除入度边的功能」）
    if (block === "links") {
      const items: PopupMenuItem[] = [{ id: "lup", label: t("edge.up") }, { id: "ldown", label: t("edge.down") }];
      if (cur && m.isInTree(cur) && !m.isInTree(name)) items.push({ id: "after", label: t("edge.archiveAfter"), separatorBefore: true }, { id: "under", label: t("edge.archiveUnder") });   // 散页归档进主干（ADR-0014 §8）
      items.push({ id: "unlink", label: t("edge.unlink"), icon: "x", separatorBefore: true }, { id: "discard", label: t("edge.discard"), icon: "trash-can", danger: true });   // 断开链接 = 只删这一条边；废弃 = 改名 _废-（+ 子树出树）
      return items;
    }
    if (block === "parent") return [{ id: "export", label: t("edge.exportBranch"), icon: "download" }];
    return [   // 树行（兄弟 / 子节）：树移动六件 + 导出这一支
      { id: "up", label: t("edge.up") }, { id: "down", label: t("edge.down") }, { id: "outdent", label: t("edge.outdent") }, { id: "indent", label: t("edge.indent") },
      { id: "detach", label: t("edge.detach"), icon: "x", separatorBefore: true }, { id: "discard", label: t("edge.discard"), icon: "trash-can", danger: true },
      { id: "export", label: t("edge.exportBranch"), icon: "download", separatorBefore: true },
    ];
  }
  function addRow(id: "edgeAddSibling" | "edgeAddChild", label: string, onClick: () => Promise<boolean>): HTMLLIElement {
    const li = document.createElement("li"); li.className = "edge-row add";
    const b = document.createElement("button"); b.type = "button"; b.className = "edge-main edge-add"; b.id = id; b.title = label;
    b.innerHTML = `${icon("new")}<span class="edge-name">${esc(label)}</span>`;
    b.addEventListener("click", () => { void onClick().then((ok) => { if (ok) { clearQuery(); render(); } }); });
    li.appendChild(b);
    return li;
  }
  async function onRowAction(id: string, name: string): Promise<void> {
    const m = d.mode;
    if (id === "cut") { if (m.cutIncoming(name)) d.setStatus(t("edge.cutDone", { name: nodeDisplayName(name) })); }
    else if (id === "lup") m.moveLink(name, -1);
    else if (id === "ldown") m.moveLink(name, 1);
    else if (id === "up" || id === "down" || id === "outdent" || id === "indent") m.treeMove(name, id);
    else if (id === "detach") { if (m.detachFromTree(name)) { const n = m.lastDetached(); d.setStatus(n ? t("edge.detached", { name: nodeDisplayName(name), n }) : t("edge.detachedLeaf", { name: nodeDisplayName(name) })); } }
    else if (id === "unlink") { if (m.removeLink(name)) d.setStatus(t("edge.unlinked", { name: nodeDisplayName(name) })); }
    else if (id === "discard") {
      const n = m.subtreeCount(name); const prefix = t("edge.discardPrefix");
      if (await openConfirmSheet(n ? t("edge.discardTitleTree", { name: nodeDisplayName(name), n }) : t("edge.discardTitle", { name: nodeDisplayName(name) }), n ? t("edge.discardMsgTree", { prefix, n }) : t("edge.discardMsg", { prefix }), { danger: true, okLabel: t("edge.discard") }) && m.discardPage(name)) {
        const r = m.lastDiscarded(); const first = r[0];
        d.setStatus(n ? t("edge.discardedTree", { name: nodeDisplayName(name), n, prefix }) : t("edge.discarded", { from: nodeDisplayName(first?.from ?? name), to: nodeDisplayName(first?.to ?? name) }));
      }
    }
    else if (id === "after") { if (m.archiveAfterCurrent(name)) d.setStatus(t("edge.archived", { name: nodeDisplayName(name) })); }
    else if (id === "under") { if (m.archiveUnderCurrent(name)) d.setStatus(t("edge.archived", { name: nodeDisplayName(name) })); }
    else if (id === "export") { await d.onExportBranch(name); }
    else if (id === "purge") {
      if (!m.isDiscarded(name)) { d.setStatus(t("edge.notDiscarded", { prefix: t("edge.discardPrefix") }), { error: true }); }
      else { const n = m.backlinksOfPage(name).length; if (await openConfirmSheet(t("edge.purgeTitle", { name: nodeDisplayName(name) }), n ? t("edge.purgeMsg", { n }) : t("edge.purgeMsgNoLinks"), { danger: true, okLabel: t("edge.purge") })) m.purgePage(name); }
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
    $("edgeForward").toggleAttribute("disabled", !m.canGoForward());
    const canDownload = m.home()?.kind === "local" && !!d.onDownload;
    $("edgeDownload").hidden = !canDownload; $("edgeFoot").hidden = !canDownload;
    list.innerHTML = "";
    const s = m.session()!;
    if (query.length >= 1) {   // 不限字数（user 2026-09-10）：一个字就搜，能把孤儿全扫出来
      const hits = s.find(query);
      list.appendChild(headerRow(t("edge.results", { q: query })));
      if (!hits.length) list.appendChild(emptyRow(t("edge.noResults")));
      for (const n of hits) list.appendChild(row(n, "results"));
      return;
    }
    const nb = s.neighborhood();
    if (!nb.current) return;
    if (nb.inTree) {
      // `..`：父页（可点）；顶层 = 书（不可点，user「看到的是 sibling 和一个 ..」）
      list.appendChild(parentRow(nb.parent));
      list.appendChild(headerRow(t("edge.siblings")));
      for (const n of nb.siblings) list.appendChild(row(n, "siblings"));
      list.appendChild(addRow("edgeAddSibling", t("edge.addSibling"), d.onAddSibling));
      list.appendChild(headerRow(t("edge.children")));
      for (const n of nb.children) list.appendChild(row(n, "children"));
      list.appendChild(addRow("edgeAddChild", t("edge.addChild"), d.onAddChild));
    }   // 散页：不画 ../兄弟/子节，也不画说明（user 2026-09-10「散页：不在书的主干里…这种说明也不要」）；只有链接 + 「+ 子节」+ 谁指向这里
    list.appendChild(headerRow(t("edge.links")));
    if (!nb.links.length) list.appendChild(emptyRow(t("edge.noLinks")));
    for (const n of nb.links) list.appendChild(row(n, "links"));
    if (!nb.inTree) list.appendChild(addRow("edgeAddChild", t("edge.addChild"), d.onAddChild));   // 散页上只有「+ 子节」= 链出去的新散页（引用层，保持现状语义）
    if (nb.incoming.length) { list.appendChild(headerRow(t("edge.backlinks"))); for (const n of nb.incoming) list.appendChild(row(n, "incoming")); }   // 入度：谁指向这里（有才显示，零态度）
  }
  /** `..` 行：父页可点跳上去；顶层 = 书名不可点。 */
  function parentRow(parent: string | null): HTMLLIElement {
    const li = document.createElement("li"); li.className = "edge-row parent" + (parent ? "" : " root"); li.dataset.block = "parent"; if (parent) li.dataset.name = parent;
    const main = document.createElement("button"); main.type = "button"; main.className = "edge-main"; main.id = "edgeParent";
    const shown = parent ? nodeDisplayName(parent) : (d.mode.displayName() ?? t("edge.root"));
    main.title = parent ? t("edge.parentTitle", { name: shown }) : t("edge.rootTitle");
    main.innerHTML = `<span class="edge-dots" aria-hidden="true">..</span><span class="edge-name">${esc(shown)}</span>`;
    if (parent) main.addEventListener("click", () => { d.mode.jump(parent); clearQuery(); d.focusEditor(); });
    else { main.disabled = true; main.setAttribute("aria-disabled", "true"); }
    li.appendChild(main);
    if (parent) {
      const more = document.createElement("button"); more.type = "button"; more.className = "row-icon-button edge-more"; more.title = t("edge.more"); more.setAttribute("aria-label", t("edge.more")); more.innerHTML = icon("more");
      more.addEventListener("click", (e) => { e.stopPropagation(); togglePopupMenu({ anchor: more, align: "left", items: () => menuItems(parent, "parent"), onPick: (id) => { void onRowAction(id, parent); } }); });
      li.appendChild(more);
    }
    return li;
  }
  const headerRow = (text: string) => { const li = document.createElement("li"); li.className = "edge-row header"; li.textContent = text; return li; };
  const emptyRow = (text: string) => { const li = document.createElement("li"); li.className = "edge-row empty"; li.textContent = text; return li; };

  $("edgeLibrary").addEventListener("click", () => d.onLibrary());
  $("edgeLift").addEventListener("click", () => { void d.onLift().then((ok) => { if (ok) render(); }); });
  $("edgeSettings").addEventListener("click", () => d.onSettings());
  $("edgeBack").addEventListener("click", () => { if (d.mode.goBack()) { clearQuery(); render(); d.focusEditor(); } });   // 不自动收（user「点 return back 的时候侧栏不应自动弹回」）
  $("edgeForward").addEventListener("click", () => { if (d.mode.goForward()) { clearQuery(); render(); d.focusEditor(); } });   // 前进 = 回退的逆（user 2026-09-10「既然有 back 了也加一个右箭头」）
  search.addEventListener("input", () => { query = search.value.trim(); render(); });
  search.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); clearQuery(); render(); d.focusEditor(); } });
  $("edgeDownload").addEventListener("click", () => d.onDownload?.());
  render();
  return { render, el };
}
export type EdgeSidebar = ReturnType<typeof createEdgeSidebar>;
