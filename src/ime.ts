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
export interface ImeState { enabled: boolean; asciiMode: boolean; buffer: string; candidates: string[]; engine: string; initializeError: string | null; /** 候选翻到第几页（0 起）；hasMore = 后面还有。软键盘候选条的「更多」用。 */ page: number; hasMore: boolean }

interface Backend {
  engine: string;
  readonly busy?: boolean;
  getState(): { buffer: string; candidates: string[]; engine: string; page?: number; hasMore?: boolean };
  resetState(): void;
  typeLetter(letter: string): Promise<ImeResult>;
  typePunctuation(key: string): Promise<ImeResult>;
  backspace(): Promise<ImeResult>;
  clear(): Promise<ImeResult>;
  chooseCandidate(index: number): Promise<ImeResult>;
  commitDefault(withNewline: boolean): Promise<ImeResult>;
  /** 组字区原样上屏（已选的字 + 剩下的字母；v2.3.33 回车的语义，同 iOS「确认」/ 微软拼音）。 */
  commitRaw(): Promise<ImeResult>;
  changePage(prev: boolean): Promise<ImeResult>;
  dumpUserDir?(): Promise<UserDictDump>;
  restoreUserDir?(dump: UserDictDump): Promise<void>;
  setSimplified?(v: boolean): Promise<void>;
  /** 候选每页几个（v2.1.34：软键盘露着时 40 → 候选条整条横滑；PC 悬浮条 9 → 数字选词）。 */
  setPageSize?(n: number): Promise<void>;
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
  async commitRaw(): Promise<ImeResult> { const consumedBuffer = this.buffer; const text = this.buffer; this.resetState(); return text ? { type: "commit", text, consumedBuffer } : { type: "clear" }; }
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
  /** 组字区全文（画给人看、判「在不在组字」）= head + body + tail。v2.3.29 以前只取 body（user 2026-10-04「输入了不出字的拼音，会静默不显示拼音，
   *  但是得按退格才能消掉这些隐形的输入」）——实测 RIME 把拼不成音节的字母放在 tail（nihaov → body「ni hao」tail「v」），选了半截的字放在 head
   *  （niv 点「你」→ head「你」body「v」；再按 Esc → head「你」body 空，RIME 仍在组字），只看 body 就全成了看不见、却会被下一次上屏带出来的字。 */
  buffer = "";
  /** 只有 body：上屏时「幽灵拼音」比对用（pipeline commitText），保持 v2.3.29 以前的口径——head 是汉字，拿它去比对会误删正文里恰好相同的字。 */
  body = "";
  candidates: string[] = [];
  page = 0;
  hasMore = false;

