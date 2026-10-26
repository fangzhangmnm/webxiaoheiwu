// 逐段的说话人识别（src/adv/speaker.ts）。created 2026-10-26 by Claude Opus 5.5
import { describe, it, eq } from "./runner.mjs";
import { detectSpeaker, speakerTag, SPEAKER_RULES } from "../src/adv/speaker.ts";

const all = new Set(SPEAKER_RULES);
const only = (...r) => new Set(r);

describe("adv/speaker · 四条规则", () => {
  it("冒号：剧本「小月：……」；全角 / 半角；首行缩进不算", () => {
    eq(detectSpeaker("小月：明天再去拿吧。", all), "小月");
    eq(detectSpeaker("小月:明天再去拿吧。", all), "小月");
    eq(detectSpeaker("　　小月：明天再去拿吧。", all), "小月");
  });
  it("冒号前面那几个字原样就是名字，不做别的加工（user「不要谜语人。我们不需要非剧本稿能强行type cast」）", () => {
    eq(detectSpeaker("老师：上课了", all), "老师");
  });
  it("冒号后面紧跟引号 = 小说写法「我说：“你好”」，不认（user「你好的引号也会有」）", () => {
    eq(detectSpeaker("我说：“你好”", all), null);
    eq(detectSpeaker("小月：「明天再说。」", all), null);
    eq(detectSpeaker("他问：\"去哪？\"", all), null);
  });
  it("【名字】：汉化稿 / 文字游戏", () => {
    eq(detectSpeaker("【小月】明天再去拿吧。", all), "小月");
    eq(detectSpeaker("【小月】「明天再说。」", all), "小月");
  });
  it("日式 ADV：名字后面直接接「」", () => {
    eq(detectSpeaker("小月「明日取りに行こう」", all), "小月");
    eq(detectSpeaker("太郎『……』", all), "太郎");
  });
  it("英文剧本：NAME: line", () => {
    eq(detectSpeaker("TSUKI: Let's go.", all), "TSUKI");
    eq(detectSpeaker("Old Man: Hm.", all), "Old Man");
  });
});

describe("adv/speaker · 不算的", () => {
  it("小说里引号中间夹说话人（user：“hello\"speaker\"second\" 这种也不算）", () => {
    eq(detectSpeaker("\"Hello,\" said Tsuki, \"second.\"", all), null);
    eq(detectSpeaker("\"hello\" speaker \"second\"", all), null);
    eq(detectSpeaker("“你好，”我说，“明天见。”", all), null);
  });
  it("纯叙述、太长的「名字」、名字里有空白或标点", () => {
    eq(detectSpeaker("雨停了以后，她才发现伞忘在了车上。", all), null);
    eq(detectSpeaker("这是一个超过八个字的很长很长的前缀：后面", all), null);
    eq(detectSpeaker("小 月：中间有空格", all), null);
    eq(detectSpeaker("", all), null);
  });
  it("规则没勾 = 不认；全关 = 一律 null", () => {
    eq(detectSpeaker("小月：明天", only("bracket")), null);
    eq(detectSpeaker("【小月】明天", only("bracket")), "小月");
    eq(detectSpeaker("小月：明天", new Set()), null);
  });
});

describe("adv/speaker · 标记有几个字（收进名字牌、不进框；v3.0.6，user「小月：  不进文本框啊」）", () => {
  const len = (l) => speakerTag(l, all)?.length ?? 0;
  it("名字 + 分隔符号 + 后面的空白；首行缩进也算在标记里", () => {
    eq(len("小月：明天"), 3);
    eq(len("小月：　 明天"), 5);
    eq(len("　　小月：明天"), 5);
    eq(len("【小月】  嗯"), 6);
    eq(len("TSUKI: Hi"), 7);
  });
  it("日式：只有名字是标记，「」留在框里", () => { eq(len("小月「明日」"), 2); });
  it("只打了「小月：」就认（打完冒号就收进名字牌）；「TSUKI:」行尾也认", () => {
    eq(len("小月："), 3); eq(detectSpeaker("小月：", all), "小月");
    eq(len("TSUKI:"), 6);
  });
  it("冒号后面隔着空白再接引号也是小说写法，不认", () => { eq(len("我说：  “你好”"), 0); });
  it("没有标记 = 0；行首的时间 / 网址不是说话人", () => { eq(len("雨停了。"), 0); eq(len("TSUKI:x"), 0); eq(len("12:30 到了"), 0); eq(len("http://example.com"), 0); });
});
