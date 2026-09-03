// 中文语境下把西文标点换成全角（Web Speech / Whisper 在中文听写里偶尔吐 ASCII 逗号句号）。
// created 2026-09-03 by Claude Fable 5.1（自 v1 src/zh-punct.js 逐规则移植）。
//   · 无 CJK → 原样（纯英文零风险）。
//   · , . ? ! : ; 只在紧邻 CJK（或已产生的全角标点）时替换（3.14 不动；"Hello, 你好" 英文逗号不动）。
//   · ( ) [ ]：配对行走，任一侧邻 CJK → 开闭一起换（绝不出现 试（1)）。
//   · " '：全文交替开闭。

const SINGLE_MAP: Record<string, string> = { ",": "，", ".": "。", "?": "？", "!": "！", ":": "：", ";": "；" };
const CJK_RE = /[一-鿿]/;
const isCjk = (ch: string | undefined): boolean => !!ch && CJK_RE.test(ch);

export function chineseifyPunctuation(text: string): string {
  if (!text || !CJK_RE.test(text)) return text;
  let out = text;
  out = out.replace(/([一-鿿，。？！：；（）【】])([,.?!:;])/g, (_, prev: string, p: string) => prev + SINGLE_MAP[p]);
  out = out.replace(/([,.?!:;])([一-鿿])/g, (_, p: string, next: string) => SINGLE_MAP[p] + next);
  out = convertPairs(out, "(", ")", "（", "）");
  out = convertPairs(out, "[", "]", "【", "】");
  let openDouble = true;
  out = out.replace(/"/g, () => { const ch = openDouble ? "“" : "”"; openDouble = !openDouble; return ch; });
  let openSingle = true;
  out = out.replace(/'/g, () => { const ch = openSingle ? "‘" : "’"; openSingle = !openSingle; return ch; });
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
