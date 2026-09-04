// 双拼零声母全拼重写（user 2026-09-04「我用的 windows 和 ios 都是 aimili」「别的双拼也对齐呗」）。created 2026-09-04 by Claude Fable 5.1
//   RIME 的双拼方案里零声母音节（a ai an ang ao e ei en eng er o ou）只认各方案自己的双拼键（微软/ABC/加加 = o 引导或 aa 双写；
//   自然码/小鹤原生只收 ai an ao ei en ou，不收 a e o ang eng）；Windows 微软拼音与 iOS 双拼都接受直接打全拼。
//   方案层改不了：wasm 里的 librime 要重编 prism 得有 luna_pinyin.dict.yaml 源，包里没有（2026-09-04 探针实测 deploy 报 source 不存在）。
//   → 送 RIME 前重写：a/e/o 起头的音节按全拼收，换成该方案的双拼键；原生双拼键（al / ol / aa …）照旧认——
//   双拼老手的肌肉记忆优先于全拼（拼音加加 er = en 与全拼 er 撞键时按方案语义，全拼 er 请打 eq）。
//   纯状态机、零 DOM：镜像 RIME 缓冲里「当前零声母音节」已送出的键，重写 = 退格若干 + 重送。键表 2026-09-04 逐条探针验证（5 方案 × 12 音节）。

export const ZERO_FULL_FORMS = ["a", "ai", "an", "ang", "ao", "e", "ei", "en", "eng", "er", "o", "ou"] as const;
export type ZeroFullForm = (typeof ZERO_FULL_FORMS)[number];
/** full = 全拼 → 该方案双拼键；alt = 方案还认的其它零声母双拼键（微软/加加的 o 引导形）。 */
export interface ZeroTable { full: Record<ZeroFullForm, string>; alt?: string[] }

const MSPY_FULL: Record<ZeroFullForm, string> = { a: "aa", ai: "al", an: "aj", ang: "ah", ao: "ak", e: "ee", ei: "ez", en: "ef", eng: "eg", er: "er", o: "oo", ou: "ob" };
export const ZERO_TABLES: Record<string, ZeroTable> = {
  double_pinyin_mspy: { full: MSPY_FULL, alt: ["oa", "ol", "oj", "oh", "ok", "oe", "oz", "of", "og", "or"] },
  double_pinyin: { full: MSPY_FULL },
  double_pinyin_flypy: { full: { a: "aa", ai: "ad", an: "aj", ang: "ah", ao: "ac", e: "ee", ei: "ew", en: "ef", eng: "eg", er: "er", o: "oo", ou: "oz" } },
  double_pinyin_abc: { full: { a: "oa", ai: "ol", an: "oj", ang: "oh", ao: "ok", e: "oe", ei: "oq", en: "of", eng: "og", er: "or", o: "oo", ou: "ob" } },
  double_pinyin_pyjj: { full: { a: "aa", ai: "as", an: "af", ang: "ag", ao: "ad", e: "ee", ei: "ew", en: "er", eng: "et", er: "eq", o: "oo", ou: "op" }, alt: ["oa", "os", "of", "og", "od", "oe", "ow", "or", "ot", "oq"] },
};

export type ZeroOp = { op: "key"; key: string } | { op: "bs" };

const isFullPrefix = (s: string): s is ZeroFullForm => ZERO_FULL_FORMS.some((f) => f.startsWith(s));   // 全拼表的每个前缀本身也是完整音节（a/an/e/en/o）
const isExtendable = (s: string) => ZERO_FULL_FORMS.some((f) => f.length > s.length && f.startsWith(s));

export class ZeroInitialRewriter {
  private typed = "";    // 当前零声母音节已收的全拼（"" = 没有挂起）
  private sent = "";     // RIME 里这个音节现在是什么键
  private odd = false;   // 非零声母音节：已送 1 键（正在音节中间）
  private readonly doubles: Set<string>;
  private readonly table: ZeroTable | null;
  constructor(table: ZeroTable | null) {   // 不用参数属性：node 直跑 TS（strip-only）不认
    this.table = table;
    this.doubles = new Set(table ? [...Object.values(table.full), ...(table.alt ?? [])] : []);
  }
  get active(): boolean { return !!this.table; }
  reset(): void { this.typed = ""; this.sent = ""; this.odd = false; }
  /** 候选选走一段后剩余缓冲：末段单字符 = 停在音节中间（微软方案完整零声母也显示单字，此时判错只是少一次重写，无害）。 */
  syncFromPreedit(buffer: string): void {
    this.typed = ""; this.sent = "";
    const segs = buffer.trim().split(/[\s']+/).filter(Boolean);
    this.odd = segs.length > 0 && segs[segs.length - 1]!.length === 1;
  }
  onKey(key: string): ZeroOp[] {
    if (!this.table) return [{ op: "key", key }];
    if (this.typed) {
      const next = this.typed + key;
      if (this.typed.length === 1 && this.doubles.has(next)) {   // 原生双拼键（al / ol / aa / er…）：方案语义优先
        const ops = this.rewrite(next); this.typed = ""; this.sent = ""; return ops;
      }
      if (isFullPrefix(next)) {
        const ops = this.rewrite(this.table.full[next]);
        if (isExtendable(next)) this.typed = next; else { this.typed = ""; this.sent = ""; }
        return ops;
      }
      this.typed = ""; this.sent = "";   // 不延续：挂起音节按现状收口（RIME 里已是它的双拼键），这个键另起音节
    }
    if (!this.odd && (key === "a" || key === "e" || key === "o")) { this.typed = key; return this.rewrite(this.table.full[key]); }
    this.odd = !this.odd;
    return [{ op: "key", key }];
  }
  onBackspace(): ZeroOp[] {
    if (!this.table) return [{ op: "bs" }];
    if (this.typed) {
      this.typed = this.typed.slice(0, -1);
      return this.rewrite(this.typed ? this.table.full[this.typed as ZeroFullForm] : "");
    }
    this.odd = !this.odd;
    return [{ op: "bs" }];
  }
  private rewrite(to: string): ZeroOp[] {
    const ops: ZeroOp[] = [];
    for (let i = 0; i < this.sent.length; i++) ops.push({ op: "bs" });
    for (const k of to) ops.push({ op: "key", key: k });
    this.sent = to;
    return ops;
  }
}
