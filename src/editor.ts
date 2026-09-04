// 编辑器控制器：textarea + 标题框 ↔ 当前稿（docs 层）。created 2026-09-03 by Claude Fable 5.1
// 人类钉死的行为（docs/20260524-editor-ux.md + sync-design.md）：
//   · 200ms 本地落盘；15s 防抖 + 30s 心跳推云；推后下次计时只在下一次击键才起（无后台轮询）。
//   · 状态文案稳定不跳（未同步 / 正在同步… / 已保存 HH:MM:SS），不做倒计时。
//   · 只读 = 不用 readOnly 属性（Chromium 会藏光标）：beforeinput/paste/cut/drop preventDefault。
//   · 打开落在开头（moveCaretToStart）。
//   · 加密稿：locked 时编辑区空白 + 禁输入；解锁循环在 busy 外；错密码不碰文件（库 seal 保证）。
//   · 新稿惰性物化：没内容前不建文件（v1 的「自动空稿清理」由此消失）。
import { LOCAL_SAVE_DEBOUNCE_MS, PUSH_DEBOUNCE_MS, PUSH_HEARTBEAT_MS, RENAME_DEBOUNCE_MS } from "./config.ts";
import { formatDate, parseDocName, splitDocPath } from "./doc-model.ts";
import { readDoc, saveDoc, createDoc, renameDoc, pullDocIfClean, setActiveDoc, encryptDoc, decryptDoc, moveDoc } from "./docs.ts";
import { isUnlocked, onLockChange, renameFilePassword, forgetFilePassword, fileUsesOtherPassword } from "./crypto-state.ts";
import { deviceKvGetJson, deviceKvSetJson, deviceKvSet } from "./device-kv.ts";
import { reportError } from "./error-badge.ts";
import { t } from "./i18n/index.ts";

export interface StatusOpts { error?: boolean; unsynced?: boolean }
export interface EditorDeps {
  editor: HTMLTextAreaElement;
  titleInput: HTMLInputElement;
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
}

const KV_READONLY = "readonly-names";
const KV_LAST_OPEN = "last-open";

export interface EditorState {
  name: string | null;          // 已物化的身份；新稿未物化时 null（看 pendingDate）
  pendingDate: string | null;   // 新稿：物化时用的日期前缀
  pendingDir: string;           // 新稿：物化落在哪个夹（"" = 根；ADR-0006 多文件夹）
  encrypted: boolean;
  locked: boolean;              // 加密且未解锁（编辑区空白）
  readOnly: boolean;            // per-device 只读保护
  unavailable: boolean;         // 本地无且云端不可达
}

