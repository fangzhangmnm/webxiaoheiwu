// 编辑器控制器：textarea ↔ 当前稿（docs 层）。created 2026-09-03 by Claude Fable 5.1
//   · 文件名 = 管理句柄不是标题（ADR-0007，2026-09-04）：编辑器里没有标题框；文件名住顶栏，改名走 sheet → renameTo（显式、不防抖）。
//     新稿没给名 → 物化时 `yyyymmdd-hex4`；加密稿一律日期码（藏标题）；明文稿转加密 → 封完自动改日期码（失败响亮，不静默）。
// 人类钉死的行为（docs/20260524-editor-ux.md + sync-design.md）：
//   · 200ms 本地落盘；15s 防抖 + 30s 心跳推云；推后下次计时只在下一次击键才起（无后台轮询）。
//   · 状态文案稳定不跳（未同步 / 正在同步… / 已保存 HH:MM:SS），不做倒计时。
//   · 只读 = 不用 readOnly 属性（Chromium 会藏光标）：beforeinput/paste/cut/drop preventDefault。
//   · 打开落在开头（moveCaretToStart）。
//   · 加密稿：locked 时编辑区空白 + 禁输入；解锁循环在 busy 外；错密码不碰文件（库 seal 保证）。
//   · 新稿惰性物化：没内容前不建文件（v1 的「自动空稿清理」由此消失）。
import { LOCAL_SAVE_DEBOUNCE_MS, PUSH_DEBOUNCE_MS, PUSH_HEARTBEAT_MS } from "./config.ts";
import { formatDate, parseDocName, splitDocPath, sanitizeTitle, docKind } from "./doc-model.ts";
import { readDoc, saveDoc, createDoc, renameDoc, pullDocIfClean, setActiveDoc, encryptDoc, decryptDoc, rekeyDoc, moveDoc } from "./docs.ts";
import { isUnlocked, onLockChange, renameFilePassword, forgetFilePassword, fileUsesOtherPassword, currentPassword } from "./crypto-state.ts";
import { deviceKvGet, deviceKvGetJson, deviceKvSet } from "./device-kv.ts";
import { reportError } from "./error-badge.ts";
import { rescueText } from "./rescue.ts";
import { t } from "./i18n/index.ts";

export interface StatusOpts { error?: boolean; unsynced?: boolean }
export type SyncKind = "none" | "locked" | "unavailable" | "encryptPending" | "local" | "offline" | "unsynced" | "clean";
export interface EditorDeps {
  editor: HTMLTextAreaElement;
  setStatus: (text: string, opts?: StatusOpts) => void;   // 瞬时事件 → toast
  setState: (text: string, opts?: StatusOpts) => void;    // 粘性稿态 → 顶栏（空 = 留白）
  isSignedIn: () => boolean;
  /** 当前稿变了（身份/加密态/只读态）→ 抽屉/顶栏重画。 */
  onDocChanged: () => void;
  /** 解锁循环（busy 外）；返回是否已解锁。 */
  ensureUnlocked: () => Promise<boolean>;
  /** 「这篇稿用的不是当前密码」循环（app 注入：弹框 + verifyDocPassword）。 */
  ensureFileUnlocked: (name: string) => Promise<boolean>;
  /** 切稿/新建/清空前（语音会话必须先中止——转写结果不能落进别的稿）。 */
  onBeforeLoad?: () => void;
  /** 云端新版正在换掉本地这一篇（干净快进）：true = 开始，false = 新版已载入 / 没换成。app 据此升 / 收整屏等待
   *  （user 2026-09-29「wxhw 要不要快进的时候就 waiting，这样稳一点。写书本来就没有画画那么短平快」）。 */
  onReplacing?: (on: boolean) => void;
}

const KV_LAST_OPEN = "last-open";