  async initialize(schema: ImeSchema): Promise<void> {
    this.worker = new Worker(RIME_WORKER_URL);
    // 部署完成会刷新会话、开关可能被打回方案默认（Quest 首次部署是异步的）：worker 发 control/deployStatus → 作废「已重申」并在后台立刻重申（v2.3.31）
    this.worker.addEventListener("message", (e: MessageEvent) => { const m = e.data as { type?: string; name?: string; args?: unknown[] } | null; if (m?.type === "control" && m.name === "deployStatus") { this.optionsFresh = false; if (m.args?.[0] === "success") this.refreshOptionsSoon(); } });
    await this.setSchema(schema);
  }
  simplified = true;
  /** 会话开关：简/繁（user 2026-09-04「quest 输入法拼命出繁体」）、中文标点、关 emoji 候选（luna 方案默认开，写小说是噪音）。
   *  Quest 首次部署是异步的、deploy 完成会刷新会话——开关可能被打回方案默认（繁体）→ 除了换方案后设一次，**每次起组字前再重申一次**（一次 ccall，零成本），不赌会话状态。 */
  pageSize = 5;   // 悬浮条缺省 5（dock.ts FLOAT_PAGE_SIZE 同值；软键盘露着时 dock 改 40）
  async applyOptions(): Promise<void> {
    await this.call("setOption", "simplification", this.simplified ? 1 : 0);
    await this.call("setOption", "ascii_punct", 0);
    await this.call("setOption", "emoji_suggestion", 0);
    await this.call("setPageSize", this.pageSize);   // 同 simplification：deploy 刷新会话可能打回方案默认，每次重申
  }
  setPageSize(n: number): Promise<void> { if (this.pageSize === n) return Promise.resolve(); this.pageSize = n; return this.enqueue(() => this.applyOptions(), { compose: false }); }
  setSchema(schema: ImeSchema): Promise<void> {
    this.schema = schema;
    return this.enqueue(async () => { await this.call("setIME", schema); await this.applyOptions(); this.resetState(); }, { compose: false });
  }
  setSimplified(v: boolean): Promise<void> { this.simplified = v; return this.enqueue(() => this.applyOptions(), { compose: false }); }
  getState() { return { buffer: this.buffer, candidates: this.candidates, engine: this.engine, page: this.page, hasMore: this.hasMore }; }
  resetState() { this.buffer = ""; this.body = ""; this.candidates = []; this.page = 0; this.hasMore = false; }
  private pending = 0;
  /** **组字**任务在飞（首字回包前空格 / 退格 / 数字要排在它后面，不能按「缓冲为空」直通）。
   *  只数组字任务：换方案 / 初始化 / 预热排在同一条队里但不算——否则输入法还在加载时按 Enter 会被当成「组字中的确认」吞掉。 */
  get busy(): boolean { return this.pending > 0; }
  enqueue<T>(task: () => Promise<T>, opts: { compose?: boolean } = { compose: true }): Promise<T> {
    const compose = opts.compose !== false;
    if (compose) this.pending++;
    const p = this.queue.then(task, task); this.queue = p.catch(() => {});
    if (compose) p.then(() => { this.pending--; }, () => { this.pending--; });
    return p;
  }
  /** 预热（v2.1.24；user 2026-09-29「启动打第一个字的时候会卡」）：初始化完成后空闲时发一次假的组字再撤掉，
   *  让 librime 把词典 / 前缀树等首次查询才加载的东西先加载了——量过：首键 ≈ 6 倍于后续键。排在队里、不算组字，用户真打字排在它后面照常。 */
  warmUp(): Promise<void> {
    return this.enqueue(async () => { if (this.buffer) return; await this.call("process", "a"); await this.call("process", "{Escape}"); this.resetState(); }, { compose: false });
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
    if (typeof result.committed === "string") { const consumedBuffer = this.body; this.resetState(); this.refreshOptionsSoon(); return { type: "commit", text: result.committed, consumedBuffer }; }
    if (result.state === 1) {
      const head = String(result.head ?? ""), body = String(result.body ?? ""), tail = String(result.tail ?? "");
      this.body = body;
      this.buffer = head + body + (body && tail ? " " : "") + tail;   // tail 前空一格：和 RIME 自己的音节空格同一个样子，多出来的那几个字母看得出是另一段
      this.candidates = Array.isArray(result.candidates) ? result.candidates.map((c: { text?: string }) => c.text ?? "") : [];
      this.page = typeof result.page === "number" ? result.page : 0;
      this.hasMore = result.isLastPage === false;
      return { type: "composing" };
    }
    this.resetState(); this.refreshOptionsSoon(); return { type: "clear" };
  }
  // 起组字前重申会话开关（见 applyOptions）：v2.3.31 起改成「上一个词结束后在后台重申」（optionsFresh），下一个词的第一个字母不再排在 4 次往返后面
  //   （user 2026-10-04「键盘反应尽量灵敏…高实时要求」；CPU ×4 量到每个词首字母 41–52 ms，其余字母 10–20 ms）。没来得及重申（开机后第一个词等）才在前面补。
  optionsFresh = false;
  typeLetter(letter: string) { return this.enqueue(async () => { if (!this.buffer && !this.optionsFresh) await this.applyOptions(); this.optionsFresh = false; return this.normalize(await this.call("process", letter)); }); }
  /** 组字结束了（上屏 / 清空）：排一个不算组字的后台任务把开关重申掉，下一个词首字母直接 process。 */
  private refreshOptionsSoon(): void { if (this.optionsFresh) return; void this.enqueue(async () => { if (this.buffer) return; await this.applyOptions(); this.optionsFresh = true; }, { compose: false }).catch(() => {}); }
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
  // RIME 自己的 Return = 已选的字 + 剩下的输入原样上屏（实测：head「你」+ 输入 nivv → committed「你nivv」；双拼上屏的是打的键，不是转写出来的全拼）
  commitRaw() { return this.enqueue(async () => this.normalize(await this.call("process", "{Return}"))); }

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
  //   v2.1.31（user 2026-09-30「输入法没有把^变成省略号，然后可能其他的中文符号也有点乱」）：^ 和 _ 以前根本不在路由表里（原样落半角），
  //   < > [ ] { } $ 交给 RIME 又弹多选菜单（《〈«‹ / 「【〔［ …）——一律按 Windows 微软拼音的直出：……  ——  《》  【】  ｛｝  ￥。
  //   [ ] 组字中是候选翻页，不覆盖。
  private punctOverride(key: string, composing = false): string | null {
    if (key === "`") return "·";
    if (key === "~") return "～";   // 与 Windows 微软拼音一致（RIME 默认对 ~ 弹半角/全角候选菜单，多一步）
    if (key === "^") return "……";
    if (key === "_") return "——";
    if (key === "$") return "￥";
    if (key === "<") return "《";
    if (key === ">") return "》";
    if (key === "{") return "｛";
    if (key === "}") return "｝";
    if (!composing) { if (key === "[") return "【"; if (key === "]") return "】"; }
    if (this.quoteStyle !== "corner") return null;
    if (key === '"') { const ch = this.quoteOpen.d ? "「" : "」"; this.quoteOpen.d = !this.quoteOpen.d; return ch; }
    if (key === "'") { const ch = this.quoteOpen.s ? "『" : "』"; this.quoteOpen.s = !this.quoteOpen.s; return ch; }
    return null;
  }
  async setSimplified(v: boolean): Promise<void> { this.simplified = v; if (this.backend.setSimplified) { try { await this.backend.setSimplified(v); } catch (e) { console.warn("[ime] setSimplified failed", e); } } }
  /** 候选每页几个（v2.1.34，user 2026-09-30「如果是软键盘的话候选词就不用翻页了而是手指滑」）：后端换掉 / 重建也要记住，所以存在这里。 */
  pageSize = 5;   // 悬浮条缺省 5（dock.ts FLOAT_PAGE_SIZE 同值；软键盘露着时 dock 改 40）
  async setPageSize(n: number): Promise<void> { this.pageSize = n; if (this.backend.setPageSize) { try { await this.backend.setPageSize(n); } catch (e) { console.warn("[ime] setPageSize failed", e); } } }
  backend: Backend = new StarterMapBackend();
  /** 临时英文（v2.3.33，user 2026-10-04「和ios对齐，嗯和你建议一样」「空格收尾留空格，因为不想留的话可以用回车」）：中文态里一个大写字母（Shift + 字母 / 软键盘上档一次）
   *  起头，后面的字母、数字原样接着、不出汉字候选——「我用AI写」「Wi-Fi」不用切中英。空格 = 原样 + 一个空格；回车 = 原样；标点 = 原样 + 这个标点（中文标点照旧）；
   *  退格删一个、删空即退出；Esc / Ctrl+Z 撤掉；点条上那枚原样芯片 = 原样；切中 / 英 = 原样带出去。null = 不在临时英文里。纯 JS，不进 RIME。 */
  private temp: string | null = null;
  initializeError: string | null = null;
  initialized = false;

