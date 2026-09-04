// 可选识别模型（产品面）→ 模型仓 pack 的映射。manifest 本体内嵌在 packs.generated.ts（信任根）。created 2026-09-03 by Claude Fable 5.1
//   user 2026-09-03 拍板：理智杯 SenseVoice 为主；极限小杯 zh-14M 做「interesting option」；Dolphin 备而不露。
import { PACK_MANIFESTS, type PackManifest } from "./packs.generated.ts";

export type ModelKey = "local-sensevoice" | "local-zh14m";
type I18nKey = Parameters<(typeof import("../i18n/index.ts"))["t"]>[0];
export interface ModelInfo { key: ModelKey; slug: string; packId: string; manifest: PackManifest; bytes: number; nameKey: I18nKey; attrKey: I18nKey }

function info(key: ModelKey, slug: string, nameKey: I18nKey, attrKey: I18nKey): ModelInfo {
  const p = PACK_MANIFESTS[slug];
  if (!p) throw new Error(`pack manifest missing for ${slug} (run tools/gen-asr-packs.mjs)`);
  return { key, slug, packId: p.packId, manifest: p.manifest, bytes: p.manifest.totalBytes, nameKey, attrKey };
}

export const MODELS: Record<ModelKey, ModelInfo> = {
  "local-sensevoice": info("local-sensevoice", "sense-voice-small-int8-20240717", "ui.voice.model.sensevoice", "voice.attr.sensevoice"),
  "local-zh14m": info("local-zh14m", "zipformer-streaming-zh-14M-int8-20230223", "ui.voice.model.zh14m", "voice.attr.zh14m"),
};
export const DEFAULT_MODEL: ModelKey = "local-sensevoice";

/** synced pref `voiceProvider` 的旧值（webspeech / groq / openai / selfhosted，2026-09-03 sunset）一律落到默认模型。 */
export function modelKeyFrom(v: string | null | undefined): ModelKey {
  return v === "local-zh14m" || v === "local-sensevoice" ? v : DEFAULT_MODEL;
}