export interface EditorState {
  name: string | null;          // 已物化的身份；新稿未物化时 null（看 pendingDate）
  pendingDate: string | null;   // 新稿：物化时用的日期前缀
  pendingDir: string;           // 新稿：物化落在哪个夹（"" = 根；ADR-0006 多文件夹）
  pendingTitle: string | null;  // 新稿：用户在物化前显式给的文件名（顶栏改名）；null → 物化时日期码
  encrypted: boolean;
  locked: boolean;              // 加密且未解锁（编辑区空白）
  readOnly: boolean;            // per-device 只读保护
  unavailable: boolean;         // 本地无且云端不可达
}

export function createEditor(d: EditorDeps) {
  const st: EditorState = { name: null, pendingDate: null, pendingDir: "", pendingTitle: null, encrypted: false, locked: false, readOnly: false, unavailable: true };   // boot 前不可打字（open/newDoc 才放行）
  let savedText = "";      // 最近一次落盘的正文（判 dirty）
  let localTimer: ReturnType<typeof setTimeout> | null = null;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt = 0;
  let pushPending = false;     // 有落盘但未推的字节
  let loadGen = 0;             // open 竞态守卫
  let refreshInFlight = false;

  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  function moveCaretToStart(): void {
    try { d.editor.selectionStart = 0; d.editor.selectionEnd = 0; } catch { /* some inputs reject */ }
    d.editor.scrollTop = 0;
  }
  function applyGuards(): void {
    if (parked) return;
    const blocked = st.readOnly || st.locked || st.unavailable || replacing || worldReplaced;
    d.editor.classList.toggle("locked", blocked);
    d.editor.readOnly = blocked;   // 锁/只读 = 真 readOnly：敲进去的字不再被悄悄吞掉（user 2026-09-04「没解锁密码导致的煤气灯」；根治=0.3 懒空白稿）
  }
  // zen（user 2026-09-04）：干净态 / 锁态留白；「未同步 / 本地稿」交给顶栏 smart save 图标（syncKind），只剩「不可用 / 加密未成」出字。
  function statusForDoc(): string {
    if (st.locked) return "";
    if (encryptPending) return t("st.encryptPendingHint");
    if (st.unavailable) return t("st.unavailable");
    return "";
  }
  /** 顶栏 smart save 钮的状态源（user 2026-09-04「为什么没有 smart save button，触屏的时候没法按 ctrl s」）。 */
  function syncKind(): SyncKind {
    if (!st.name && !st.pendingDate) return "none";
    if (st.locked) return "locked";
    if (st.unavailable) return "unavailable";
    if (encryptPending) return "encryptPending";
    if (!d.isSignedIn()) return "local";
    const dirty = pushPending || !!localTimer;
    return dirty ? (isOffline() ? "offline" : "unsynced") : "clean";
  }
  let parked = false;   // 2.0：工程模式接管 textarea 时 txt 编辑器静默（不收 input、不写盘、不改 readOnly）
  // 世界线守卫（2026-09-29，test/e2e-sync/ 两台设备端到端测试抓到的三条丢字路径；说明见 rescue.ts）：
  //   worldReplaced = 本地字节刚被云端那一版换掉（冲突面选了云端），编辑器里还是旧世界 → 旧世界**绝不再写回原名**，persist 链外整体重载；
  //   replacing     = 库正在用云端新版覆盖本地（干净快进下载中）→ 冻结输入，别让字打进一个马上被换掉的世界。
  let worldReplaced = false, replacing = false;
  let reloadAfterPersist: string | null = null;   // 重载不能在 persist 链里做：open → flushLocal 会 await persistInFlight = 自己（2026-09-29 之前就是这么死锁的：选了「云端覆盖本地」之后保存链永远卡住，之后打的字再也不落盘）
  const canEdit = () => !parked && !st.readOnly && !st.locked && !st.unavailable && !replacing && !worldReplaced;

  // ── 落盘 / 推云 ──
  let persistInFlight: Promise<void> | null = null;   // 串行：两个 persist 同飞 = 双建稿（审计 L3）
  let renameInFlight = false;                          // 改名中不写旧名（写了旧名就复活成 local-only 脏稿，审计 L7）
  let encryptPending = false;                          // 预定加密但物化时封失败：不推云、下次 persist 重试（审计 M8）
  let pushFailures = 0;                                // 推云连续失败 → 指数退避（审计 L2）
  async function persist(push: boolean): Promise<void> {
    if (persistInFlight) await persistInFlight;
    const gen = loadGen;
    const run = (async () => {
      if (gen !== loadGen) return;
      if (worldReplaced || replacing) return;   // 旧世界不写回（见上「世界线守卫」）
      if (st.locked || st.unavailable || st.readOnly) return;   // 锁定/不可用/只读稿绝不写（other-password 态尤其：否则用当前密码封空容器覆盖，审计 UI-3）
      if (renameInFlight) { scheduleLocalSave(); return; }
      const text = d.editor.value;
      if (!st.name) {
        if (!st.pendingDate) return;
        if (!text && !st.pendingTitle) return;   // 空稿不物化
        const name = await createDoc(st.pendingTitle ?? "", text, st.pendingDate, st.pendingDir);   // 没给名 → 日期码（加密稿默认即藏标题）
        if (gen !== loadGen) return;   // 建稿期间用户切走了：文件留在本地（下次列表可见），不把身份塞给现在的编辑器
        // 新建时就定好的加密（user 2026-09-03「加密是一开始就定好的」）：物化即封——先封再把 name 暴露给 UI/抽屉，明文只在本地 IDB 停留这一步，永不推云（createDoc 是 tryPush:false）。
        if (st.encrypted) {
          try { await encryptDoc(name); encryptPending = false; }
          catch (e) { encryptPending = true; reportError(e, "warning"); }   // 保持「预定加密」：不推云，状态栏常驻提示，下次 persist 重试
          if (gen !== loadGen) return;
        }
        st.name = name; st.pendingDate = null; st.pendingTitle = null;
        savedText = text;
        setActiveDoc(name); deviceKvSet(KV_LAST_OPEN, name);
        d.onDocChanged();
      }
      const name = st.name!;
      if (encryptPending) {
        try { await encryptDoc(name); encryptPending = false; } catch (e) { reportError(e, "log"); }
        if (gen !== loadGen) return;
      }
      const effPush = push && !encryptPending;
      const r = await saveDoc(name, text, { push: effPush });
      if (gen !== loadGen) return;   // 切走了：字节已落在捕获的 name 上，状态归新稿管
      savedText = text;
      if (effPush) {
        if (r.pushed) { pushPending = false; pushFailures = 0; }
        else pushPending = true;
        if (r.resolution === "takeCloud" && st.name === name) await worldWasReplaced(name, text);   // 世界线换了：封住旧世界 + 途中打的字留底；整体重载挪到 persist 链外（pushNow）
      } else {
        pushPending = true;
      }
    })();
    persistInFlight = run;
    try { await run; } finally { if (persistInFlight === run) persistInFlight = null; }
  }
  /** 本地字节刚被云端那一版换掉。snapshot = 库备份进备份箱的那一版正文；编辑器里比它多出来的字 = 上传途中才打的，另存留底。 */
  async function worldWasReplaced(name: string, snapshot: string): Promise<void> {
    worldReplaced = true; reloadAfterPersist = name;
    if (localTimer) { clearTimeout(localTimer); localTimer = null; }
    applyGuards();
    const now = d.editor.value;
    if (now === snapshot) return;
    try { const saved = await rescueText(name, now, { encrypted: st.encrypted }); d.setStatus(t("rescue.saved", { name: parseDocName(saved).stem })); d.onDocChanged(); }
    catch (e) { reportError(e); d.setStatus(t("rescue.failed", { e: errMsg(e) }), { error: true }); }
  }
  function scheduleLocalSave(): void {
    if (localTimer) clearTimeout(localTimer);
    localTimer = setTimeout(() => {
      localTimer = null;
      void persist(false).then(() => { d.setState(statusForDoc(), { unsynced: pushPending && d.isSignedIn() }); if (d.isSignedIn()) schedulePush(); })
        .catch((e) => { reportError(e); d.setStatus(t("st.saveFailed", { e: errMsg(e) }), { error: true }); });
    }, LOCAL_SAVE_DEBOUNCE_MS);
  }
  function schedulePush(extraDelayMs = 0): void {
    if (!d.isSignedIn()) return;
    const now = Date.now();
    if (firstDirtyAt === 0) firstDirtyAt = now;
    if (pushTimer) clearTimeout(pushTimer);
    const target = Math.min(now + PUSH_DEBOUNCE_MS, firstDirtyAt + PUSH_HEARTBEAT_MS) + extraDelayMs;
    pushTimer = setTimeout(() => { void pushNow(); }, Math.max(0, target - now));
  }
  const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  async function pushNow(): Promise<void> {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    firstDirtyAt = 0;
    if (!st.name && !st.pendingDate) return;
    if (!canEdit()) return;   // 锁定/只读/不可用稿：没有可推的正文（审计 UI-3）
    if (!d.isSignedIn()) { await flushLocal(); return; }
    if (isOffline()) {   // 离线：只落本地，不刷红横幅；`online` 事件会回来推（审计 L2）
      if (localTimer) { clearTimeout(localTimer); localTimer = null; }
      try { await persist(false); } catch (e) { reportError(e, "log"); }
      pushPending = true; d.setState(statusForDoc(), { unsynced: true });
      return;
    }
    if (localTimer) { clearTimeout(localTimer); localTimer = null; }
    const gen = loadGen;
    d.setStatus(t("st.syncing"));
    try {
      await persist(true);
      if (gen !== loadGen) return;
      if (reloadAfterPersist) { const n = reloadAfterPersist; reloadAfterPersist = null; await reload(n); return; }   // 冲突面选了云端：persist 链已经放开，这里才重载
      d.setState(statusForDoc(), { unsynced: pushPending });
      if (pushPending) schedulePush();   // 冲突未解 / 库判未推 → 下个周期再试
    } catch (e) {
      if (gen !== loadGen) return;
      pushFailures++;
      reportError(e, pushFailures === 1 ? "warning" : "log");   // 第一次亮横幅，之后只记日志（不刷屏）
      d.setStatus(t("st.syncFailed", { e: errMsg(e) }), { error: true });
      pushPending = true;
      schedulePush(Math.min(PUSH_DEBOUNCE_MS * 2 ** Math.min(pushFailures, 5), 5 * 60_000));   // 指数退避，封顶 5 分钟
    }
  }
  /** 只落本地（切稿/锁定/退出前）。幂等：没有 pending 就不写。 */
  async function flushLocal(): Promise<void> {
    if (persistInFlight) { try { await persistInFlight; } catch { /* 已在 persist 内报过 */ } }
    if (!localTimer) return;
    clearTimeout(localTimer); localTimer = null;
    if (!canEdit()) return;
    try { await persist(false); } catch (e) { reportError(e); }
  }

  // ── 文件名 = 身份（ADR-0007：管理句柄，显式改名，不防抖）──
  /** 身份换了之后的记账：只读名单 / 每篇密码表 / 当前稿指针 / 本机 last-open 跟着走。 */
  function adoptName(from: string, to: string): void {
    if (from === to) return;
    renameFilePassword(from, to);
    st.name = to; setActiveDoc(to); deviceKvSet(KV_LAST_OPEN, to);
  }
  /** 改文件名（顶栏 sheet）。空 = 不改（禁「未命名」）。未物化的新稿只记 pendingTitle，物化时兑现。返回 false = 没改成（已 toast）。 */
  async function renameTo(raw: string): Promise<boolean> {
    const title = sanitizeTitle(raw);
    if (!title) return false;
    if (!st.name) { st.pendingTitle = title; d.onDocChanged(); return true; }
    if (title === parseDocName(st.name).stem) return true;
    await flushLocal();
    const gen = loadGen, from = st.name;
    renameInFlight = true;
    try {
      const rr = await renameDoc(from, title);
      if (gen !== loadGen) return false;
      if (!rr) { d.setStatus(t("st.renameFailed"), { error: true }); return false; }
      if (rr.oldKept) d.setStatus(t("st.renameOldKept"), { error: true });        // 库把旧名原地留着（谱系不明降级 save-as）——抽屉会出现两份，告诉用户（审计 L18）
      else if (rr.cloudDeferred) d.setStatus(t("st.renameCloudDeferred"), { unsynced: true });
      adoptName(from, rr.name);
      d.onDocChanged();
      if (d.isSignedIn()) schedulePush();   // 改名的云端腿由库在 tryMove 内做；这里只是让状态栏跟上
      return true;
    } catch (e) { reportError(e); d.setStatus(t("st.renameFailed"), { error: true }); return false; }
    finally {
      renameInFlight = false;
      if (gen === loadGen && d.editor.value !== savedText) scheduleLocalSave();   // 改名期间挂起的正文补落盘
    }
  }
  /** 顶栏显示名：已物化 = stem；新稿 = 预定的文件名或 null（顶栏画占位）。 */
  function displayName(): string | null { return st.name ? parseDocName(st.name).stem : st.pendingTitle; }

  // ── 打开 / 新建 ──
  async function reload(name: string): Promise<void> { await open(name, { keepCaret: true }); }

  /** promptUnlock：只有用户手势（抽屉点开 / 锁图标）才弹密码框——「加密永不自动弹框」（冷启动续写、锁定后 reload、重置后 reload 都不弹）。 */
  async function open(name: string, opts: { keepCaret?: boolean; promptUnlock?: boolean } = {}): Promise<boolean> {
    if (docKind(name) === "project") { reportError(new Error("[editor] open() got a project name; route through app openAny"), "log"); return false; }   // 护栏在改状态之前：以前先把 st.name 换掉再让 readDoc 抛
    d.onBeforeLoad?.();
    await flushLocal();
    encryptPending = false; pushFailures = 0;
    worldReplaced = false; replacing = false; reloadAfterPersist = null;
    const gen = ++loadGen;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    firstDirtyAt = 0; pushPending = false;
    const caret = opts.keepCaret ? d.editor.selectionStart : 0;
    st.name = name; st.pendingDate = null; st.pendingTitle = null; st.readOnly = false; st.unavailable = false; st.locked = false; st.encrypted = false;
    setActiveDoc(name); deviceKvSet(KV_LAST_OPEN, name);
    d.setStatus(t("st.loading"));
    let r = await readDoc(name);
    if (gen !== loadGen) return false;
    if (r.kind === "locked" || r.kind === "other-password") {
      st.encrypted = true; st.locked = true;
      d.editor.value = ""; savedText = "";
      applyGuards(); d.onDocChanged();
      d.setState(r.kind === "locked" ? "" : t("st.otherPasswordHint"));
      if (!opts.promptUnlock) return true;   // 非手势：停在锁态，点锁图标再问
      const ok = r.kind === "locked" ? await d.ensureUnlocked() : await d.ensureFileUnlocked(name);
      if (gen !== loadGen) return false;
      if (!ok) return true;
      r = await readDoc(name);
      if (gen !== loadGen) return false;
      if (r.kind === "other-password") {   // 当前密码解锁了但这篇是别的密码：再问这篇的
        const ok2 = await d.ensureFileUnlocked(name);
        if (gen !== loadGen) return false;
        if (!ok2) return true;
        r = await readDoc(name);
        if (gen !== loadGen) return false;
      }
    }
    if (r.kind === "ok") {
      st.encrypted = r.encrypted; st.locked = false;
      d.editor.value = r.text; savedText = r.text;
      applyGuards();
      if (opts.keepCaret) { try { d.editor.selectionStart = d.editor.selectionEnd = Math.min(caret, r.text.length); } catch { /* ignore */ } }
      else moveCaretToStart();
      d.setState(statusForDoc());
      d.onDocChanged();
      if (r.encoding !== "utf-8" && r.encoding !== "utf-8-bom" && canEdit()) {   // 旧编码 → 以 UTF-8 写回（v1 同款规范化）
        void saveDoc(name, r.text, { push: d.isSignedIn() }).then((w) => { if (w.resolution === "takeCloud" && st.name === name && gen === loadGen) void reload(name); }).catch((e) => reportError(e, "log"));   // 这一推也可能撞冲突面：选了云端就得重载，别让屏上留着旧世界
      }
      return true;
    }
    if (r.kind === "locked" || r.kind === "other-password") { d.setStatus(t("st.wrongPasswordOrLocked"), { error: true }); return true; }
    st.unavailable = true;
    d.editor.value = ""; savedText = "";
    applyGuards(); d.onDocChanged();
    d.setStatus(t("st.unavailable"), { error: true });
    return false;
  }

  /** 当前所在夹（打开的稿的夹 / 新稿预定的夹）。 */
  function currentDir(): string { return st.name ? splitDocPath(st.name).dir : st.pendingDir; }
  /** 新稿。encrypted:true = 一开始就定好加密（先要密码；用户取消 → 不新建，返回 false）。dir = 落在哪个夹（默认当前夹）。 */
  async function newDoc(opts: { encrypted?: boolean; dir?: string } = {}): Promise<boolean> {
    if (opts.encrypted && !(await d.ensureUnlocked())) return false;
    d.onBeforeLoad?.();
    await flushLocal();
    encryptPending = false; pushFailures = 0;
    worldReplaced = false; replacing = false; reloadAfterPersist = null;
    loadGen++;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    firstDirtyAt = 0; pushPending = false;
    const dir = opts.dir ?? currentDir();
    st.name = null; st.pendingDate = formatDate(Date.now()); st.pendingDir = dir; st.pendingTitle = null; st.encrypted = !!opts.encrypted; st.locked = false; st.readOnly = false; st.unavailable = false;
    setActiveDoc(null); deviceKvSet(KV_LAST_OPEN, null);
    d.editor.value = ""; savedText = "";
    applyGuards();
    d.setState(st.encrypted ? t("st.pendingEncrypted") : "");
    d.onDocChanged();
    d.editor.focus();
    return true;
  }

  /** 当前稿被移到回收站 / 被别处改名后：编辑器变成一篇**空新稿**（可继续写，落盘有身份；审计 UI-4：以前是无身份可打字、永不落盘）。 */
  function clear(): void {
    d.onBeforeLoad?.();
    loadGen++;
    if (localTimer) { clearTimeout(localTimer); localTimer = null; }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    const dir = currentDir();
    st.name = null; st.pendingDate = formatDate(Date.now()); st.pendingDir = dir; st.pendingTitle = null; st.encrypted = false; st.locked = false; st.readOnly = false; st.unavailable = false;
    pushPending = false; encryptPending = false; pushFailures = 0;
    worldReplaced = false; replacing = false; reloadAfterPersist = null;
    setActiveDoc(null); deviceKvSet(KV_LAST_OPEN, null);
    d.editor.value = ""; savedText = "";
    applyGuards(); d.setState(""); d.onDocChanged();
  }

  // ── 新鲜度（focus/online/idle 复查）：只干净快进；dirty 留给推送的冲突面 ──
  async function refreshIfClean(): Promise<void> {
    const name = st.name;
    if (!name || refreshInFlight || !d.isSignedIn() || st.locked) return;
    if (localTimer || renameInFlight || pushPending || persistInFlight || worldReplaced) return;
    refreshInFlight = true;
    const gen = loadGen;
    let froze = false;
    try {
      // 库只认得已经落盘的脏；还停在编辑器里的字由 localDirty 告诉它（查云端那一下网络往返里用户可能刚好开始打字）。
      // 一旦库决定替换（onReplaceStart，同步回调）：冻结输入直到新版载入——下载途中打进去的字会被整篇覆盖且不进备份箱（2026-09-29 端到端测试复现）。
      const r = await pullDocIfClean(name, {
        localDirty: () => !!localTimer || !!persistInFlight || pushPending || d.editor.value !== savedText,
        onReplaceStart: () => { froze = true; replacing = true; applyGuards(); d.onReplacing?.(true); },
      });
      if (gen !== loadGen) return;
      if (r.status === "fast-forwarded") {
        await reload(name);
        d.setStatus(t("st.loadedCloudLatest", { time: fmtTime(Date.now()) }));
      } else if (r.status === "cloud-absent") {
        d.setStatus(t("st.cloudGone"), { error: true });
      }
    } catch (e) { reportError(e, "log"); }
    finally { refreshInFlight = false; if (froze) { replacing = false; applyGuards(); d.onReplacing?.(false); } }   // 重载（open）已把 replacing 归零；没换成（ff-failed）时这里解冻
  }

  // ── 只读保护（per-device）──
  // txt 的 per-device 修改锁 2026-09-10 删除（user「不做额外 list，txt 不支持锁」；修改锁只属于书，跟着作品进 zip）。st.readOnly 字段保留恒 false。


  // ── 加密切换 ──
  async function toggleEncryption(confirmDecrypt: () => Promise<boolean>, busy: <T>(label: string, fn: () => Promise<T>) => Promise<T>): Promise<void> {
    if (!st.name) {
      if (!st.pendingDate) return;
      // 未物化的新稿：切「预定加密」，物化那一刻兑现（persist）
      if (!st.encrypted) { if (!(await d.ensureUnlocked())) return; st.encrypted = true; d.setState(t("st.pendingEncrypted")); }
      else { st.encrypted = false; d.setState(t("st.pendingPlain")); }
      d.onDocChanged();
      return;
    }
    if (st.locked) { await open(st.name, { keepCaret: true, promptUnlock: true }); return; }   // 锁图标 = 手势：这里才弹密码框
    await flushLocal();
    const name = st.name;
    if (!st.encrypted) {
      const ok = await d.ensureUnlocked();
      if (!ok) return;
      let sealed = false;
      try {
        await busy(t("busy.encrypting"), () => encryptDoc(name));
        sealed = true; st.encrypted = true;
      } catch (e) { reportError(e); d.setStatus(t("st.encryptFailed", { e: errMsg(e) }), { error: true }); }
      if (sealed) d.setStatus(t("st.encryptedKeepName", { time: fmtTime(Date.now()), name: parseDocName(name).stem }));   // 名字不动（2026-09-26 user「加密不改名同意」，ADR-0007 修订）
      d.onDocChanged();
      return;
    }
    if (!(await confirmDecrypt())) return;
    try {
      const r = await busy(t("busy.decrypting"), () => decryptDoc(name));
      st.encrypted = false;
      d.setStatus(t("st.decrypted", { time: fmtTime(Date.now()), status: r.status }));
    } catch (e) { reportError(e); d.setStatus(t("st.decryptFailed", { e: errMsg(e) }), { error: true }); }
    d.onDocChanged();
  }

  /** 移到别的夹（ADR-0006）。未物化的新稿只改预定夹；已物化走 tryMove（撞名追加后缀）。返回最终身份（未变 → 原名 / null）。 */
  async function moveTo(dir: string): Promise<string | null> {
    if (!st.name) { st.pendingDir = dir; d.onDocChanged(); return null; }
    await flushLocal();
    const gen = loadGen, from = st.name;
    renameInFlight = true;
    try {
      const rr = await moveDoc(from, dir);
      if (gen !== loadGen) return null;
      if (!rr) { d.setStatus(t("st.moveFailed"), { error: true }); return null; }
      adoptName(from, rr.name);
      d.setStatus(rr.oldKept ? t("st.renameOldKept") : t("st.moved", { dir: dir || t("list.root") }), { error: !!rr.oldKept });
      d.onDocChanged();
      if (d.isSignedIn()) schedulePush();
      return rr.name;
    } catch (e) { reportError(e); d.setStatus(t("st.moveFailed"), { error: true }); return null; }
    finally { renameInFlight = false; if (gen === loadGen && d.editor.value !== savedText) scheduleLocalSave(); }
  }

  /** 显式换钥匙：这篇（用别的密码封的）→ 解开 → 用当前密码重封。规则①的唯一例外入口（横幅按钮）。 */
  async function rekeyToCurrent(busy: <T>(label: string, fn: () => Promise<T>) => Promise<T>): Promise<void> {
    if (!st.name || !st.encrypted || st.locked || !fileUsesOtherPassword(st.name)) return;
    if (!(await d.ensureUnlocked())) return;
    await flushLocal();
    const name = st.name;
    try {
      await busy(t("busy.rekeying"), async () => {
        // store 0.12.0 rekey：密文→密文（seam 给这篇的旧钥；新钥 = 当前密码），明文不上云（以前 decrypt→encrypt 的中间态把明文 push 上 OneDrive）
        const r = await rekeyDoc(name, currentPassword()!);
        if (r.status !== "swapped" && r.status !== "cloud-deferred" && r.status !== "conflict") throw new Error(r.status);   // offline / locked / no-local → 失败态，表里旧钥保留
        forgetFilePassword(name);
      });
      d.setStatus(t("st.rekeyed"));
    } catch (e) { reportError(e); d.setStatus(t("st.rekeyFailed", { e: errMsg(e) }), { error: true }); }
    d.onDocChanged();
  }

  // ── DOM 接线 ──
  const blockIfGuarded = (e: Event) => { if (parked) return; if (!canEdit()) e.preventDefault(); };   // 2.0：parked = 工程模式接管 textarea，守卫归它（否则原生退格/粘贴被这里拦死，user 2026-09-10「退格键不识别」）
  for (const evt of ["beforeinput", "paste", "cut", "drop"]) d.editor.addEventListener(evt, blockIfGuarded);
  d.editor.addEventListener("input", () => {
    if (!canEdit()) return;
    scheduleLocalSave();
    d.setState(statusForDoc(), { unsynced: d.isSignedIn() });
  });
  onLockChange((unlocked) => { if (!unlocked && st.encrypted && st.name) { void lockNow(); } });
  async function lockNow(): Promise<void> {
    // 锁定前 flush（否则最后几秒的字困在 textarea 里没法加密落盘）——注意：此刻密码已清，persist 会抛 LockedError；
    // 所以锁定由 app 层先 flushLocal 再调 crypto-state.lock()。这里只是兜底把画面清掉。
    st.locked = true;
    d.editor.value = ""; savedText = "";
    applyGuards(); d.onDocChanged();
    d.setState("");
  }

  /** IME/语音提交插入后调（不走 input 事件的路径）。 */
  function noteExternalEdit(): void {
    if (!canEdit()) return;
    scheduleLocalSave();
    d.setState(statusForDoc(), { unsynced: d.isSignedIn() });
  }

  return {
    state: st,
    open, newDoc, clear, reload,
    flushLocal, pushNow, refreshIfClean,
    toggleEncryption, rekeyToCurrent, noteExternalEdit, moveTo, currentDir, renameTo, displayName,
    canEdit, statusForDoc, syncKind,
    isDirty: () => !parked && (!!localTimer || pushPending || d.editor.value !== savedText),
    isUnlockedDoc: () => st.encrypted && isUnlocked(),
    lastOpenName: () => deviceKvGet(KV_LAST_OPEN),   // 裸字符串（写的就是裸的）。2026-09-10 前这里走 JSON.parse → 永远 null → 每次刷新都开「最新一篇」而不是上次那篇（user「刷新之后说文件找不到」的根：排序变了就跳到没缓存的稿）
    /** 工程模式接管前：flush 后静默；resume 后恢复守卫。parked 期间 canEdit/isDirty 恒 false，syncKind 由 app 门面绕开。 */
    park: async () => { await flushLocal(); parked = true; st.name = null; st.pendingDate = null; st.pendingTitle = null; },
    resume: () => { parked = false; applyGuards(); },
    isParked: () => parked,
  };
}

function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }
export type Editor = ReturnType<typeof createEditor>;
