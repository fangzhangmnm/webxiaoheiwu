// 逐段的说话人识别（src/adv/speaker.ts）。created 2026-10-26 by Claude Opus 5.5
import { describe, it, eq } from "./runner.mjs";
import { detectSpeaker, SPEAKER_RULES } from "../src/adv/speaker.ts";

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
