// 图库屏（@internal/gallery 的 WXHW 消费面）：card view 独立一屏，替代抽屉的文件列表（user 2026-09-09「gallery 应该和 weebpaint 一样是一个独立的、不依赖于 editor 的东西」）。
// created 2026-09-10 by Claude Fable 5.1。包出屏幕 + 动词 + 数据面；本文件只出：Vue 注入、DocHost（编辑器端口）、policy（两档扩展名、身份=全名、缩略图 = 书的 Thumbnails/thumbnail.png 尾读，2.1）、
//   加密适配（crypto-state）、chrome 按钮（返回 / 新建 / 回收站 / 设置）。文案 = 包内 zh/en 默认（按 lang 切）。
import { createApp, defineComponent, reactive, ref, computed, watch, onMounted, onUnmounted, nextTick } from "../vendor/vue/vue.esm-browser.prod.js";
import { createGallery, fetchZipEntryThumb, type CreateGalleryDeps, type GalleryDocHost, type GalleryEncryption, type VueRuntime, type GItem, type VerbStore, type DataFaceStore, type Gallery, type PeekableFile } from "@internal/gallery";
import { requireStore, auth } from "./app-store.ts";
import { appEncryption } from "./encryption.ts";
import { THUMBNAIL_ENTRY } from "./project/format.ts";
import { docKind, parseDocName } from "./doc-model.ts";
import { isDocEncrypted } from "./docs.ts";
import { isUnlocked, onLockChange, currentPassword, setCurrentPassword, hasVerifier, resetVerifier } from "./crypto-state.ts";
import { openConfirmSheet, openInputSheet, openChoiceSheet, withBusy } from "./sheets.ts";
import { iconHtml } from "./ui/icon.ts";
import { deviceKvGet, deviceKvSet } from "./device-kv.ts";
import { reportError } from "./error-badge.ts";
import { lang, t } from "./i18n/index.ts";

export interface GalleryHostDeps {
  mountEl: HTMLElement;
  fullEl: HTMLElement;              // #galleryFull（独立一屏容器）
  activeName: () => string | null;
  isDirty: () => boolean;
  /** 打开任一身份（txt / 工程）。返回 true = 编辑器已切过去。 */
  openAny: (name: string, opts?: { promptUnlock?: boolean }) => Promise<boolean>;
  renameActive: () => Promise<void>;
  pushNow: () => Promise<void>;
  flushLocal: () => Promise<void>;
  ensureUnlocked: () => Promise<boolean>;
  setStatus: (text: string, opts?: { error?: boolean }) => void;
  /** 「上次在哪个夹」跟着编辑器走（打开图库时跳到当前稿的夹）。 */
  currentDir: () => string;
  onOpened?: () => void;
  onClosed?: () => void;
}
const KV_FOLDER = "gallery-folder";
/** 上次离开时在哪个场景（WeebPaint 行为：从书库出 → 回来在书库；从编辑器出 → 回来在编辑器；user 2026-09-10「书库里面 refresh 时还是会进写作」）。 */
const KV_SCENE = "last-scene";
const GALLERY_TEXT_OVERRIDES: Record<string, Parameters<typeof t>[0]> = {
  "gal.empty.none": "galx.emptyNone", "gal.empty.folder": "galx.emptyFolder", "gal.empty.trash": "galx.emptyTrash",
  "gal.firstFrameFailed": "galx.firstFrameFailed", "gal.firstFrameTimeout": "galx.firstFrameTimeout", "gal.st.openActive": "galx.openActive",
  "gs.folderNeedSignin": "galx.folderNeedSignin", "gs.quotaCritical": "galx.quotaCritical",
  "gal.tile.active": "galx.tileActive",   // 「编辑中」→「打开中」（user 2026-09-10「退进图库的话不应该还是编辑中吧」：退到书库那篇已落盘，标记只说明返回会回到它）
};
/** 封面尾读（ADR-0012）：Thumbnails/thumbnail.png 是书 zip 的最后一个 entry；尾窗 128 KB（300 页的书 central directory 约 30 KB + 封面 ≤70 KB 一次命中）。 */
const THUMB_PEEK_BYTES = 128 * 1024;
const THUMB_DB = "webxiaoheiwu-thumbs";   // 派生缓存 IDB（user 2026-09-10「weebpaint 不是一直 idb 的吗」= 批）；CLAUDE.md 持久层白名单表登记
/** 身份 = 全名（两档扩展名都进身份）；显示 = stem（ADR-0007：文件名是管理句柄，图库卡片显示去扩展名的那截）。 */
const NAMING = { bare: (s: string) => s, full: (b: string) => b, display: (n: string) => parseDocName(n).stem };

