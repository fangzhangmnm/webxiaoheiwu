// 内置中文 IME 适配器：RIME(WASM worker) 后端 + starter-map 降级后端。created 2026-09-03 by Claude Fable 5.1（自 v1 src/ime.js 移植）。
// 人类钉死的行为（docs/20260524-quest-ime.md + 2026-09-03 修订）：**默认开、全平台**（user：「直接不用系统输入法了…也是一层隐私 paranoid」），
//   逃生开关 per-device（「用系统输入法」）；只在组合中才吃按键（Ctrl+C/V/X 永远放行）；Shift 单击切中英（app 层）；
//   方案 = 全拼（luna_pinyin，默认）/ 微软双拼（double_pinyin_mspy）（user 2026-09-03「就全拼微软」；不开笔画——但 stroke 文件必须留：worker 清单里全拼反查硬依赖它）。
// worker 内部自持两个 IDB（"ime" 词典下载缓存 + IDBFS /rime 用户词库）——第三方派生缓存，可再生（词典来自 vendored 文件；
//   用户词库经 rime-user-dict collection 跨设备同步）。

const NATURAL_CODE_STARTER_MAP: Record<string, string[]> = {
  ni: ["你", "呢", "泥"], wo: ["我", "握", "窝"], ta: ["他", "她", "它"], men: ["们", "门", "闷"], shi: ["是", "时", "事"],
  zai: ["在", "再", "载"], de: ["的", "得", "地"], bu: ["不", "步", "部"], yi: ["一", "已", "以"], zhe: ["这", "者", "着"],
  na: ["那", "哪", "纳"], ai: ["爱", "矮", "哎"], ma: ["吗", "妈", "马"], le: ["了", "乐", "勒"], ren: ["人", "仁", "忍"],
  wen: ["文", "问", "闻"], xie: ["写", "谢", "鞋"], xiaoshuo: ["小说"],
};
const RIME_WORKER_URL = "./vendor/my-rime/worker.js";
export const IME_SCHEMAS = ["luna_pinyin", "luna_pinyin_fluency", "double_pinyin_mspy", "double_pinyin", "double_pinyin_flypy", "double_pinyin_abc", "double_pinyin_pyjj", "wubi86"] as const;
export type ImeSchema = (typeof IME_SCHEMAS)[number];   // 全拼（默认）/ 语句流 / 微软·自然码·小鹤·ABC·拼音加加 双拼（user「双拼顺手支持其他方案」）/ 五笔86（「加一个五笔玩玩」，依赖 pinyin_simp → stroke）
export const DEFAULT_SCHEMA: ImeSchema = "luna_pinyin";
export const isImeSchema = (v: unknown): v is ImeSchema => (IME_SCHEMAS as readonly string[]).includes(v as string);
const PUNCTUATION_KEYS = new Set([",", ".", ";", ":", "?", "!", '"', "'", "(", ")", "<", ">", "{", "}", "[", "]", "\\", "~", "@", "#", "$", "&", "*", "|"]);

export type ImeResult = { type: "passthrough" | "composing" | "clear" | "toggle" } | { type: "commit"; text: string; consumedBuffer: string };
export interface ImeState { enabled: boolean; asciiMode: boolean; buffer: string; candidates: string[]; engine: string; initializeError: string | null }

interface Backend {
  engine: string;
  readonly busy?: boolean;
  getState(): { buffer: string; candidates: string[]; engine: string };
  resetState(): void;
  typeLetter(letter: string): Promise<ImeResult>;
  typePunctuation(key: string): Promise<ImeResult>;
  backspace(): Promise<ImeResult>;
  clear(): Promise<ImeResult>;
  chooseCandidate(index: number): Promise<ImeResult>;
  commitDefault(withNewline: boolean): Promise<ImeResult>;
  changePage(prev: boolean): Promise<ImeResult>;
  dumpUserDir?(): Promise<UserDictDump>;
  restoreUserDir?(dump: UserDictDump): Promise<void>;
  setSimplified?(v: boolean): Promise<void>;
}
export interface UserDictDump { files: { path: string; data: string }[]; savedAt?: number; device?: string }

