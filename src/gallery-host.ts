// 图库屏（@internal/gallery 的 WXHW 消费面）：card view 独立一屏，替代抽屉的文件列表（user 2026-09-09「gallery 应该和 weebpaint 一样是一个独立的、不依赖于 editor 的东西」）。
// created 2026-09-10 by Claude Fable 5.1。包出屏幕 + 动词 + 数据面；本文件只出：Vue 注入、DocHost（编辑器端口）、policy（两档扩展名、身份=全名、缩略图 = 书的 Thumbnails/thumbnail.png 尾读，2.1）、
//   加密适配（crypto-state）、chrome 按钮（返回 / 新建 / 回收站 / 设置）。文案 = 包内 zh/en 默认（按 lang 切）。
import { createApp, defineComponent, reactive, ref, computed, watch, onMounted, onUnmounted, nextTick, Teleport } from "../vendor/vue/vue.esm-browser.prod.js";
import { createGallery, type CreateGalleryDeps, type GalleryDocHost, type GalleryEncryption, type VueRuntime, type GItem, type TileInfo, type VerbStore, type DataFaceStore, type Gallery, type GalleryView, type AsideKind, type AsideScope } from "@internal/gallery";
import { humanSize } from "@internal/gallery";
import { requireStore, auth } from "./app-store.ts";
import { appEncryption } from "./encryption.ts";
import { THUMBNAIL_ENTRY } from "./project/format.ts";
import { docKind, parseDocName } from "./doc-model.ts";
import { isDocEncrypted } from "./docs.ts";
import { isUnlocked, onLockChange, currentPassword, setCurrentPassword, hasVerifier, resetVerifier } from "./crypto-state.ts";
import { openConfirmSheet, openInputSheet, openChoiceSheet, withBusy } from "./sheets.ts";
import { iconHtml } from "./ui/icon.ts";
import { coverHtml, paperHtml } from "./ui/book-cover.ts";
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

