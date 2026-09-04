// 抽屉：文件列表 / 回收站 / 设置 三视图。created 2026-09-03 by Claude Fable 5.1
// 列表来自 docs.watchDocs（唯一列举面），乐观 UI 归库（delete 本地先动、云端后台），行内图标全走共享 sprite <use>。
import { t } from "./i18n/index.ts";
import { watchDocs, listTrash, restoreDoc, purgeDoc, emptyTrash, trashDoc, snapshotFolders, newFolder, deleteFolder, type DocListItem, type TrashDocItem } from "./docs.ts";
import { openConfirmSheet, openInputSheet, openChoiceSheet, withBusy } from "./sheets.ts";
import { joinDocPath, sanitizeFolderName } from "./doc-model.ts";
import { togglePopupMenu, closePopupMenu } from "./ui/popup-menu.ts";
import { iconHtml } from "./ui/icon.ts";
import { reportError } from "./error-badge.ts";
import type { SyncState } from "@internal/store";

export type DrawerView = "closed" | "active" | "trash" | "settings";
export interface DrawerDeps {
  drawer: HTMLElement; backdrop: HTMLElement; title: HTMLElement; backButton: HTMLElement;
  docList: HTMLElement; docListEmpty: HTMLElement; docActions: HTMLElement; trashActions: HTMLElement; settingsView: HTMLElement;
  breadcrumb: HTMLElement; newFolderButton: HTMLButtonElement;
  activeName: () => string | null;
  /** 当前稿所在夹（打开抽屉时列表跳到这里）。 */
  currentDir: () => string;
  /** 把一篇移到别的夹（当前稿由编辑器走 moveTo；其它稿 app 直接调 docs.moveDoc）。 */
  onMoveDoc: (name: string, toDir: string) => Promise<void>;
  onOpenDoc: (name: string) => Promise<void>;
  /** 当前稿被移入回收站/改名后：编辑器清空或切稿。 */
  onActiveTrashed: () => Promise<void>;
  onSettingsShown: () => void;
  focusEditor: () => void;
  setStatus: (text: string, opts?: { error?: boolean }) => void;
}

