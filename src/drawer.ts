// 抽屉：文件列表 / 回收站 / 设置 三视图。created 2026-09-03 by Claude Fable 5.1
// 列表来自 docs.watchDocs（唯一列举面），乐观 UI 归库（delete 本地先动、云端后台），行内图标全走共享 sprite <use>。
import { t } from "./i18n/index.ts";
import { watchDocs, listTrash, restoreDoc, purgeDoc, emptyTrash, trashDoc, type DocListItem, type TrashDocItem } from "./docs.ts";
import { openConfirmSheet, withBusy } from "./sheets.ts";
import { reportError } from "./error-badge.ts";
import type { SyncState } from "@internal/store";

export type DrawerView = "closed" | "active" | "trash" | "settings";
export interface DrawerDeps {
  drawer: HTMLElement; backdrop: HTMLElement; title: HTMLElement; backButton: HTMLElement;
  docList: HTMLElement; docListEmpty: HTMLElement; docActions: HTMLElement; trashActions: HTMLElement; settingsView: HTMLElement;
  activeName: () => string | null;
  onOpenDoc: (name: string) => Promise<void>;
  /** 当前稿被移入回收站/改名后：编辑器清空或切稿。 */
  onActiveTrashed: () => Promise<void>;
  onSettingsShown: () => void;
  focusEditor: () => void;
  setStatus: (text: string, opts?: { error?: boolean }) => void;
}