const isAsciiLetter = (e: KeyboardEvent) => !(e.ctrlKey || e.altKey || e.metaKey) && /^[a-z]$/i.test(e.key);
const isRoutedPunct = (e: KeyboardEvent) => !(e.ctrlKey || e.altKey || e.metaKey) && PUNCTUATION_KEYS.has(e.key);

class StarterMapBackend implements Backend {
  engine = "starter-map";
  buffer = "";
  candidates: string[] = [];
  getState() { return { buffer: this.buffer, candidates: this.candidates, engine: this.engine }; }
  resetState() { this.buffer = ""; this.candidates = []; }
  async typeLetter(letter: string): Promise<ImeResult> { this.buffer += letter; this.candidates = NATURAL_CODE_STARTER_MAP[this.buffer] ?? []; return { type: "composing" }; }
  async backspace(): Promise<ImeResult> {
    if (!this.buffer) return { type: "passthrough" };
    this.buffer = this.buffer.slice(0, -1);
    this.candidates = this.buffer ? NATURAL_CODE_STARTER_MAP[this.buffer] ?? [] : [];
    return this.buffer ? { type: "composing" } : { type: "clear" };
  }
  async clear(): Promise<ImeResult> { this.resetState(); return { type: "clear" }; }
  async chooseCandidate(index: number): Promise<ImeResult> {
    const selected = this.candidates[index];
    if (!selected) return { type: "composing" };
    const consumedBuffer = this.buffer; this.resetState();
    return { type: "commit", text: selected, consumedBuffer };
  }
  async commitDefault(withNewline: boolean): Promise<ImeResult> {
    const selected = this.candidates[0] ?? this.buffer; const consumedBuffer = this.buffer; this.resetState();
    return { type: "commit", text: withNewline ? `${selected}\n` : selected, consumedBuffer };
  }
  async changePage(): Promise<ImeResult> { return { type: "composing" }; }
  async typePunctuation(): Promise<ImeResult> { return { type: "passthrough" }; }
}