const icon = (id: string, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
// 云状态 badge（抄 WeebPaint gallery.ts ICON 表：8 态同图同色语义——conflict 琥珀、newer-on-cloud 强调色、其余灰）
const BADGE: Record<string, { icon: string; cls: string }> = {
  "synced": { icon: "cloud-synced", cls: "" },
  "unpushed": { icon: "cloud-upload", cls: "" },
  "float": { icon: "database", cls: "" },   // 游离（无云基线的本机稿，未登录时的常态）= 本机图标，同 local-only
  "cloud-only": { icon: "cloud", cls: "" },
  "local-only": { icon: "database", cls: "" },
  "newer-on-cloud": { icon: "cloud-download", cls: "b-newer" },
  "conflict": { icon: "cloud-conflict", cls: "b-conflict" },
  "ghost": { icon: "cloud-unavailable", cls: "" },
  "pendingGone": { icon: "cloud-pending", cls: "" },
};
const fmtSize = (n?: number) => (n == null ? "" : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);

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
  let folder = "";                       // 列表正看着哪个夹（"" = 根；ADR-0006 只一层）
  let folders: string[] = [];            // 当前夹的 immediate 子夹名
  let items: DocListItem[] = [];
  let frameComplete = true;
  let resolveFirst: (() => void) | null = null;
  const firstFramePromise = new Promise<void>((r) => { resolveFirst = r; });
  let unsub: (() => void) | null = null;

  function subscribe(): void {
    unsub?.();
    const mine = folder;
    unsub = watchDocs(mine, (frame) => {
      if (frame.folder !== folder) return;   // 换夹后迟到的旧帧
      items = frame.items; folders = frame.folders; frameComplete = frame.complete; resolveFirst?.(); resolveFirst = null; if (view === "active") renderList();
    }, { onError: (err, phase) => reportError(new Error(`doc list frame failed (${phase}): ${err instanceof Error ? err.message : String(err)}`), "log") });
  }
  function setFolder(f: string): void {
    if (f === folder) return;
    folder = f; items = []; folders = []; frameComplete = false;
    subscribe();
    if (view === "active") renderList();
  }
  function renderBreadcrumb(): void {
    const bc = d.breadcrumb; bc.innerHTML = "";
    bc.hidden = !folder;
    d.newFolderButton.hidden = !!folder;   // 只一层：夹里不再建夹
    if (!folder) return;
    const root = document.createElement("button"); root.type = "button"; root.className = "crumb-link"; root.innerHTML = icon("back") + t("list.root");
    root.addEventListener("click", () => setFolder(""));
    const sep = document.createElement("span"); sep.className = "crumb-sep"; sep.textContent = "›";
    const cur = document.createElement("span"); cur.className = "crumb-current"; cur.innerHTML = icon("folder-open") + folder;
    bc.appendChild(root); bc.appendChild(sep); bc.appendChild(cur);
  }

  function renderList(): void {
    closePopupMenu();
    const list = d.docList; list.innerHTML = "";
    renderBreadcrumb();
    for (const name of folders) {
      const li = document.createElement("li"); li.className = "doc-row folder-row";
      const main = document.createElement("button"); main.type = "button"; main.className = "doc-main";
      main.innerHTML = `<span class="doc-enc doc-folder-ic">${icon("folder")}</span><span class="doc-name"></span>`;
      main.querySelector(".doc-name")!.textContent = name;
      main.addEventListener("click", () => setFolder(joinDocPath(folder, name)));
      li.appendChild(main);
      const more = document.createElement("button"); more.type = "button"; more.className = "row-icon-button doc-more"; more.title = t("list.more"); more.setAttribute("aria-label", t("list.more")); more.innerHTML = icon("more");
      more.addEventListener("click", (e) => { e.stopPropagation(); togglePopupMenu({ anchor: more, items: () => [{ id: "del", label: t("folder.delete"), icon: "trash-can", danger: true }], onPick: () => { void onDeleteFolder(joinDocPath(folder, name)); } }); });
      li.appendChild(more);
      list.appendChild(li);
    }
    if (!items.length) { d.docListEmpty.textContent = frameComplete ? (folders.length ? t("list.emptyFolderDocs") : t("list.empty")) : t("list.loading"); d.docListEmpty.classList.remove("hidden"); return; }
    d.docListEmpty.classList.add("hidden");
    const active = d.activeName();
    for (const it of items) {
      const li = document.createElement("li");
      li.className = "doc-row" + (it.name === active ? " active" : "");
      const main = document.createElement("button");
      main.type = "button"; main.className = "doc-main"; main.title = it.name;
      const b = BADGE[it.syncState] ?? { icon: "cloud", cls: "" };
      main.innerHTML = (it.encrypted ? `<span class="doc-enc" title="${t("list.encrypted")}">${icon("lock")}</span>` : "")
        + `<span class="doc-name${it.syncState === "ghost" || it.syncState === "pendingGone" ? " ghost" : ""}"></span>`
        + `<span class="doc-badge ${b.cls}" title="">${iconHtml(b.icon)}</span>`;
      main.querySelector(".doc-name")!.textContent = it.stem;
      (main.querySelector(".doc-badge") as HTMLElement).title = [syncLabel(it.syncState), fmtSize(it.size)].filter(Boolean).join(" · ");
      main.addEventListener("click", () => { void d.onOpenDoc(it.name).then(close); });
      li.appendChild(main);
      const more = document.createElement("button"); more.type = "button"; more.className = "row-icon-button doc-more"; more.title = t("list.more"); more.setAttribute("aria-label", t("list.more")); more.innerHTML = icon("more");
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePopupMenu({
          anchor: more,
          items: () => [
            { id: "move", label: t("list.moveTo"), icon: "move-to-file" },
            { id: "trash", label: t("list.toTrash"), icon: "trash-can", danger: true, separatorBefore: true },
          ],
          onPick: (id) => { if (id === "move") void onMove(it); else void onTrash(it.name); },
        });
      });
      li.appendChild(more);
      list.appendChild(li);
    }
  }

  /** 新建文件夹（只在根；in-app 输入 sheet）。 */
  async function newFolderFlow(): Promise<void> {
    const raw = await openInputSheet(t("folder.newTitle"), { message: t("folder.newHint"), placeholder: t("folder.namePh"), okLabel: t("common.ok") });
    if (raw == null) return;
    const name = sanitizeFolderName(raw);
    if (!name) { d.setStatus(t("folder.badName"), { error: true }); return; }
    try { await newFolder(name); d.setStatus(t("folder.created", { name })); setFolder(name); }
    catch (e) { reportError(e); d.setStatus(t("folder.createFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
  }
  async function onDeleteFolder(path: string): Promise<void> {
    if (!(await openConfirmSheet(t("folder.deleteTitle", { name: path }), t("folder.deleteMsg"), { danger: true, okLabel: t("folder.delete") }))) return;
    try { await withBusy(t("folder.deleting"), () => deleteFolder(path)); d.setStatus(t("folder.deleted", { name: path })); }
    catch (e) { reportError(e, "warning"); d.setStatus(t("folder.deleteFailed", { e: e instanceof Error ? e.message : String(e) }), { error: true }); }
  }
  async function onMove(it: DocListItem): Promise<void> {
    let all: string[] = [];
    try { all = await snapshotFolders(""); } catch (e) { reportError(e, "log"); }
    const choices = [...(it.dir ? [{ label: t("list.root"), value: "" }] : []), ...all.filter((f) => f !== it.dir).map((f) => ({ label: f, value: f }))];
    if (!choices.length) { d.setStatus(t("move.noTarget")); return; }
    const to = await openChoiceSheet<string>(t("move.title"), t("move.msg", { name: it.stem }), choices);
    if (to == null) return;
    await d.onMoveDoc(it.name, to);
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
    const wasClosed = view === "closed";
    view = next;
    if (next === "active" && wasClosed) { const dir = d.currentDir(); if (dir !== folder) setFolder(dir); else subscribe(); }   // 每次打开 = 重订（拉一帧云端最新；user 2026-09-03「文件夹页没有自动更新」）   // 打开抽屉 = 看当前稿所在的夹
    d.breadcrumb.hidden = next !== "active" || !folder;
    d.newFolderButton.hidden = next !== "active" || !!folder;
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
    closePopupMenu();
    view = "closed";
    d.drawer.classList.add("hidden"); d.drawer.setAttribute("aria-hidden", "true"); d.backdrop.classList.add("hidden");
    d.focusEditor();
  }
  function refresh(): void { if (view === "active") renderList(); else if (view === "trash") void renderTrash(); }

  return { open, close, refresh, subscribe, onEmptyTrash, currentView: () => view, items: () => items, firstFrame: () => firstFramePromise, currentFolder: () => folder, setFolder, newFolder: newFolderFlow,
    findByName: (name: string) => items.find((it) => it.name === name) ?? null };
}
export type Drawer = ReturnType<typeof createDrawer>;