export function initGalleryHost(d: GalleryHostDeps) {
  const vue = { createApp, defineComponent, reactive, ref, computed, watch, onMounted, onUnmounted, nextTick } as unknown as VueRuntime;
  const isProjectName = (n: string) => docKind(n) === "project";
  const storeFace = (): (VerbStore & DataFaceStore) | null => {
    let s: ReturnType<typeof requireStore>;
    try { s = requireStore(); } catch { return null; }
    return s as unknown as VerbStore & DataFaceStore;   // 结构兼容（file/files 子集）；包对 store 的要求 = 提案 §2 StoreFace
  };
  const doc: GalleryDocHost = {
    open: async (item: GItem) => { const ok = await d.openAny(item.name, { promptUnlock: true }); if (ok) close(); },
    renameActive: async () => { await d.renameActive(); return d.activeName(); },
    setName: () => { /* 活动稿被图库移动：openAny(新名) 由 verbs 的 move 之后 reload 触发不了——这里重开 */ },
    push: async () => { await d.pushNow(); },
    unload: async (item: GItem) => { try { await (requireStore().file(item.name, { isZip: isProjectName(item.name), mode: "existing" }) as unknown as { offload(): Promise<unknown> }).offload(); } catch (e) { reportError(e, "warning"); } },
    exit: async () => { await d.flushLocal(); },
    dropCheckpoint: () => {},
  };
  const zipFile = (name: string) => requireStore().file(name, { isZip: true, mode: "existing" });
  const encryption: GalleryEncryption = {
    isUnlocked, onLockChange: (cb) => { onLockChange(cb); },
    // 加密书的封面 = store 封的密文 peek 尾片（makePeek 抽的），锁着只能拿密文；解锁后内存密码非交互解（抄 WeebPaint enc-thumbs）
    isEncryptedPeekBlob: (b) => b.type === appEncryption.ENC_PEEK_MIME,
    localPeekThumb: async (name) => { if (!isProjectName(name)) return null; try { const f = zipFile(name); const enc = await f.getPeek({ bytesLength: THUMB_PEEK_BYTES, zipEntry: THUMBNAIL_ENTRY, source: "local" }); return enc ? await f.decryptPeek(enc) : null; } catch (e) { reportError(e, "log"); return null; } },
    decryptCloudPeekThumb: async (name, enc) => { try { return await zipFile(name).decryptPeek(enc); } catch (e) { reportError(e, "log"); return null; } },
    isEncrypted: (name) => isDocEncrypted(name),
    ensureUnlocked: () => d.ensureUnlocked(),
    ensureNewPassword: async () => ((await d.ensureUnlocked()) ? currentPassword() : null),
    isFreshPasswordSetup: () => !hasVerifier(),
    rollbackFreshPassword: () => { try { resetVerifier(); } catch (e) { reportError(e, "log"); } },
    setPassword: (pw) => { if (pw !== currentPassword()) void setCurrentPassword(pw); },
  };
  const deps: CreateGalleryDeps = {
    vue,
    store: storeFace,
    doc,
    host: {
      signedIn: () => auth.isSignedIn(), online: () => (typeof navigator === "undefined" || navigator.onLine !== false), activeName: () => d.activeName(),
      confirm: (title, msg) => openConfirmSheet(title, msg),
      input: (title, def, opts) => openInputSheet(title, { defaultValue: def, placeholder: opts?.placeholder, okLabel: t("common.ok") }),
      chooseFolder: (title, msg, options) => openChoiceSheet<string>(title, msg, options.map((o) => ({ label: o.label, value: o.value }))),
      status: (msg, isError) => d.setStatus(msg, { error: !!isError }),
      busy: (label, fn) => withBusy(label, fn),
    },
    ui: { iconHtml: (name, opts) => iconHtml(name, opts), tilePlaceholderHtml: (name) => iconHtml(isProjectName(name) ? "book" : "file") },   // 0.1.2：占位图 = 图标，不再取名字首字（user 2026-09-10「所有的预览图都是 2」）
    naming: NAMING,
    isZipDoc: (n) => isProjectName(n),
    policy: {
      isDoc: (p) => docKind(p) != null, isImage: () => false, naming: NAMING,
      // 缩略图（2.1，ADR-0012）：只有书有；fetch = store getPeek 按名尾读（source 必填：cloud 绝不落回本地，WeebPaint「新 token 配旧字节」学费）
      thumbs: { has: isProjectName, dbName: THUMB_DB, fetch: (name, source) => fetchZipEntryThumb(zipFile(name) as unknown as PeekableFile, source, { zipEntry: THUMBNAIL_ENTRY, bytesLength: THUMB_PEEK_BYTES }) },
    },
    tile: { aspect: "2/3" },   // 竖版书封（user 2026-09-10「加 2:3 的选项…iphone se2 可以一排三本」）
    encryption,
    folderMemory: { get: () => deviceKvGet(KV_FOLDER) ?? "", set: (p) => deviceKvSet(KV_FOLDER, p || null) },
    isGalleryVisible: () => document.body.dataset.mode === "gallery",
    reportError: (e, level) => reportError(e, level ?? "error"),
    reloadApp: () => location.reload(),
    // 包内 zh/en 默认是 WeebPaint 口吻（「图库」「作品」「画一笔」）；空态与几条会露面的文案换成书库/写作口吻（user 2026-09-10「gallery 叫书库」），其余沿用默认。
    text: { lang: lang(), t: (key, params) => { const k = GALLERY_TEXT_OVERRIDES[key]; return k ? t(k, params) : undefined; } },
  };
  let gallery: Gallery | null = null;
  function ensureMounted(): Gallery { if (!gallery) gallery = createGallery(d.mountEl, deps); return gallery; }
  async function open(): Promise<void> {
    await d.flushLocal();
    const g = ensureMounted();
    document.body.dataset.mode = "gallery";
    d.fullEl.classList.remove("hidden"); d.fullEl.setAttribute("aria-hidden", "false");
    const dir = d.currentDir();
    if (dir !== g.handle.getFolder()) g.handle.setFolder(dir);
    g.handle.setView("files");
    deviceKvSet(KV_SCENE, "gallery");
    d.onOpened?.();
  }
  function close(): void {
    d.fullEl.classList.add("hidden"); d.fullEl.setAttribute("aria-hidden", "true");
    delete document.body.dataset.mode;
    deviceKvSet(KV_SCENE, null);
    d.onClosed?.();
  }
  const isOpen = () => !d.fullEl.classList.contains("hidden");
  return {
    open, close, isOpen,
    /** boot 用：上次是在书库里离开的（刷新 / 关标签 / SW 更新重载）。 */
    wasInGallery: () => deviceKvGet(KV_SCENE) === "gallery",
    refresh: () => gallery?.handle.refresh(),
    setView: (v: "files" | "trash") => ensureMounted().handle.setView(v),
    getView: () => gallery?.handle.getView() ?? "files",
    emptyTrash: (scope: "local" | "cloud" | "both") => ensureMounted().handle.emptyTrash(scope),
    currentFolder: () => gallery?.handle.getFolder() ?? (deviceKvGet(KV_FOLDER) ?? ""),
    invalidateEncrypted: (name: string) => gallery?.handle.invalidateEncrypted(name),
    /** 封面变了（设为封面 / 替换图片）：丢掉这本书的缩略图缓存，下次露面重取。 */
    invalidateThumb: (name: string) => { void gallery?.thumbs?.invalidate(name); },
  };
}
export type GalleryHost = ReturnType<typeof initGalleryHost>;
