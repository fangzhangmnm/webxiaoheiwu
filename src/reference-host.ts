// 参考窗的宿主适配层（ADR-0016；2026-09-29）。created 2026-09-29 by Claude Fable 5.1
//
// 参考窗本体 = @internal/reference-window（家族共享库：牌组模型 + 默认视图）。本文件是 WXHW 里**唯一**认识那个库的地方：
//   · 注入：菜单端口（ui/popup-menu）、文案（i18n）、地板（顶栏下缘）、导入漏斗（图片走 image/ 的减肥管线，文字原样）
//   · 持久化：整个 `.webxiaoheiwu/references/` 目录（manifest.json + 字节）经库的 encodeDeck / decodeDeck 进出，本文件只搬字节
//     （mode/session 对目录零知识：保存前 collect、开书后 apply——ADR-0016）
//   · 链接卡（user 2026-09-29「link图片页和文字页…一个立绘只用存一次」）：卡上 target = "page:<页名>"，内容从书里现取，只显示不存；
//     页改了 → 重取；页改名 → target 跟着改；页删了 → 卡上如实写「内容不可用」
//   · 脏：加 / 删 / 挪卡 = 正经改动（mode.noteReferencesChanged）；翻页 / 滚动 / 字号 / 窗口位置 = 随下次保存写，不标脏（ADR-0010 口径）
//   · 清单比库新（DeckManifestTooNewError）→ 目录原样带着、保存时原样写回、状态行如实说；不吞、不猜
// 推不拉（user 2026-09-29「+里面去pull蛮akward的…在页面上加一个send to reference」）：「发到参考窗」在边栏的页行菜单里，
//   宿主直接 deck.add，库不参与；参考窗自己的 ＋ 只剩导入文件 / 粘贴（云盘项藏掉）。
import "@internal/reference-window";
import type { WpReferenceWindow, RefMenuPort } from "@internal/reference-window";
import { encodeDeck, decodeDeck, mimeForName, DeckManifestTooNewError } from "@internal/reference-window/deck";
import { togglePopupMenu } from "./ui/popup-menu.ts";
import { t } from "./i18n/index.ts";
import { reportError } from "./error-badge.ts";
import { nodeKind, nodeExt } from "./project/format.ts";
import { nodeDisplayName } from "./project/naming.ts";
import type { ProjectMode, ReferenceModeHooks } from "./project/mode.ts";
import type { RefPanelState } from "./project/format.ts";
import { slimImage, NotAnImageError } from "./image/import-image.ts";