const b64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!); return btoa(s); };
const unb64 = (s: string) => { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

class RimeWorkerBackend implements Backend {
  engine = "rime";
  schema: ImeSchema = DEFAULT_SCHEMA;
  worker: Worker | null = null;
  queue: Promise<unknown> = Promise.resolve();
  buffer = "";
  candidates: string[] = [];

  async initialize(schema: ImeSchema): Promise<void> {
    this.worker = new Worker(RIME_WORKER_URL);
    await this.setSchema(schema);
  }
  simplified = true;
  /** 会话开关：简/繁（user 2026-09-04「quest 输入法拼命出繁体」）、中文标点、关 emoji 候选（luna 方案默认开，写小说是噪音）。
   *  Quest 首次部署是异步的、deploy 完成会刷新会话——开关可能被打回方案默认（繁体）→ 除了换方案后设一次，**每次起组字前再重申一次**（一次 ccall，零成本），不赌会话状态。 */
  async applyOptions(): Promise<void> {
    await this.call("setOption", "simplification", this.simplified ? 1 : 0);
    await this.call("setOption", "ascii_punct", 0);
    await this.call("setOption", "emoji_suggestion", 0);
  }
  setSchema(schema: ImeSchema): Promise<void> {
    this.schema = schema;
    return this.enqueue(async () => { await this.call("setIME", schema); await this.applyOptions(); this.resetState(); });
  }
  setSimplified(v: boolean): Promise<void> { this.simplified = v; return this.enqueue(() => this.applyOptions()); }
  getState() { return { buffer: this.buffer, candidates: this.candidates, engine: this.engine }; }
  resetState() { this.buffer = ""; this.candidates = []; }
  private pending = 0;
  get busy(): boolean { return this.pending > 0; }   // 任务在飞：首字回包前空格/退格/数字要排在它后面，不能按「缓冲为空」直通
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.pending++;
    const p = this.queue.then(task, task); this.queue = p.catch(() => {});
    p.then(() => { this.pending--; }, () => { this.pending--; });
    return p;
  }
  // RPC 通道严格串行：my-rime worker 协议无请求 id，响应靠「下一条 success/error」配对——两路并飞就错位
  //   （2026-09-04 smoke 抓到：清缓冲与换方案并飞 → 微软双拼拿到上一条的候选、五笔空）。任务级原子性仍由 enqueue 负责。
  private rpcChain: Promise<unknown> = Promise.resolve();
  call(name: string, ...args: unknown[]): Promise<any> {
    const run = () => this.rawCall(name, ...args);
    const p = this.rpcChain.then(run, run); this.rpcChain = p.catch(() => {}); return p;
  }
  private rawCall(name: string, ...args: unknown[]): Promise<any> {
    const w = this.worker;
    if (!w) return Promise.reject(new Error("RIME worker is not ready"));
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        const data = event.data as { type?: string; result?: unknown; error?: { message?: string } } | null;
        if (!data || (data.type !== "success" && data.type !== "error")) return;
        w.removeEventListener("message", onMessage); w.removeEventListener("error", onError);
        if (data.type === "error") { reject(new Error(data.error?.message ?? "worker error")); return; }
        const r = data.result;
        if (typeof r === "string") { try { resolve(JSON.parse(r)); } catch { resolve(r); } } else resolve(r);
      };
      const onError = (event: ErrorEvent) => { w.removeEventListener("message", onMessage); w.removeEventListener("error", onError); reject(new Error(event.message || "worker runtime error")); };
      w.addEventListener("message", onMessage); w.addEventListener("error", onError);
      w.postMessage({ name, args, transferableIndices: [] });
    });
  }
  normalize(result: any): ImeResult {
    if (!result || typeof result !== "object") return { type: "passthrough" };
    if (typeof result.committed === "string") { const consumedBuffer = this.buffer; this.resetState(); return { type: "commit", text: result.committed, consumedBuffer }; }
    if (result.state === 1) {
      this.buffer = result.body ?? "";
      this.candidates = Array.isArray(result.candidates) ? result.candidates.map((c: { text?: string }) => c.text ?? "") : [];
      return { type: "composing" };
    }
    this.resetState(); return { type: "clear" };
  }
  typeLetter(letter: string) { return this.enqueue(async () => { if (!this.buffer) await this.applyOptions(); return this.normalize(await this.call("process", letter)); }); }
  typePunctuation(key: string) { return this.enqueue(async () => this.normalize(await this.call("process", key))); }
  backspace() { return this.enqueue(async () => this.normalize(await this.call("process", "{BackSpace}"))); }
  clear() { return this.enqueue(async () => this.normalize(await this.call("process", "{Escape}"))); }
  chooseCandidate(index: number) { return this.enqueue(async () => this.normalize(await this.call("selectCandidateOnCurrentPage", index))); }
  commitDefault(withNewline: boolean) {
    return this.enqueue(async () => {
      const n = this.normalize(await this.call("process", " "));
      return n.type === "commit" && withNewline ? { ...n, text: `${n.text}\n` } : n;
    });
  }
  changePage(prev: boolean) { return this.enqueue(async () => this.normalize(await this.call("changePage", prev))); }

  // ── 用户词库 dump/restore（worker fsOperate 直通 IDBFS /rime）──
  async dumpUserDir(): Promise<UserDictDump> { const dump: UserDictDump = { files: [] }; await this._dumpRecursive("/rime", "", dump.files); return dump; }
  private async _dumpRecursive(absRoot: string, relPath: string, accum: { path: string; data: string }[]): Promise<void> {
    const path = relPath ? `${absRoot}/${relPath}` : absRoot;
    let entries: string[];
    try { entries = await this.call("fsOperate", "readdir", path); } catch { return; }
    for (const name of entries) {
      if (name === "." || name === "..") continue;
      const childRel = relPath ? `${relPath}/${name}` : name;
      const childAbs = `${absRoot}/${childRel}`;
      let stat: { mode?: number } | null;
      try { stat = await this.call("fsOperate", "stat", childAbs); } catch { continue; }
      const isDir = ((stat?.mode ?? 0) & 0o170000) === 0o040000;
      if (isDir) await this._dumpRecursive(absRoot, childRel, accum);
      else {
        try { const data = await this.call("fsOperate", "readFile", childAbs); accum.push({ path: childRel, data: b64(data instanceof Uint8Array ? data : new Uint8Array(data)) }); }
        catch { /* skip unreadable */ }
      }
    }
  }
  async restoreUserDir(dump: UserDictDump): Promise<void> {
    if (!dump?.files?.length) return;
    const root = "/rime";
    for (const entry of dump.files) {
      const parts = entry.path.split("/").slice(0, -1);
      let cur = root;
      for (const part of parts) { cur = `${cur}/${part}`; try { await this.call("fsOperate", "mkdir", cur); } catch { /* EEXIST */ } }
      try { await this.call("fsOperate", "writeFile", `${root}/${entry.path}`, unb64(entry.data)); }
      catch (e) { console.warn("[ime] restoreUserDir write failed", entry.path, e); }
    }
    try { await this.call("setIME", this.schema); await this.applyOptions(); }
    catch (e) { console.warn("[ime] restoreUserDir re-init failed", e); }
  }
}