export function createEditor(d: EditorDeps) {
  const st: EditorState = { name: null, pendingDate: null, pendingDir: "", encrypted: false, locked: false, readOnly: false, unavailable: true };   // boot 前不可打字（open/newDoc 才放行）
  let savedText = "";      // 最近一次落盘的正文（判 dirty）
  let savedTitle = "";     // 最近一次落盘/改名的标题
  let localTimer: ReturnType<typeof setTimeout> | null = null;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let renameTimer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt = 0;
  let pushPending = false;     // 有落盘但未推的字节
  let loadGen = 0;             // open 竞态守卫
  let refreshInFlight = false;

  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const readOnlyNames = (): string[] => deviceKvGetJson<string[]>(KV_READONLY, []);
  const isReadOnlyName = (n: string | null) => !!n && readOnlyNames().includes(n);

  function moveCaretToStart(): void {
    try { d.editor.selectionStart = 0; d.editor.selectionEnd = 0; } catch { /* some inputs reject */ }
    d.editor.scrollTop = 0;
  }
  function applyGuards(): void {
    const blocked = st.readOnly || st.locked || st.unavailable;
    d.editor.classList.toggle("locked", blocked);
    d.titleInput.classList.toggle("locked", blocked);
  }
  // zen（user 2026-09-04）：干净态 / 锁态留白——只有「未同步 / 本地草稿 / 不可用 / 加密未成」这种要人知道的才出字。
  function statusForDoc(): string {
    if (st.locked) return "";
    if (encryptPending) return t("st.encryptPendingHint");
    if (st.unavailable) return t("st.unavailable");
    if (pushPending || localTimer) return d.isSignedIn() ? t("st.unsynced") : t("st.localDraft");
    return "";
  }
  const canEdit = () => !st.readOnly && !st.locked && !st.unavailable;

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
      if (st.locked || st.unavailable || st.readOnly) return;   // 锁定/不可用/只读稿绝不写（other-password 态尤其：否则用当前密码封空容器覆盖，审计 UI-3）
      if (renameInFlight) { scheduleLocalSave(); return; }
      const text = d.editor.value, title = d.titleInput.value;
      if (!st.name) {
        if (!st.pendingDate) return;
        if (!text && !title) return;   // 空稿不物化
        const name = await createDoc(title, text, st.pendingDate, st.pendingDir);
        if (gen !== loadGen) return;   // 建稿期间用户切走了：文件留在本地（下次列表可见），不把身份塞给现在的编辑器
        // 新建时就定好的加密（user 2026-09-03「加密是一开始就定好的」）：物化即封——先封再把 name 暴露给 UI/抽屉，明文只在本地 IDB 停留这一步，永不推云（createDoc 是 tryPush:false）。
        if (st.encrypted) {
          try { await encryptDoc(name); encryptPending = false; }
          catch (e) { encryptPending = true; reportError(e, "warning"); }   // 保持「预定加密」：不推云，状态栏常驻提示，下次 persist 重试
          if (gen !== loadGen) return;
        }
        st.name = name; st.pendingDate = null;
        savedText = text; savedTitle = parseDocName(name).title;
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
        if (r.resolution === "takeCloud" && st.name === name) await reload(name);   // 世界线换了：整体重载（2026-08-25 案卷）
      } else {
        pushPending = true;
      }
    })();
    persistInFlight = run;
    try { await run; } finally { if (persistInFlight === run) persistInFlight = null; }
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
    if (!localTimer && !renameTimer) return;
    if (localTimer) { clearTimeout(localTimer); localTimer = null; }
    if (renameTimer) { clearTimeout(renameTimer); renameTimer = null; await applyRename(); }
    if (!canEdit()) return;
    try { await persist(false); } catch (e) { reportError(e); }
  }

  // ── 标题 = 身份（改名防抖）──
  function scheduleRename(): void {
    if (renameTimer) clearTimeout(renameTimer);
    renameTimer = setTimeout(() => { renameTimer = null; void applyRename(); }, RENAME_DEBOUNCE_MS);
  }
  async function applyRename(): Promise<void> {
    const title = d.titleInput.value.trim();
    if (!st.name) return;   // 未物化：物化时用标题
    if (title === savedTitle || !title) return;   // 空标题不改名（禁「未命名」，有名保名）
    const gen = loadGen;
    renameInFlight = true;
    try {
      const rr = await renameDoc(st.name, title);
      if (gen !== loadGen) return;
      if (!rr) { d.setStatus(t("st.renameFailed"), { error: true }); return; }
      const newName = rr.name;
      if (rr.oldKept) d.setStatus(t("st.renameOldKept"), { error: true });        // 库把旧名原地留着（谱系不明降级 save-as）——抽屉会出现两份，告诉用户（审计 L18）
      else if (rr.cloudDeferred) d.setStatus(t("st.renameCloudDeferred"), { unsynced: true });
      if (newName !== st.name) {
        const roNames = readOnlyNames();
        if (roNames.includes(st.name)) deviceKvSetJson(KV_READONLY, roNames.map((n) => (n === st.name ? newName : n)));
        renameFilePassword(st.name, newName);
        st.name = newName; setActiveDoc(newName); deviceKvSet(KV_LAST_OPEN, newName);
      }
      savedTitle = parseDocName(newName).title;
      d.onDocChanged();
      if (d.isSignedIn()) schedulePush();   // 改名的云端腿由库在 tryMove 内做；这里只是让状态栏跟上
    } catch (e) { reportError(e); }
    finally {
      renameInFlight = false;
      if (gen === loadGen && d.editor.value !== savedText) scheduleLocalSave();   // 改名期间挂起的正文补落盘
    }
  }

  // ── 打开 / 新建 ──
  async function reload(name: string): Promise<void> { await open(name, { keepCaret: true }); }

  /** promptUnlock：只有用户手势（抽屉点开 / 锁图标）才弹密码框——「加密永不自动弹框」（冷启动续写、锁定后 reload、重置后 reload 都不弹）。 */
  async function open(name: string, opts: { keepCaret?: boolean; promptUnlock?: boolean } = {}): Promise<boolean> {
    d.onBeforeLoad?.();
    await flushLocal();
    encryptPending = false; pushFailures = 0;
    const gen = ++loadGen;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    firstDirtyAt = 0; pushPending = false;
    const caret = opts.keepCaret ? d.editor.selectionStart : 0;
    st.name = name; st.pendingDate = null; st.readOnly = isReadOnlyName(name); st.unavailable = false; st.locked = false; st.encrypted = false;
    setActiveDoc(name); deviceKvSet(KV_LAST_OPEN, name);
    d.setStatus(t("st.loading"));
    let r = await readDoc(name);
    if (gen !== loadGen) return false;
    if (r.kind === "locked" || r.kind === "other-password") {
      st.encrypted = true; st.locked = true;
      d.editor.value = ""; d.titleInput.value = parseDocName(name).title; savedTitle = d.titleInput.value; savedText = "";
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
      d.titleInput.value = parseDocName(name).title; savedTitle = d.titleInput.value;
      applyGuards();
      if (opts.keepCaret) { try { d.editor.selectionStart = d.editor.selectionEnd = Math.min(caret, r.text.length); } catch { /* ignore */ } }
      else moveCaretToStart();
      d.setState(statusForDoc());
      d.onDocChanged();
      if (r.encoding !== "utf-8" && r.encoding !== "utf-8-bom" && canEdit()) {   // 旧编码 → 以 UTF-8 写回（v1 同款规范化）
        void saveDoc(name, r.text, { push: d.isSignedIn() }).catch((e) => reportError(e, "log"));
      }
      return true;
    }
    if (r.kind === "locked" || r.kind === "other-password") { d.setStatus(t("st.wrongPasswordOrLocked"), { error: true }); return true; }
    st.unavailable = true;
    d.editor.value = ""; d.titleInput.value = parseDocName(name).title; savedText = ""; savedTitle = d.titleInput.value;
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
    loadGen++;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    firstDirtyAt = 0; pushPending = false;
    const dir = opts.dir ?? currentDir();
    st.name = null; st.pendingDate = formatDate(Date.now()); st.pendingDir = dir; st.encrypted = !!opts.encrypted; st.locked = false; st.readOnly = false; st.unavailable = false;
    setActiveDoc(null); deviceKvSet(KV_LAST_OPEN, null);
    d.editor.value = ""; d.titleInput.value = ""; savedText = ""; savedTitle = "";
    applyGuards();
    d.setState(st.encrypted ? t("st.pendingEncrypted") : "");
    d.onDocChanged();
    d.titleInput.focus();
    return true;
  }

  /** 当前稿被移到回收站 / 被别处改名后：编辑器变成一篇**空新稿**（可继续写，落盘有身份；审计 UI-4：以前是无身份可打字、永不落盘）。 */
  function clear(): void {
    d.onBeforeLoad?.();
    loadGen++;
    if (localTimer) { clearTimeout(localTimer); localTimer = null; }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (renameTimer) { clearTimeout(renameTimer); renameTimer = null; }
    const dir = currentDir();
    st.name = null; st.pendingDate = formatDate(Date.now()); st.pendingDir = dir; st.encrypted = false; st.locked = false; st.readOnly = false; st.unavailable = false;
    pushPending = false; encryptPending = false; pushFailures = 0;
    setActiveDoc(null); deviceKvSet(KV_LAST_OPEN, null);
    d.editor.value = ""; d.titleInput.value = ""; savedText = ""; savedTitle = "";
    applyGuards(); d.setState(""); d.onDocChanged();
  }

  // ── 新鲜度（focus/online/idle 复查）：只干净快进；dirty 留给推送的冲突面 ──
  async function refreshIfClean(): Promise<void> {
    const name = st.name;
    if (!name || refreshInFlight || !d.isSignedIn() || st.locked) return;
    if (localTimer || renameTimer || pushPending) return;
    refreshInFlight = true;
    const gen = loadGen;
    try {
      const r = await pullDocIfClean(name);
      if (gen !== loadGen) return;
      if (r.status === "fast-forwarded") {
        await reload(name);
        d.setStatus(t("st.loadedCloudLatest", { time: fmtTime(Date.now()) }));
      } else if (r.status === "cloud-absent") {
        d.setStatus(t("st.cloudGone"), { error: true });
      }
    } catch (e) { reportError(e, "log"); }
    finally { refreshInFlight = false; }
  }

  // ── 只读保护（per-device）──
  function toggleReadOnly(): void {
    if (!st.name) return;
    const names = readOnlyNames();
    const next = !names.includes(st.name);
    deviceKvSetJson(KV_READONLY, next ? [...names, st.name] : names.filter((n) => n !== st.name));
    st.readOnly = next;
    applyGuards(); d.onDocChanged();
  }

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
      try {
        const r = await busy(t("busy.encrypting"), () => encryptDoc(name));
        st.encrypted = true;
        d.setStatus(t("st.encrypted", { time: fmtTime(Date.now()), status: r.status }));
      } catch (e) { reportError(e); d.setStatus(t("st.encryptFailed", { e: errMsg(e) }), { error: true }); }
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
      if (rr.name !== from) {
        const roNames = readOnlyNames();
        if (roNames.includes(from)) deviceKvSetJson(KV_READONLY, roNames.map((n) => (n === from ? rr.name : n)));
        renameFilePassword(from, rr.name);
        st.name = rr.name; setActiveDoc(rr.name); deviceKvSet(KV_LAST_OPEN, rr.name);
      }
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
      await busy(t("busy.rekeying"), async () => { await decryptDoc(name); forgetFilePassword(name); await encryptDoc(name); });
      d.setStatus(t("st.rekeyed"));
    } catch (e) { reportError(e); d.setStatus(t("st.rekeyFailed", { e: errMsg(e) }), { error: true }); }
    d.onDocChanged();
  }

  // ── DOM 接线 ──
  const blockIfGuarded = (e: Event) => { if (!canEdit()) e.preventDefault(); };
  for (const el of [d.editor, d.titleInput]) for (const evt of ["beforeinput", "paste", "cut", "drop"]) el.addEventListener(evt, blockIfGuarded);
  d.editor.addEventListener("input", () => {
    if (!canEdit()) return;
    d.setState(d.isSignedIn() ? t("st.unsynced") : t("st.localDraft"), { unsynced: d.isSignedIn() });
    scheduleLocalSave();
  });
  d.titleInput.addEventListener("input", () => {
    if (!canEdit()) return;
    if (/[\r\n]/.test(d.titleInput.value)) d.titleInput.value = d.titleInput.value.replace(/[\r\n]+/g, " ");
    d.setState(d.isSignedIn() ? t("st.unsynced") : t("st.localDraft"), { unsynced: d.isSignedIn() });
    if (st.name) scheduleRename(); else scheduleLocalSave();
  });
  d.titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); d.editor.focus(); } });
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
    d.setState(t("st.unsynced"), { unsynced: d.isSignedIn() });
    scheduleLocalSave();
  }

  return {
    state: st,
    open, newDoc, clear, reload,
    flushLocal, pushNow, refreshIfClean,
    toggleReadOnly, toggleEncryption, rekeyToCurrent, noteExternalEdit, moveTo, currentDir,
    canEdit, statusForDoc,
    isDirty: () => !!localTimer || pushPending || d.editor.value !== savedText,
    isUnlockedDoc: () => st.encrypted && isUnlocked(),
    lastOpenName: () => (deviceKvGetJson<string | null>(KV_LAST_OPEN, null) ?? null),
  };
}

function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }
export type Editor = ReturnType<typeof createEditor>;
