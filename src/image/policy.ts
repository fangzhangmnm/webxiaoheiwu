// 图片进门减肥政策（纯函数，零 DOM / 零解码器；ADR-0013）。created 2026-09-10 by Claude Fable 5.1（user 2026-09-10 两圈 grill 拍板）。
//   · 长边 ≤ 上限（默认 2048 = WeebPaint 大图 guard 的数；「保留高清」勾 = 4096）→ 原字节只剥 metadata（EXIF / 文本块 / XMP，含 GPS；user「剥干净隐私小图没必要重新编码」）；
//   · 长边 > 上限 → 等比缩到上限 + 白底 + JPEG q85（WeebPaint 参考图同款）；压完反而更大 → 保原（剥过 metadata 的）；
//   · EXIF 方向 ≠ 1 的 JPEG **即使小也重编码**把旋转烤进像素（剥掉方向字段又不烤 = 照片躺倒）；
//   · GIF = 动图（user「00 后 10 后写轻小说的时候会丢动图…留一个这个口子」）：原字节直通不解码不重编码；> 2 MB 由 UI 二次确认（user「不设线只提示体重二次确认，2MB 就胖」）；
//   · 类型看魔数不看扩展名 / MIME（never trust）。
export const IMPORT_EDGE_MAX = 2048;
export const IMPORT_EDGE_MAX_HD = 4096;
export const IMPORT_JPEG_QUALITY = 85;
export const GIF_FAT_BYTES = 2 * 1024 * 1024;

export type ImageType = "jpeg" | "png" | "webp" | "gif";
export const EXT_FOR_TYPE: Record<ImageType, string> = { jpeg: "jpg", png: "png", webp: "webp", gif: "gif" };

/** 魔数嗅探；不认识 → null（不是图片，拒收）。 */
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "gif";
  return null;
}

export type ImportPlan =
  | { kind: "passthrough" }                                                   // GIF：原字节
  | { kind: "strip" }                                                         // 小图：只剥 metadata
  | { kind: "reencode"; fw: number; fh: number; keepOriginalIfBigger: boolean };   // 缩 + JPEG；压大保原（方向烤像素的除外）

/** w/h = 解码后（已按 EXIF 方向摆正）的尺寸；orientation = JPEG 的 EXIF Orientation（无 → null）。 */
export function planImageImport(o: { type: ImageType; w: number; h: number; orientation: number | null; hd: boolean }): ImportPlan {
  if (o.type === "gif") return { kind: "passthrough" };
  const cap = o.hd ? IMPORT_EDGE_MAX_HD : IMPORT_EDGE_MAX;
  const long = Math.max(o.w, o.h);
  const needsBake = o.type === "jpeg" && o.orientation != null && o.orientation !== 1;
  if (!(o.w > 0) || !(o.h > 0)) return { kind: "strip" };   // 尺寸不可信 → 不动像素（诚实豁免）
  if (long <= cap && !needsBake) return { kind: "strip" };
  const k = Math.min(1, cap / long);
  return { kind: "reencode", fw: Math.max(1, Math.round(o.w * k)), fh: Math.max(1, Math.round(o.h * k)), keepOriginalIfBigger: !needsBake };
}

export const isFatGif = (bytes: number): boolean => bytes > GIF_FAT_BYTES;

/** 进门页名：有名保名（去路径字符），扩展名以**实际字节类型**为准（改名 IMG.jpeg → 仍 .jpeg 保留；无扩展名 / 扩展名不符 → 补真实的）；无名（粘贴位图）→ `<date>-<hex4>.<ext>`。撞名由 graph 层 hex4。 */
export function importPageName(originalName: string | null, ext: string, fallbackStem: string): string {
  const raw = (originalName ?? "").split(/[\\/]/).pop() ?? "";
  const clean = raw.replace(/[\r\n]+/g, " ").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").replace(/^\.+/, "").trim().slice(0, 200);
  if (!clean) return `${fallbackStem}.${ext}`;
  const m = clean.match(/^(.*?)(?:\.([A-Za-z0-9]{1,8}))?$/);
  const stem = (m?.[1] ?? clean) || clean, gotExt = (m?.[2] ?? "").toLowerCase();
  const sameFamily = gotExt === ext || (ext === "jpg" && gotExt === "jpeg") || (ext === "jpeg" && gotExt === "jpg");
  return sameFamily && gotExt ? `${stem}.${gotExt}` : `${stem}.${ext}`;
}