export class NaturalCodeIME {
  enabled = false;
  asciiMode = false;
  simplified = true;   // 简体（默认）/ 繁體；synced pref 跟人走，app 层在 initialize 前灌入
  // JS 层标点覆盖（方案层的 punctuation 改不了：wasm librime 重建 schema 要源 yaml）：
  //   ` 中文态出间隔号「·」、~ 出全角「～」（user 2026-09-04「我说的是反引号…波浪号和 windows 一样吧」）；
  //   引号样式 = 设置项（user「引号变成方形的…我觉得设置」）：curly = 交给 RIME 的 “” ‘’；corner = 「」『』 交替开合（语音标点同步走 zh-punct）。
  quoteStyle: "curly" | "corner" = "curly";
  private quoteOpen = { d: true, s: true };
  private punctOverride(key: string): string | null {
    if (key === "`") return "·";
    if (key === "~") return "～";   // 与 Windows 微软拼音一致（RIME 默认对 ~ 弹半角/全角候选菜单，多一步）
    if (this.quoteStyle !== "corner") return null;
    if (key === '"') { const ch = this.quoteOpen.d ? "「" : "」"; this.quoteOpen.d = !this.quoteOpen.d; return ch; }
    if (key === "'") { const ch = this.quoteOpen.s ? "『" : "』"; this.quoteOpen.s = !this.quoteOpen.s; return ch; }
    return null;
  }
  async setSimplified(v: boolean): Promise<void> { this.simplified = v; if (this.backend.setSimplified) { try { await this.backend.setSimplified(v); } catch (e) { console.warn("[ime] setSimplified failed", e); } } }
  backend: Backend = new StarterMapBackend();
  initializeError: string | null = null;
  initialized = false;

