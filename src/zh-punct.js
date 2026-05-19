// Best-effort post-processor that swaps Western punctuation for the Chinese
// fullwidth equivalents when the surrounding context is clearly Chinese.
// Both Web Speech and Whisper occasionally emit ASCII commas/periods in the
// middle of Chinese dictation; we catch those without disturbing genuine
// English fragments, numeric decimals, or URLs.
//
// Rules:
//  - If the text contains no CJK at all, leave it untouched.
//  - For , . ? ! : ; : replace when adjacent to a CJK char (or to a fullwidth
//    Chinese punctuation we already produced).
//  - For ( ) [ ]: paired walk. If either side of the open OR close sits next
//    to a CJK char, convert BOTH together. Avoids the "试（1)" mismatch.
//  - For " and ': stateful alternation across the entire text — every other
//    occurrence flips between open/close. Simplest behavior that's right for
//    balanced runs and acceptable for unbalanced ones.

const SINGLE_MAP = {
  ",": "，",
  ".": "。",
  "?": "？",
  "!": "！",
  ":": "：",
  ";": "；",
};

const CJK_RE = /[一-鿿]/;

function isCjk(ch) {
  return !!ch && CJK_RE.test(ch);
}

export function chineseifyPunctuation(text) {
  if (!text || !CJK_RE.test(text)) return text;

  let out = text;

  // Pass 1: , . ? ! : ; — directly after a CJK or already-Chinese-punct char.
  out = out.replace(
    /([一-鿿，。？！：；（）【】])([,.?!:;])/g,
    (_, prev, p) => prev + SINGLE_MAP[p],
  );

  // Pass 2: , . ? ! : ; — directly before a CJK char. Catches commas that
  // open a clause (",然后呢") or punct at the very start of an utterance.
  out = out.replace(
    /([,.?!:;])([一-鿿])/g,
    (_, p, next) => SINGLE_MAP[p] + next,
  );

  // Brackets: paired walk so opener and closer flip together.
  out = convertPairs(out, "(", ")", "（", "）");
  out = convertPairs(out, "[", "]", "【", "】");

  // Quotes: walk the string, alternate left/right. CJK_RE check at the top
  // already established this text is Chinese context — mixed quotes around
  // an English word (他说 "Hello") read fine with curly Chinese quotes.
  let openDouble = true;
  out = out.replace(/"/g, () => {
    const ch = openDouble ? "“" : "”"; // “ ”
    openDouble = !openDouble;
    return ch;
  });
  let openSingle = true;
  out = out.replace(/'/g, () => {
    const ch = openSingle ? "‘" : "’"; // ‘ ’
    openSingle = !openSingle;
    return ch;
  });

  return out;
}

function convertPairs(text, openCh, closeCh, fwOpen, fwClose) {
  const chars = [...text];
  const stack = [];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === openCh) {
      const cjkAdj = isCjk(chars[i - 1]) || isCjk(chars[i + 1]);
      stack.push({ pos: i, openHasCjk: cjkAdj });
    } else if (chars[i] === closeCh) {
      const open = stack.pop();
      if (!open) continue; // stray closer — leave untouched.
      const closeCjk = isCjk(chars[i - 1]) || isCjk(chars[i + 1]);
      if (open.openHasCjk || closeCjk) {
        chars[open.pos] = fwOpen;
        chars[i] = fwClose;
      }
    }
  }
  return chars.join("");
}
