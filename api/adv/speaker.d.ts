export type SpeakerRule = "colon" | "bracket" | "jaQuote" | "enColon";
/** 设置里的顺序。 */
export declare const SPEAKER_RULES: readonly SpeakerRule[];
export interface SpeakerTag {
    name: string; /** 行首这几个字是标记（含首行缩进）：收进名字牌、不进框。 */
    length: number;
}
/** 这一行行首的说话人标记；没有 / 规则都没勾 = null。 */
export declare function speakerTag(line: string, enabled: ReadonlySet<SpeakerRule>): SpeakerTag | null;
/** 这一行的说话人；没有 = null。 */
export declare const detectSpeaker: (line: string, enabled: ReadonlySet<SpeakerRule>) => string | null;