export function initGalleryHost(d: GalleryHostDeps) {
  const vue = { createApp, defineComponent, reactive, ref, computed, watch, onMounted, onUnmounted, nextTick, Teleport } as unknown as VueRuntime;   // Teleport：gallery 0.6.2 把卡片 ⋯ 菜单搬出卡片（z order 进菜单 band）
  const isProjectName = (n: string) => docKind(n) === "project";
  const storeFace = (): (VerbStore & DataFaceStore) | null => {
    let s: ReturnType<typeof requireStore>;
    try { s = requireStore(); } catch { return null; }
    return s as unknown as VerbStore & DataFaceStore;   // 结构兼容（file/files 子集）；包对 store 的要求 = 提案 §2 StoreFace
  };
  const doc: GalleryDocHost = {
    open: async (item: GItem) => { const ok = await d.openAny(item.identifier, { promptUnlock: true }); if (ok) close(); },
    renameActive: async () => { await d.renameActive(); return d.activeName(); },
    setIdentifier: () => { /* 活动稿被图库移动：openAny(新身份) 由 verbs 的 move 之后 reload 触发不了——这里重开 */ },
    push: async () => { await d.pushNow(); },
    unload: async (item: GItem) => { try { await requireStore().file(item.identifier, { mode: "existing" }).offload(); } catch (e) { reportError(e, "warning"); } },
    exit: async () => { await d.flushLocal(); },
    dropCheckpoint: () => {},
  };
  const zipFile = (name: string) => requireStore().zip(name, { mode: "existing" });
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
      signedIn: () => auth.isSignedIn(), online: () => (typeof navigator === "undefined" || navigator.onLine !== false), activeIdentifier: () => d.activeName(),
      confirm: (title, msg) => openConfirmSheet(title, msg),
      input: (title, def, opts) => openInputSheet(title, { defaultValue: def, placeholder: opts?.placeholder, okLabel: t("common.ok") }),
      chooseFolder: (title, msg, options) => openChoiceSheet<string>(title, msg, options.map((o) => ({ label: o.label, value: o.value }))),
      status: (msg, isError) => d.setStatus(msg, { error: !!isError }),
      busy: (label, fn) => withBusy(label, fn),
    },
    // 封面 = 两层（v2.1.21；排版在 ui/book-cover.ts）：底下一层是封面图，没有图就是一张纸（占位）；上面一层印书名 / 日期 / 装订线，**有没有图都一样印**
    //   （user 2026-09-29「封面上印书名」+「字的逻辑一样，无视是否有图，图只是背景」）。
    ui: {
      iconHtml: (name, opts) => iconHtml(name, opts),
      tilePlaceholderHtml: (name) => paperHtml(isProjectName(name) ? "book" : "draft"),
      // gallery 0.6.4 起第二参给 TileInfo（size / lastModified；回收站 / 备份箱的卡没有 size → 只印日期，包的那行继续顶在底栏右侧）
      tileOverlayHtml: (name: string, item?: TileInfo) => coverHtml(parseDocName(name).stem, isProjectName(name) ? "book" : "draft", {
        sizeText: item?.size != null ? humanSize(item.size) : undefined,
        editedText: item?.lastModified ? t("gal.editedAt", { time: new Date(item.lastModified).toLocaleString() }) : undefined,
      }),
    },
    // （v2.1.23 / gallery 0.6.0：naming / isZipDoc / policy.isDoc 退役——哪些是文档、主干、是不是 zip 全由 store 的种类表说，宿主不再自己切名字。）
    policy: {
      isImage: () => false,
      // 缩略图（2.1，ADR-0012）：只有书有；fetch = store getPeek 按名尾读（source 必填：cloud 绝不落回本地，WeebPaint「新 token 配旧字节」学费）。
      //   store 语义：**null = 到达了但没有**（entry 不存在 / 文件不在云端；本地有副本时 Blob.slice 根本不碰网）→ 原样返 null = 确定没封面 → 包层进缓存、卡片显示书图标；
      //   **抛 = 够不着**（provider downloadRange 网络失败 reject）→ 包层不缓存、云端-only 的卡才显示云（user 2026-09-10 真机「thumb 不是用来显示 cloud status 的地方，应该是书，未知的话是另外一回事可以显示云」）。
      thumbs: { kinds: ["project"], dbName: THUMB_DB, fetch: (name, source) => zipFile(name).getPeek({ bytesLength: THUMB_PEEK_BYTES, zipEntry: THUMBNAIL_ENTRY, source }) },
    },
    tile: { aspect: "2/3" },   // 竖版书封（user 2026-09-10「加 2:3 的选项…iphone se2 可以一排三本」）。v2.3.26 起实际比例在 styles.css 里改成 1 : √2（包的选项是闭集 1/1 | 2/3，这里仍报「竖版」那一档）   // 竖版书封（user 2026-09-10「加 2:3 的选项…iphone se2 可以一排三本」）
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
  // 供 ui-audit 探针（非 API）：缩略图缓存命中/未命中/错误计数——「否定 peek 命中缓存不重拉」靠它验
  (window as unknown as { __xhwGalleryThumbStats?: () => unknown }).__xhwGalleryThumbStats = () => gallery?.thumbs?.stats ?? null;
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
    setView: (v: GalleryView) => ensureMounted().handle.setView(v),
    getView: (): GalleryView => gallery?.handle.getView() ?? "files",
    /** 清空回收站 / 备份箱（各清各的；确认框和结果提示是图库包的）。 */
    emptyAside: (kind: AsideKind, scope: AsideScope) => { const h = ensureMounted().handle; if (kind === "trash") h.emptyTrash(scope); else h.emptyBackup(scope); },
    currentFolder: () => gallery?.handle.getFolder() ?? (deviceKvGet(KV_FOLDER) ?? ""),
    invalidateEncrypted: (name: string) => gallery?.handle.invalidateEncrypted(name),
    /** 封面变了（设为封面 / 替换图片）：丢掉这本书的缩略图缓存，下次露面重取。 */
    invalidateThumb: (name: string) => { void gallery?.thumbs?.invalidate(name); },
  };
}
export type GalleryHost = ReturnType<typeof initGalleryHost>;