const icon = (id: string, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

function syncLabel(s: SyncState): string {
  switch (s) {
    case "synced": return t("sync.synced");
    case "unpushed": return t("sync.unpushed");
    case "cloud-only": return t("sync.cloudOnly");
    case "local-only": return t("sync.localOnly");
    case "newer-on-cloud": return t("sync.newerOnCloud");
    case "conflict": return t("sync.conflict");
    case "ghost": return t("sync.ghost");
    case "pendingGone": return t("sync.pendingGone");
    case "float": return t("sync.float");
    default: return s;
  }
}
function fmtTs(ts: string | null): string {
  if (!ts || ts.length < 12) return "";
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(8, 10)}:${ts.slice(10, 12)}`;
}

export function createDrawer(d: DrawerDeps) {
  let view: DrawerView = "closed";
  let items: DocListItem[] = [];
  let frameComplete = true;
  let unsub: (() => void) | null = null;

  function subscribe(): void {
    unsub?.();
    unsub = watchDocs((frame) => { items = frame.items; frameComplete = frame.complete; if (view === "active") renderList(); },
      { onError: (err, phase) => reportError(new Error(`doc list frame failed (${phase}): ${err instanceof Error ? err.message : String(err)}`), "log") });
  }

  function renderList(): void {
    const list = d.docList; list.innerHTML = "";
    if (!items.length) { d.docListEmpty.textContent = frameComplete ? t("list.empty") : t("list.loading"); d.docListEmpty.classList.remove("hidden"); return; }
    d.docListEmpty.classList.add("hidden");
    const active = d.activeName();
    for (const it of items) {
      const li = document.createElement("li");
      li.className = "doc-row" + (it.name === active ? " active" : "");
      const main = document.createElement("button");
      main.type = "button"; main.className = "doc-main";
      const nameRow = document.createElement("span"); nameRow.className = "doc-name-row";
      if (it.encrypted) { const pre = document.createElement("span"); pre.className = "doc-crypto-prefix"; pre.innerHTML = icon("lock"); nameRow.appendChild(pre); }
      const nameSpan = document.createElement("span");
      nameSpan.className = "doc-name" + (it.title ? "" : " untitled") + (it.syncState === "ghost" || it.syncState === "pendingGone" ? " ghost" : "") + (it.syncState === "cloud-only" ? " stub" : "") + (it.syncState === "local-only" ? " local-only" : "");
      nameSpan.textContent = it.stem;
      nameRow.appendChild(nameSpan);
      main.appendChild(nameRow);
      const meta = document.createElement("span"); meta.className = "doc-preview";
      meta.textContent = [syncLabel(it.syncState), it.size != null ? `${(it.size / 1024).toFixed(it.size < 10240 ? 1 : 0)} KB` : ""].filter(Boolean).join(" · ");
      main.appendChild(meta);
      main.addEventListener("click", () => { void d.onOpenDoc(it.name).then(close); });
      li.appendChild(main);
      const actions = document.createElement("div"); actions.className = "doc-row-actions";
      const trashBtn = document.createElement("button");
      trashBtn.type = "button"; trashBtn.className = "row-icon-button danger"; trashBtn.title = t("list.toTrash"); trashBtn.setAttribute("aria-label", t("list.toTrash"));
      trashBtn.innerHTML = icon("trash-can");
      trashBtn.addEventListener("click", () => { void onTrash(it.name); });
      actions.appendChild(trashBtn);
      li.appendChild(actions);
      list.appendChild(li);
    }
  }

  async function onTrash(name: string): Promise<void> {
    const wasActive = d.activeName() === name;
    if (wasActive) await d.onActiveTrashed();   // 先让编辑器放手（flush + 清空），再让库 move-aside
    try {
      const r = await trashDoc(name);
      if (r.status === "cancelled") { d.setStatus(t("st.cancelled")); return; }
      d.setStatus(t("st.movedToTrash", { name: name.replace(/\.txt$/i, "") }) + (r.queuedCloudDelete === false ? t("st.cloudCopyStillThere") : ""));
    } catch (e) { reportError(e); d.setStatus(t("st.trashFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
  }

  async function renderTrash(): Promise<void> {
    const list = d.docList; list.innerHTML = "";
    d.docListEmpty.textContent = t("list.loading"); d.docListEmpty.classList.remove("hidden");
    let rows: TrashDocItem[] = [];
    try { rows = await listTrash(); } catch (e) { reportError(e); }
    if (view !== "trash") return;
    list.innerHTML = "";
    if (!rows.length) { d.docListEmpty.textContent = t("trash.empty"); return; }
    d.docListEmpty.classList.add("hidden");
    for (const it of rows) {
      const li = document.createElement("li"); li.className = "doc-row";
      const main = document.createElement("div"); main.className = "doc-main static";
      const nameRow = document.createElement("span"); nameRow.className = "doc-name-row";
      if (it.encrypted) { const pre = document.createElement("span"); pre.className = "doc-crypto-prefix"; pre.innerHTML = icon("lock"); nameRow.appendChild(pre); }
      const nameSpan = document.createElement("span"); nameSpan.className = "doc-name"; nameSpan.textContent = it.stem; nameRow.appendChild(nameSpan);
      main.appendChild(nameRow);
      const meta = document.createElement("span"); meta.className = "doc-preview";
      meta.textContent = [fmtTs(it.ts), it.side === "both" ? t("trash.sideBoth") : it.side === "cloud" ? t("trash.sideCloud") : t("trash.sideLocal"), it.conflictLive ? t("trash.conflictLive") : ""].filter(Boolean).join(" · ");
      main.appendChild(meta);
      li.appendChild(main);
      const actions = document.createElement("div"); actions.className = "doc-row-actions";
      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button"; restoreBtn.className = "row-icon-button"; restoreBtn.title = t("trash.restore"); restoreBtn.setAttribute("aria-label", t("trash.restore"));
      restoreBtn.innerHTML = icon("restore-trash");
      restoreBtn.addEventListener("click", () => { void onRestore(it); });
      const purgeBtn = document.createElement("button");
      purgeBtn.type = "button"; purgeBtn.className = "row-icon-button danger"; purgeBtn.title = t("trash.purge"); purgeBtn.setAttribute("aria-label", t("trash.purge"));
      purgeBtn.innerHTML = icon("x");
      purgeBtn.addEventListener("click", () => { void onPurge(it); });
      actions.append(restoreBtn, purgeBtn);
      li.appendChild(actions);
      list.appendChild(li);
    }
  }
  async function onRestore(it: TrashDocItem): Promise<void> {
    try {
      const name = await withBusy(t("busy.restoring", { name: it.stem }), () => restoreDoc(it));
      d.setStatus(name !== it.name ? t("st.restoredRenamed", { name: name.replace(/\.txt$/i, "") }) : t("st.restored", { name: it.stem }));
    } catch (e) { reportError(e); d.setStatus(t("st.restoreFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
    await renderTrash();
  }
  async function onPurge(it: TrashDocItem): Promise<void> {
    if (!(await openConfirmSheet(t("trash.purgeTitle", { name: it.stem }), t("trash.purgeMsg"), { danger: true, okLabel: t("trash.purge") }))) return;
    try { await withBusy(t("busy.purging", { name: it.stem }), () => purgeDoc(it)); d.setStatus(t("st.purged", { name: it.stem })); }
    catch (e) { reportError(e); d.setStatus(t("st.purgeFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
    await renderTrash();
  }
  async function onEmptyTrash(): Promise<void> {
    if (!(await openConfirmSheet(t("trash.emptyTitle"), t("trash.emptyMsg"), { danger: true, okLabel: t("trash.emptyAction") }))) return;
    try { const n = await withBusy(t("busy.emptyingTrash"), () => emptyTrash()); d.setStatus(t("st.trashEmptied", { n })); }
    catch (e) { reportError(e); d.setStatus(t("st.purgeFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
    await renderTrash();
  }

  function open(next: Exclude<DrawerView, "closed"> = "active"): void {
    view = next;
    d.drawer.classList.remove("hidden"); d.drawer.setAttribute("aria-hidden", "false"); d.backdrop.classList.remove("hidden");
    const isSettings = next === "settings", isTrash = next === "trash";
    d.title.textContent = isSettings ? t("drawer.settings") : isTrash ? t("drawer.trash") : t("drawer.files");
    d.backButton.hidden = next === "active";
    d.docActions.classList.toggle("hidden", isTrash || isSettings);
    d.trashActions.classList.toggle("hidden", !isTrash);
    d.settingsView.hidden = !isSettings;
    d.docList.hidden = isSettings;
    if (isSettings) { d.docListEmpty.classList.add("hidden"); d.onSettingsShown(); return; }
    if (isTrash) { void renderTrash(); return; }
    renderList();
  }
  function close(): void {
    view = "closed";
    d.drawer.classList.add("hidden"); d.drawer.setAttribute("aria-hidden", "true"); d.backdrop.classList.add("hidden");
    d.focusEditor();
  }
  function refresh(): void { if (view === "active") renderList(); else if (view === "trash") void renderTrash(); }

  return { open, close, refresh, subscribe, onEmptyTrash, currentView: () => view, items: () => items,
    findByName: (name: string) => items.find((it) => it.name === name) ?? null };
}
export type Drawer = ReturnType<typeof createDrawer>;
