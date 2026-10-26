// 逐段的说话人识别：一行字 → 说话人（或没有）。纯函数，test/adv-speaker.test.mjs 钉着。created 20261026 by Claude Opus 5.5
//   user 2026-10-26「帮我想一下要不要自动识别说话人然后弹到（你知道galgame里面人名放哪里），也是文字照样打。自动识别」
//   「嗯那么就有一个可展开的选项里面是可以勾选不同的说话人识别规则。然后还有一个整体的开关。默认关。然后还有就是如果是“hello"speaker"second"这种也不算」
//   「然后中文最标准的 我说：“你好”  也记一下」「不过冒号引号也几乎是冒号的规则」
//   「再剥掉末尾的“说/道/问/笑道”等字 用不到，不要谜语人。我们不需要非剧本稿能强行type cast」→ 只认剧本类写法，冒号前面那几个字原样就是名字，不做别的加工。
//   （「我说：“你好”」是中文小说最标准的写法，记在这里；它不是剧本稿，不硬套：user「你好的引号也会有」→ 冒号后面紧跟引号 = 小说，冒号规则不认。）
// 只认行首的现成写法（剧本 / 汉化稿 / 日式 ADV / 英文剧本），不发明格式；正文一个字都不改，识别结果只给名字牌看。
// 小说里引号中间夹说话人的写法（“你好，”我说，“……” / "Hello," said Tsuki, "...") 不算：它不在行首，名字牌不该猜。
// 名字的限制挡掉大部分误认：中日文 1–8 个字、中间没有空白和标点；英文 1–24 个字符、大写开头。

export type SpeakerRule = "colon" | "bracket" | "jaQuote" | "enColon";
/** 设置里的顺序。 */
export const SPEAKER_RULES: readonly SpeakerRule[] = ["colon", "bracket", "jaQuote", "enColon"];

const CJK_NAME = "[^\\s，。！？、；：:“”‘’「」『』【】（）()\"'…—,.!?;]{1,8}";
// 每条规则匹配的是整个「标记」（名字 + 它的分隔符号 + 后面的空白）：名字在第 1 组，标记长度 = 整个匹配。标记收进名字牌、不进框（v3.0.6，user「小月：  不进文本框啊」）。
const RULES: Record<SpeakerRule, RegExp> = {
  /** 小月：明天再去拿吧。（剧本；全角 / 半角冒号）。冒号后面紧跟引号 = 小说写法「我说：“你好”」（user「你好的引号也会有」），不认。只打了「小月：」也认（打完冒号就收进名字牌） */
  colon: new RegExp(`^(${CJK_NAME})[：:](?!\\s*[“「『"])\\s*`),
  /** 【小月】明天再去拿吧。/【小月】「……」（汉化稿 / 文字游戏） */
  bracket: /^【([^【】\s]{1,12})】\s*/,
  /** 小月「明日取りに行こう」/ 小月『……』（日式 ADV：名字后面直接接引号；引号留在框里） */
  jaQuote: new RegExp(`^(${CJK_NAME})(?=[「『])`),
  /** TSUKI: Let's go. / Tsuki: Let's go.（英文剧本 / 广播剧；冒号后面是空白或行尾） */
  enColon: /^([A-Z][A-Za-z.'\-]*(?: [A-Z][A-Za-z.'\-]*){0,2}):(?!\S)\s*/,
};

export interface SpeakerTag { name: string; /** 行首这几个字是标记（含首行缩进）：收进名字牌、不进框。 */ length: number }

/** 这一行行首的说话人标记；没有 / 规则都没勾 = null。 */
export function speakerTag(line: string, enabled: ReadonlySet<SpeakerRule>): SpeakerTag | null {
  const indent = /^[\s\u3000]*/.exec(line)![0].length;   // 首行缩进（含全角空格）不算名字，但算在标记里
  const s = line.slice(indent);
  if (!s) return null;
  for (const r of SPEAKER_RULES) {
    if (!enabled.has(r)) continue;
    const m = RULES[r].exec(s);
    if (!m || !m[1]) continue;
    if (r === "colon" && /^[\x00-\x7f]+$/.test(m[1])) continue;   // 纯 ASCII 的「名字」归英文那条（冒号后面得有空白）：挡行首的时间「12:30」、网址「http://」被认成说话人、收进名字牌
    return { name: m[1], length: indent + m[0].length };
  }
  return null;
}
/** 这一行的说话人；没有 = null。 */
export const detectSpeaker = (line: string, enabled: ReadonlySet<SpeakerRule>): string | null => speakerTag(line, enabled)?.name ?? null;
