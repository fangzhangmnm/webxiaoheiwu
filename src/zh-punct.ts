// 中文语境下把西文标点换成全角（Web Speech / Whisper 在中文听写里偶尔吐 ASCII 逗号句号）。
// created 2026-09-03 by Claude Fable 5.1（自 v1 src/zh-punct.js 逐规则移植）。
//   · 无 CJK → 原样（纯英文零风险）。
//   · , . ? ! : ; 只在紧邻 CJK（或已产生的全角标点）时替换（3.14 不动；"Hello, 你好" 英文逗号不动）。
//   · ( ) [ ]：配对行走，任一侧邻 CJK → 开闭一起换（绝不出现 试（1)）。
//   · " '：全文交替开闭。
//   · 省略号 / 破折号（2026-10-16，一键规整标点加的，user「一键把标点符号或者选中的标点符号全部正则化」）：紧邻 CJK 的 ... / 。。。 / … 一律收成「……」，-- 收成「——」。

const SINGLE_MAP: Record<string, string> = { ",": "，", ".": "。", "?": "？", "!": "！", ":": "：", ";": "；" };
const CJK_RE = /[一-鿿]/;
const isCjk = (ch: string | undefined): boolean => !!ch && CJK_RE.test(ch);

/** 引号样式（与内置 IME 同一设置；app 层 setQuoteStyle 同步）。 */
let _corner = false;
export function setQuoteStyle(style: "curly" | "corner"): void { _corner = style === "corner"; }
/** 系统输入法上屏的引号跟设置走（v2.3.57，user 2026-10-23「做，跟设置走」；接线 = input/pipeline.ts）：只换已经分好开闭的弯引号 / 直角引号（“”‘’ ↔ 「」『』）。
 *  ‘ ’ 前一个字是拉丁字母 = 英文撇号（it’s / rock ‘n’ roll）→ 不动（打字当下后一个字还没来，看不到，宁可漏换——漏的「规整标点」一键收）；直引号 " ' 不动（英文 / 代码）。
 *  prev = 插入点前一个字（文本框里的）。 */
export function quotesToStyle(text: string, prev = ""): string {
  const [dO, dC, sO, sC] = _corner ? ["「", "」", "『", "』"] : ["“", "”", "‘", "’"];
  let out = "", p = prev;
  for (const ch of text) {
    let c = ch;
    if (ch === "“" || ch === "「") c = dO;
    else if (ch === "”" || ch === "」") c = dC;
    else if (ch === "‘" || ch === "『") c = ch === "‘" && /[A-Za-z]/.test(p) ? ch : sO;
    else if (ch === "’" || ch === "』") c = ch === "’" && /[A-Za-z]/.test(p) ? ch : sC;
    out += c; p = ch;
  }
  return out;
}
/** 一键规整（user 2026-10-16「一键把标点符号…全部正则化」「标点主要是引号的规范」）：同一套规则，顺带报改了几处。 */
export function tidyPunctuation(text: string): { text: string; changes: number } {
  if (!text || !CJK_RE.test(text)) return { text, changes: 0 };
  let changes = 0;
  const tick = (from: string, to: string): string => { if (from !== to) changes++; return to; };
  let out = text;
  // ── 引号规范：全文统一成设置里的那一种（curly “”‘’ / corner 「」『』）；西文 " ' 交替开闭；英文撇号（don't / it’s）不动 ──
  const [dO, dC, sO, sC] = _corner ? ["「", "」", "『", "』"] : ["“", "”", "‘", "’"];
  out = out.replace(/[“「]/g, (m) => tick(m, dO)).replace(/[”」]/g, (m) => tick(m, dC));
  out = out.replace(/(?<![A-Za-z])[‘『]|[‘『](?![A-Za-z])/g, (m) => tick(m, sO)).replace(/(?<![A-Za-z])[’』]|[’』](?![A-Za-z])/g, (m) => tick(m, sC));
  let openDouble = true;
  out = out.replace(/"/g, () => { const ch = openDouble ? dO : dC; openDouble = !openDouble; changes++; return ch; });
  let openSingle = true;
  out = out.replace(/(?<![A-Za-z])'|'(?![A-Za-z])/g, () => { const ch = openSingle ? sO : sC; openSingle = !openSingle; changes++; return ch; });
  // 省略号 / 破折号先于单字规则（否则 ... 会先被逐个换成 。。。）；只认紧邻 CJK（或已是中文标点）的那一串
  out = out.replace(/(?<=[一-鿿，。？！：；（）【】“”‘’「」『』])(?:\.{3,}|。{3,}|…+)|(?:\.{3,}|。{3,}|…+)(?=[一-鿿])/g, (m) => tick(m, "……"));
  out = out.replace(/(?<=[一-鿿，。？！：；（）【】“”‘’「」『』……])-{2,}|-{2,}(?=[一-鿿])/g, (m) => tick(m, "——"));
  out = out.replace(/([一-鿿，。？！：；（）【】“”「」])([,.?!:;])/g, (_, prev: string, p: string) => { changes++; return prev + SINGLE_MAP[p]; });
  out = out.replace(/([,.?!:;])([一-鿿])/g, (_, p: string, next: string) => { changes++; return SINGLE_MAP[p] + next; });
  const b1 = convertPairs(out, "(", ")", "（", "）"); changes += countDiff(out, b1); out = b1;
  const b2 = convertPairs(out, "[", "]", "【", "】"); changes += countDiff(out, b2); out = b2;
  return { text: out, changes };
}
/** 等长替换后有几个字符变了（convertPairs 只换字符不改长度）。 */
function countDiff(a: string, b: string): number { let n = 0; const A = [...a], B = [...b]; for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) n++; return n; }
/** 语音听写用（SenseVoice 在中文里偶尔吐 ASCII 标点）：和一键规整同一套规则。 */
export function chineseifyPunctuation(text: string): string { return tidyPunctuation(text).text; }


function convertPairs(text: string, openCh: string, closeCh: string, fwOpen: string, fwClose: string): string {
  const chars = [...text];
  const stack: { pos: number; openHasCjk: boolean }[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === openCh) {
      stack.push({ pos: i, openHasCjk: isCjk(chars[i - 1]) || isCjk(chars[i + 1]) });
    } else if (chars[i] === closeCh) {
      const open = stack.pop();
      if (!open) continue;
      const closeCjk = isCjk(chars[i - 1]) || isCjk(chars[i + 1]);
      if (open.openHasCjk || closeCjk) { chars[open.pos] = fwOpen; chars[i] = fwClose; }
    }
  }
  return chars.join("");
}