const APP = "webxiaoheiwu";                      // 目录 = .webxiaoheiwu/references/（库按 app 名算）
const KINDS = ["image", "text"] as const;        // 这个宿主画得出来的种类；其余的库原样带着
const PAGE = "page:";                            // 链接卡的 target 前缀：书里的一页
const MIME_BY_EXT: Record<string, string> = { txt: "text/plain", md: "text/markdown", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export interface ReferenceHostDeps {
  el: WpReferenceWindow;
  fileInput: HTMLInputElement;
  setStatus: (text: string, opts?: { error?: boolean }) => void;
  /** 顶栏下缘（浮窗的出血区地板）。 */
  topFloor: () => number;
}

export function createReferenceHost(d: ReferenceHostDeps) {
  const el = d.el;
  let mode: ProjectMode | null = null;               // 晚绑：mode 建的时候要拿 hooks，hooks 又要 mode（改动标脏、取页字节）
  /** 清单比库新时整个目录原样带着（读时装下、存时原样写回），直到用户在新版里打开。null = 正常态。 */
  let carried: Map<string, Uint8Array> | null = null;
  let applying = false;                              // apply 期间牌组的 reset 不算用户改动

  // ── 注入 ──
  el.menuPort = togglePopupMenu as unknown as RefMenuPort;
  el.setAttribute("no-cloud", "");                   // 没有云盘选图（书库不是图库）
  el.labels = {
    load: t("ref.load"), paste: t("ref.paste"), oneToOne: t("ref.oneToOne"),
    del: t("ref.delete"), delConfirm: t("ref.deleteConfirm"), closeWin: t("ref.closeWin"),
    prev: t("ref.prev"), next: t("ref.next"), menu: t("ref.menu"), move: t("ref.move"), resize: t("ref.resize"), resizeAria: t("ref.resize"),
    moveEarlier: t("ref.moveEarlier"), moveLater: t("ref.moveLater"), jump: t("ref.jump"),
    kindNames: { image: t("ref.kindImage"), text: t("ref.kindText") },
    linkMissing: t("ref.linkMissing"),
  };
  const syncFloor = () => { el.topFloor = d.topFloor(); };
  window.addEventListener("resize", syncFloor);

  // ── 链接卡：内容从书里现取 ──
  el.linkProvider = (target) => {
    if (!target.startsWith(PAGE)) return null;
    const name = target.slice(PAGE.length);
    const bytes = mode?.session()?.project.contents.get(name);
    if (!bytes) return null;
    return new Blob([bytes as unknown as BlobPart], { type: MIME_BY_EXT[nodeExt(name)] ?? "" });
  };
  const cardsOfPage = (name: string) => el.deck.cards().filter((c) => c.target === PAGE + name);

  // ── 牌组变化 → 脏 / 窗口状态 ──
  el.deck.onChange((what) => {
    if (applying) return;
    if (what.type === "cards") mode?.noteReferencesChanged();
  });
  // 窗口开关 / 位置：随下次保存写，不标脏（同回退栈）
  const rememberPanel = () => {
    const st = mode?.session()?.project.editorState;
    if (!st) return;
    const r = el.rect;
    st.refPanel = { open: el.open, left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  };
  el.addEventListener("openchange", rememberPanel);
  el.addEventListener("rectchange", rememberPanel);

  // ── ＋ 菜单意图 ──
  el.addEventListener("requestload", () => { d.fileInput.value = ""; d.fileInput.click(); });
  d.fileInput.addEventListener("change", () => { const files = [...(d.fileInput.files ?? [])]; if (files.length) void importFiles(files); });
  el.addEventListener("requestpaste", () => { void pasteFromClipboard(); });
  el.addEventListener("notice", (e) => {
    const n = (e as CustomEvent).detail as { level: string; code: string; name?: string; message: string };
    reportError(new Error(`[reference] ${n.code}: ${n.name ?? ""} ${n.message}`), n.level === "error" ? "warning" : "log");
  });

  async function importFiles(files: File[]): Promise<void> {
    let added = 0;
    for (const f of files) {
      try {
        if (f.type.startsWith("text/") || /\.(txt|md)$/i.test(f.name)) { el.addText(await f.text(), { name: f.name }); added++; continue; }
        const slim = await slimImage(f, { hd: false });   // 与图片页同一条减肥管线（ADR-0013）：长边 ≤2048、JPEG q85、剥 metadata
        el.deck.add({ kind: "image", bytes: new Blob([slim.bytes as unknown as BlobPart], { type: MIME_BY_EXT[slim.ext] ?? f.type }), mime: MIME_BY_EXT[slim.ext] ?? f.type, name: f.name });
        added++;
      } catch (e) {
        if (e instanceof NotAnImageError) d.setStatus(t("ref.unsupported", { name: f.name }), { error: true });
        else { reportError(e); d.setStatus(t("ref.importFailed", { name: f.name }), { error: true }); }
      }
    }
    if (added) { el.open = true; d.setStatus(t("ref.imported", { n: added })); }
  }
  async function pasteFromClipboard(): Promise<void> {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const img = it.types.find((x) => x.startsWith("image/"));
        if (img) { await importFiles([new File([await it.getType(img)], "clipboard." + (img.split("/")[1] ?? "png"), { type: img })]); return; }
        if (it.types.includes("text/plain")) { const text = await (await it.getType("text/plain")).text(); if (text.trim()) { el.addText(text, { name: "" }); el.open = true; return; } }
      }
      d.setStatus(t("ref.pasteEmpty"), { error: true });
    } catch (e) {
      // 没有 clipboard.read（Firefox / 权限拒）→ 退到只读文字
      try { const text = await navigator.clipboard.readText(); if (text.trim()) { el.addText(text, { name: "" }); el.open = true; return; } } catch { /* fallthrough */ }
      reportError(e, "log"); d.setStatus(t("ref.pasteEmpty"), { error: true });
    }
  }

  // ── 对外：推（边栏「发到参考窗」）/ 开关 ──
  /** 把书里的一页发到参考窗：链接卡（不复制字节）。已有同一页的卡 → 翻过去。 */
  function sendPage(name: string): void {
    const kind = nodeKind(name) === "image" ? "image" : nodeKind(name) === "txt" ? "text" : null;
    if (!kind) { d.setStatus(t("ref.unsupported", { name }), { error: true }); return; }
    const had = cardsOfPage(name)[0];
    if (had) el.deck.select(el.deck.indexOf(had.id));
    else el.deck.add({ kind, target: PAGE + name, name: nodeDisplayName(name) });
    el.open = true;
    rememberPanel();
  }
  function toggle(): void { el.open = !el.open; if (el.open) syncFloor(); rememberPanel(); }

  // ── mode 钩子（ADR-0016）──
  const hooks: ReferenceModeHooks = {
    async collect() {
      if (carried) return carried;
      const out = new Map<string, Uint8Array>();
      for (const [path, blob] of encodeDeck(el.deck.snapshot(), { app: APP })) out.set(path, new Uint8Array(await blob.arrayBuffer()));
      return out;
    },
    apply(files) {
      carried = null;
      applying = true;
      void (async () => {
        try {
          const decoded = await decodeDeck({
            app: APP, knownKinds: KINDS,
            getFile: (path) => { const b = files.get(path); return b ? new Blob([b as unknown as BlobPart], { type: mimeForName(path) }) : null; },
          });
          el.deck.restore(decoded);
        } catch (e) {
          if (e instanceof DeckManifestTooNewError) {
            carried = files;
            el.deck.clear();
            d.setStatus(t("ref.tooNew", { file: String(e.fileVersion), lib: String(e.libVersion) }), { error: true });
            reportError(new Error(`[reference] ${e.message}; carrying the references directory untouched`), "warning");
          } else { reportError(e); el.deck.clear(); }
        } finally { applying = false; }
        const panel: RefPanelState | undefined = mode?.session()?.project.editorState.refPanel;
        if (panel) { el.rect = { left: panel.left, top: panel.top, width: panel.width, height: panel.height }; }
        el.open = !!panel?.open;
        if (el.open) syncFloor();
      })();
    },
    pageChanged(name) { for (const c of cardsOfPage(name)) el.deck.invalidate(c.id); },
    pageRenamed(from, to) {
      for (const c of cardsOfPage(from)) { el.deck.setTarget(c.id, PAGE + to); }   // setTarget 自己会通知 cards → 标脏（改名本来就是改动）
      for (const c of el.deck.cards()) if (c.target === PAGE + to && c.name === nodeDisplayName(from)) c.name = nodeDisplayName(to);
    },
  };

  return { hooks, bindMode: (m: ProjectMode) => { mode = m; }, sendPage, toggle, isOpen: () => el.open };
}
export type ReferenceHost = ReturnType<typeof createReferenceHost>;