  private initPromise: Promise<void> | null = null;
  schema: ImeSchema = DEFAULT_SCHEMA;
  /** 起 RIME worker 并加载方案。**不挡启动**（v2.1.24，user「启动打第一个字的时候会卡」+ 家规「启动速度优先」）：boot 不 await 它，
   *  文档先开；RIME 后端一创建就接管，初始化是它队列里的第一项，加载期间用户打的字排在后面等它——不丢字、也不会被降级后端抢答。
   *  加载失败才换成 starter-map（此时排着的字也交给 starter-map 重打一遍不现实：清掉组字并报错，这是罕见路径）。 */
  async initialize(schema: ImeSchema = this.schema): Promise<void> {
    this.schema = schema;
    if (this.initialized) return;
    if (!this.initPromise) {   // 加载中连点不起第二个 worker（审计 UI-21）
      const rime = new RimeWorkerBackend();
      rime.simplified = this.simplified; rime.pageSize = this.pageSize;
      this.backend = rime;
      this.initPromise = (async () => {
        try { await rime.initialize(schema); this.initializeError = null; }
        catch (e) { this.backend = new StarterMapBackend(); this.initializeError = e instanceof Error ? e.message : "unknown RIME init error"; }
        this.initialized = true;
      })();
    }
    await this.initPromise;
  }
  /** 预热（空闲时调一次；见 RimeWorkerBackend.warmUp）。未初始化 / 降级后端 → 无事。 */
  warmUp(): Promise<void> {
    const b = this.backend as { warmUp?: () => Promise<void> };
    return b.warmUp ? b.warmUp().catch((e) => { console.warn("[ime] warm-up failed", e); }) : Promise.resolve();
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
    if (this.temp != null) return { enabled: this.enabled, asciiMode: this.asciiMode, buffer: this.temp, candidates: [], engine: s.engine, initializeError: this.initializeError, page: 0, hasMore: false };   // 条上只有原样那一枚
    return { enabled: this.enabled, asciiMode: this.asciiMode, buffer: s.buffer, candidates: s.candidates, engine: s.engine, initializeError: this.initializeError, page: s.page ?? 0, hasMore: !!s.hasMore };
  }
  /** 临时英文收尾：原样 + suffix 上屏。 */
  private takeTemp(suffix: string): ImeResult { const text = (this.temp ?? "") + suffix; this.temp = null; return text ? { type: "commit", text, consumedBuffer: "" } : { type: "clear" }; }
  /** 把 RIME 里正在组的字收掉：先上首选；首选上不完（拼不成字的尾巴）剩下的原样带出——别留看不见的组字。没在组字 = null。 */
  private async flushBackend(): Promise<{ text: string; consumedBuffer: string } | null> {
    if (!(this.backend.getState().buffer || this.backend.busy)) return null;
    let r = await this.backend.commitDefault(false);
    let text = r.type === "commit" ? r.text : "", consumed = r.type === "commit" ? r.consumedBuffer : "";
    if (this.backend.getState().buffer) { r = await this.backend.commitRaw(); if (r.type === "commit") { text += r.text; consumed = consumed || r.consumedBuffer; } }
    return text ? { text, consumedBuffer: consumed } : null;
  }
  // ── 不经按键的动词（软键盘 / 候选条点选；src/input/pipeline.ts 用）──
  /** 首选上屏（同空格；临时英文 = 原样、不带空格）；没在组字 → passthrough。 */
  async commitFirst(): Promise<ImeResult> { if (this.temp != null) return this.takeTemp(""); if (!this.isComposing()) return { type: "passthrough" }; return await this.backend.commitDefault(false); }
  /** 点第 index 个候选（当前页内，0 起）。临时英文条上只有原样那一枚。 */
  async choose(index: number): Promise<ImeResult> { if (this.temp != null) return this.takeTemp(""); if (!this.isComposing()) return { type: "passthrough" }; return await this.backend.chooseCandidate(index); }
  /** 候选翻页。 */
  async turnPage(prev: boolean): Promise<ImeResult> { if (this.temp != null) return { type: "composing" }; if (!this.isComposing()) return { type: "passthrough" }; return await this.backend.changePage(prev); }
  isComposing(): boolean { return this.enabled && !this.asciiMode && (this.temp != null || this.backend.getState().buffer.length > 0 || !!this.backend.busy); }
  resetComposition(): void { this.temp = null; this.backend.resetState(); void this.backend.clear().catch(() => {}); }   // JS 态与 worker 缓冲一起清（只清 JS 会让下一击接在 worker 残留拼音后面——2026-09-04 探针抓到 zhe→「zhezhe」）
  async dumpUserDir(): Promise<UserDictDump | null> { if (!this.backend.dumpUserDir) return null; try { return await this.backend.dumpUserDir(); } catch (e) { console.warn("[ime] dumpUserDir failed", e); return null; } }
  async restoreUserDir(dump: UserDictDump): Promise<void> { if (!this.backend.restoreUserDir) return; try { await this.backend.restoreUserDir(dump); } catch (e) { console.warn("[ime] restoreUserDir failed", e); } }

