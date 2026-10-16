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
/** 一键规整用：这段文字里会被 chineseifyPunctuation 换掉的西文标点有几个（给 toast 报数；0 = 没有要改的）。 */
export function countWesternPunctuation(before: string, after: string): number {
  const n = (s: string): number => (s.match(/[,.?!:;()\[\]"'\-]/g) ?? []).length;
  return Math.max(before === after ? 0 : 1, n(before) - n(after));   // 只换了 … 的个数这种（西文字符数不变）也至少报 1
}
export function chineseifyPunctuation(text: string): string {
  if (!text || !CJK_RE.test(text)) return text;
  let out = text;
  // 省略号 / 破折号先于单字规则（否则 ... 会先被逐个换成 。。。）；只认紧邻 CJK（或已是中文标点）的那一串
  out = out.replace(/(?<=[一-鿿，。？！：；（）【】“”‘’「」『』])(?:\.{3,}|。{3,}|…+)|(?:\.{3,}|。{3,}|…+)(?=[一-鿿])/g, "……");
  out = out.replace(/(?<=[一-鿿，。？！：；（）【】“”‘’「」『』……])-{2,}|-{2,}(?=[一-鿿])/g, "——");
  out = out.replace(/([一-鿿，。？！：；（）【】])([,.?!:;])/g, (_, prev: string, p: string) => prev + SINGLE_MAP[p]);
  out = out.replace(/([,.?!:;])([一-鿿])/g, (_, p: string, next: string) => SINGLE_MAP[p] + next);
  out = convertPairs(out, "(", ")", "（", "）");
  out = convertPairs(out, "[", "]", "【", "】");
  let openDouble = true;
  out = out.replace(/"/g, () => { const ch = openDouble ? (_corner ? "「" : "“") : (_corner ? "」" : "”"); openDouble = !openDouble; return ch; });
  let openSingle = true;
  out = out.replace(/'/g, () => { const ch = openSingle ? (_corner ? "『" : "‘") : (_corner ? "』" : "’"); openSingle = !openSingle; return ch; });
  return out;
}

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