  private initPromise: Promise<void> | null = null;
  schema: ImeSchema = DEFAULT_SCHEMA;
  async initialize(schema: ImeSchema = this.schema): Promise<void> {
    this.schema = schema;
    if (this.initialized) return;
    if (!this.initPromise) this.initPromise = (async () => {   // 加载中连点不起第二个 worker（审计 UI-21）
      const rime = new RimeWorkerBackend();
      rime.simplified = this.simplified;
      try { await rime.initialize(schema); this.backend = rime; this.initializeError = null; }
      catch (e) { this.backend = new StarterMapBackend(); this.initializeError = e instanceof Error ? e.message : "unknown RIME init error"; }
      this.initialized = true;
    })();
    await this.initPromise;
  }
  /** 换方案（全拼 ↔ 微软双拼）；未初始化时只记下，初始化时生效。 */
  async setSchema(schema: ImeSchema): Promise<void> {
    this.schema = schema;
    const b = this.backend as { setSchema?: (s: ImeSchema) => Promise<void> };
    if (b.setSchema) { try { await b.setSchema(schema); } catch (e) { console.warn("[ime] setSchema failed", e); } }
  }
  /** 终止 RIME worker（还原出厂前：worker 活着 IDB 删库必 blocked）。之后 initialize 可重来。 */
  dispose(): void {
    const b = this.backend as { worker?: Worker | null };
    if (b.worker) { try { b.worker.terminate(); } catch { /* ignore */ } b.worker = null; }
    this.backend = new StarterMapBackend(); this.initialized = false; this.initPromise = null; this.enabled = false;
  }
  getState(): ImeState {
    const s = this.backend.getState();
    return { enabled: this.enabled, asciiMode: this.asciiMode, buffer: s.buffer, candidates: s.candidates, engine: s.engine, initializeError: this.initializeError };
  }
  isComposing(): boolean { return this.enabled && !this.asciiMode && (this.backend.getState().buffer.length > 0 || !!this.backend.busy); }
  resetComposition(): void { this.backend.resetState(); void this.backend.clear().catch(() => {}); }   // JS 态与 worker 缓冲一起清（只清 JS 会让下一击接在 worker 残留拼音后面——2026-09-04 探针抓到 zhe→「zhezhe」）
  async dumpUserDir(): Promise<UserDictDump | null> { if (!this.backend.dumpUserDir) return null; try { return await this.backend.dumpUserDir(); } catch (e) { console.warn("[ime] dumpUserDir failed", e); return null; } }
  async restoreUserDir(dump: UserDictDump): Promise<void> { if (!this.backend.restoreUserDir) return; try { await this.backend.restoreUserDir(dump); } catch (e) { console.warn("[ime] restoreUserDir failed", e); } }

  /** Shift 单击：中 ↔ EN。切到 EN 时把未完成的拼音原样提交。 */
  async toggleAsciiMode(): Promise<ImeResult> {
    const toAscii = !this.asciiMode;
    const pending = this.backend.getState().buffer;
    await this.backend.clear();
    this.asciiMode = toAscii;
    if (toAscii && pending) return { type: "commit", text: pending, consumedBuffer: pending };
    return { type: "clear" };
  }

  async onKeydown(event: KeyboardEvent): Promise<ImeResult> {
    if (!this.enabled || this.asciiMode) return { type: "passthrough" };
    if (isAsciiLetter(event)) { event.preventDefault(); return await this.backend.typeLetter(event.key.toLowerCase()); }
    if (!(event.ctrlKey || event.altKey || event.metaKey)) {   // JS 层标点覆盖（RIME 方案层改不了，见 punctOverride）
      const p = this.punctOverride(event.key);
      if (p != null) {
        event.preventDefault();
        if (this.isComposing()) { const r = await this.backend.commitDefault(false); if (r.type === "commit") return { type: "commit", text: r.text + p, consumedBuffer: r.consumedBuffer }; }
        return { type: "commit", text: p, consumedBuffer: "" };
      }
    }
    if (isRoutedPunct(event)) {
      const isPaginator = this.isComposing() && (event.key === "[" || event.key === "]");
      if (!isPaginator) { event.preventDefault(); return await this.backend.typePunctuation(event.key); }
    }
    if (!this.isComposing()) return { type: "passthrough" };
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (event.key === "z" || event.key === "Z")) { event.preventDefault(); return await this.backend.clear(); }   // 组字中 Ctrl+Z = 撤掉拼音，别让浏览器在拼音底下动正文
    if (event.key === "Backspace") { event.preventDefault(); return await this.backend.backspace(); }
    if (event.key === "Escape") { event.preventDefault(); return await this.backend.clear(); }
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); return await this.backend.chooseCandidate(Number(event.key) - 1); }
    if (event.key === " ") { event.preventDefault(); return await this.backend.commitDefault(false); }
    if (event.key === "Enter") { event.preventDefault(); return await this.backend.commitDefault(true); }
    if (event.key === "PageDown" || event.key === "]" || event.key === "=") { event.preventDefault(); return await this.backend.changePage(false); }
    if (event.key === "PageUp" || event.key === "[" || event.key === "-") { event.preventDefault(); return await this.backend.changePage(true); }
    return { type: "passthrough" };
  }
}
