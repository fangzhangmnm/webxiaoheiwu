import { type PackManifest } from "./packs.generated.ts";
export type ModelKey = "local-sensevoice" | "local-zh14m";
type I18nKey = Parameters<(typeof import("../i18n/index.ts"))["t"]>[0];
export interface ModelInfo {
    key: ModelKey;
    slug: string;
    packId: string;
    manifest: PackManifest;
    bytes: number;
    nameKey: I18nKey;
    attrKey: I18nKey;
}
export declare const MODELS: Record<ModelKey, ModelInfo>;
export declare const DEFAULT_MODEL: ModelKey;
/** synced pref `voiceProvider` 的旧值（webspeech / groq / openai / selfhosted，2026-09-03 sunset）一律落到默认模型。 */
export declare function modelKeyFrom(v: string | null | undefined): ModelKey;
export {};
