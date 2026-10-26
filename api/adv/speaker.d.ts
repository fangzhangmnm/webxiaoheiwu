export type SpeakerRule = "colon" | "bracket" | "jaQuote" | "enColon";
/** 设置里的顺序。 */
export declare const SPEAKER_RULES: readonly SpeakerRule[];
/** 这一行的说话人；没有 / 规则都没勾 = null。 */
export declare function detectSpeaker(line: string, enabled: ReadonlySet<SpeakerRule>): string | null;