  /** Shift 单击：中 ↔ EN。切到 EN 时把未完成的拼音原样提交。 */
  async toggleAsciiMode(): Promise<ImeResult> {
    const toAscii = !this.asciiMode;
    const pending = this.temp ?? this.backend.getState().buffer.replace(/ /g, "");   // 原样上屏不带 RIME 插的音节空格（同 Windows 微软拼音：Shift 上屏 nihao，不是 ni hao）；临时英文原样
    this.temp = null;
    await this.backend.clear();
    this.asciiMode = toAscii;
    if (toAscii && pending) return { type: "commit", text: pending, consumedBuffer: pending };
    return { type: "clear" };
  }

  /** 临时英文里的键（见 temp）。 */
  private async onTempKey(event: KeyboardEvent): Promise<ImeResult> {
    const k = event.key, mods = event.ctrlKey || event.altKey || event.metaKey;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (k === "z" || k === "Z")) { event.preventDefault(); this.temp = null; return { type: "clear" }; }
    if (mods) return { type: "passthrough" };
    if (/^[a-zA-Z0-9]$/.test(k)) { event.preventDefault(); this.temp += k; return { type: "composing" }; }
    if (k === "Backspace") { event.preventDefault(); this.temp = this.temp!.slice(0, -1); if (!this.temp) { this.temp = null; return { type: "clear" }; } return { type: "composing" }; }
    if (k === "Escape") { event.preventDefault(); this.temp = null; return { type: "clear" }; }
    if (k === " ") { event.preventDefault(); return this.takeTemp(" "); }
    if (k === "Enter") { event.preventDefault(); return this.takeTemp(""); }
    const p = this.punctOverride(k, false);
    if (p != null) { event.preventDefault(); return this.takeTemp(p); }
    if (isRoutedPunct(event)) {   // 中文标点照旧（RIME 出全角）：先把原样那段收掉，再落标点
      event.preventDefault();
      const run = this.takeTemp("");
      const r = await this.backend.typePunctuation(k);
      const text = (run.type === "commit" ? run.text : "") + (r.type === "commit" ? r.text : "");
      return text ? { type: "commit", text, consumedBuffer: "" } : r;
    }
    return { type: "passthrough" };
  }

  async onKeydown(event: KeyboardEvent): Promise<ImeResult> {
    if (!this.enabled || this.asciiMode) return { type: "passthrough" };
    // v2.3.33 大写（user 2026-10-04「和ios对齐」）：以前实体键盘的 Shift + 字母 / Caps Lock 都被折成小写塞进拼音（大写丢了），和软键盘不一致。
    //   Caps Lock 锁着 = 字母直出、不进输入法（正在组的先收掉：首选 / 临时英文原样）；大写字母 = 起临时英文（见 temp）。
    if (isAsciiLetter(event) && event.getModifierState?.("CapsLock")) {
      if (!this.isComposing()) return { type: "passthrough" };
      event.preventDefault();
      const head = this.temp != null ? this.takeTemp("") : null;
      const f = head && head.type === "commit" ? { text: head.text, consumedBuffer: "" } : await this.flushBackend();
      return { type: "commit", text: (f?.text ?? "") + event.key, consumedBuffer: f?.consumedBuffer ?? "" };
    }
    if (this.temp != null) return await this.onTempKey(event);
    if (isAsciiLetter(event) && event.key !== event.key.toLowerCase()) {
      event.preventDefault();
      this.temp = event.key;   // 同步立起来：手快的话下一个字母在 RIME 收尾之前就到了，它得进临时英文而不是拼音
      const f = await this.flushBackend();   // 正在组的拼音先上首选
      return f ? { type: "commit", text: f.text, consumedBuffer: f.consumedBuffer } : { type: "composing" };
    }
    if (isAsciiLetter(event)) { event.preventDefault(); return await this.backend.typeLetter(event.key.toLowerCase()); }
    if (!(event.ctrlKey || event.altKey || event.metaKey)) {   // JS 层标点覆盖（RIME 方案层改不了，见 punctOverride）
      const p = this.punctOverride(event.key, this.isComposing());
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
    // 回车 = 原样上屏、不换行（v2.3.33，user「和ios对齐」：iOS 回车键此时是「确认」，微软拼音 / 搜狗 / macOS 同；再按一次才换行）。
    //   以前是「上首选 + 换行」，而且走空格那条路——拼不成字的尾巴在时既不换行也没上完。中文态里打一个英文词：打完回车即可，不用切中英。
    if (event.key === "Enter") { event.preventDefault(); return await this.backend.commitRaw(); }
    if (event.key === "PageDown" || event.key === "]" || event.key === "=") { event.preventDefault(); return await this.backend.changePage(false); }
    if (event.key === "PageUp" || event.key === "[" || event.key === "-") { event.preventDefault(); return await this.backend.changePage(true); }
    return { type: "passthrough" };
  }
}
