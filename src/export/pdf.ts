// 最小 PDF 写出器：对象、流（Flate）、页树、一款子集 TrueType 字体（Type0 / CIDFontType2 / Identity-H）、JPEG 图片、书签。纯函数，零 DOM。
// created 2026-09-30 by Claude Fable 5.1（user「老老实实做 pdf 吧」）。只做这本书用得到的那一小块 PDF 1.7：
//   · 文字 = 两字节字形号的十六进制串（CID = 原字体的字形号，CIDToGIDMap /Identity），所以排版层只要给「字形号 + 位置」；
//     ToUnicode CMap 把字形号映回 Unicode——阅读器里能选中、复制、搜索。
//   · 字体 = ttf.ts 的子集（只含用到的字形），FontFile2 + Flate。
//   · 图片 = JPEG 原字节直塞（DCTDecode）；别的格式由调用方先转成 JPEG。
//   · 坐标：调用方用「左上角为原点、y 向下」的页面坐标（和长图一样），这里翻成 PDF 的左下角原点。
import { zlibSync } from "../../vendor/fflate/fflate.esm.js";
import type { TtfFont } from "./ttf.ts";

export type Rgb = [number, number, number];   // 0..1
export interface PdfImage { jpeg: Uint8Array; w: number; h: number; components: 1 | 3 | 4 }
/** 一页上的东西（页面坐标：左上原点，单位 pt）。text 的 y = 基线。 */
export type PdfOp =
  | { op: "rect"; x: number; y: number; w: number; h: number; color: Rgb; /** 不透明度 0..1（缺省 1）。封面图上书名底下那块半透明的纸。 */ alpha?: number }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; color: Rgb; width: number }
  | { op: "text"; x: number; y: number; text: string; size: number; color: Rgb; /** 这一行在段落里的前文 / 后文（不画，只给注音字体按词选读音用——词可能正好被折行拆开）。 */ before?: string; after?: string; /** 顺时针转 90°（以 x, y 为轴；竖排里侧躺的拉丁串 / 括号） */ rotate?: 90 }
  | { op: "image"; x: number; y: number; w: number; h: number; image: PdfImage };
/** 页内链接：这一页上的一块矩形（左上角坐标系，和 ops 一样），点了跳到第 page 页（从 0 起）。 */
export interface PdfLink { x: number; y: number; w: number; h: number; page: number }
export interface PdfPage { w: number; h: number; ops: PdfOp[]; links?: PdfLink[] }
export interface PdfOutlineItem { title: string; page: number; /** 层级（0 = 最外层；按先序排列，下一条比上一条深 = 它的孩子）。缺省 0。 */ level?: number }   // page = 从 0 起的页序
export interface PdfDoc { title: string; pages: PdfPage[]; outline?: PdfOutlineItem[]; producer?: string; /** 生成时间（写进文档信息的 CreationDate）。不给 = 不写（同内容同字节）。 */ created?: Date }
export interface PdfStats { glyphs: number; missing: string[]; fontBytes: number }

const enc = new TextEncoder();
const num = (v: number): string => (Math.round(v * 1000) / 1000).toString();
const hex4 = (v: number): string => (v & 0xffff).toString(16).padStart(4, "0").toUpperCase();
/** PDF 文本串（UTF-16BE + BOM，十六进制写法）：书名 / 书签里的中文。 */
const hexString = (s: string): string => { let out = "<FEFF"; for (let i = 0; i < s.length; i++) out += hex4(s.charCodeAt(i)); return out + ">"; };

/** JPEG 的宽高和通道数（读 SOF 段）。不是 JPEG → null。 */
export function jpegInfo(b: Uint8Array): { w: number; h: number; components: 1 | 3 | 4 } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) { o++; continue; }
    const m = b[o + 1]!;
    if (m === 0xff) { o++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
    const len = (b[o + 2]! << 8) | b[o + 3]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const c = b[o + 9]!; if (c !== 1 && c !== 3 && c !== 4) return null;
      return { h: (b[o + 5]! << 8) | b[o + 6]!, w: (b[o + 7]! << 8) | b[o + 8]!, components: c };
    }
    o += 2 + len;
  }
  return null;
}

/** 把一份文档写成 PDF 字节。font = 解析好的 TTF（整份字体的字节在它里面，子集在这里取）。 */
export function writePdf(doc: PdfDoc, font: TtfFont, opts: { stats?: PdfStats } = {}): Uint8Array {
  const chunks: Uint8Array[] = []; let length = 0;
  const offsets: number[] = [0];   // 对象号 → 文件偏移（0 号空着）
  const push = (d: Uint8Array | string): void => { const b = typeof d === "string" ? enc.encode(d) : d; chunks.push(b); length += b.length; };
  const reserve = (): number => { offsets.push(-1); return offsets.length - 1; };
  const begin = (n: number): void => { offsets[n] = length; push(`${n} 0 obj\n`); };
  const obj = (n: number, body: string): void => { begin(n); push(body + "\nendobj\n"); };
  const stream = (n: number, dict: string, data: Uint8Array, compress = true): void => {
    const body = compress ? zlibSync(data) : data;
    begin(n); push(`<< ${dict}${compress ? " /Filter /FlateDecode" : ""} /Length ${body.length} >>\nstream\n`); push(body); push("\nendstream\nendobj\n");
  };

  push("%PDF-1.7\n%âãÏÓ\n");
  const catalog = reserve(), pagesObj = reserve(), fontObj = reserve(), cidObj = reserve(), descObj = reserve(), fileObj = reserve(), uniObj = reserve(), infoObj = reserve();

  // ── 页内容：边写边收集用到的字形 ──
  const used = new Map<number, number>();   // 字形号 → 码点（ToUnicode 用；同一字形多个码点时留第一个）
  const missing = new Set<string>();
  const images = new Map<PdfImage, { n: number; name: string }>();
  const pageObjs: number[] = doc.pages.map(() => reserve());   // 页对象号先占好：前面的页要链到后面的页
  doc.pages.forEach((page, pi) => {
    const H = page.h; let c = ""; const xobj: string[] = []; const alphas = new Set<number>();
    for (const o of page.ops) {
      if (o.op === "rect") {
        const fillRect = `${num(o.color[0])} ${num(o.color[1])} ${num(o.color[2])} rg ${num(o.x)} ${num(H - o.y - o.h)} ${num(o.w)} ${num(o.h)} re f`;
        if (o.alpha != null && o.alpha < 1) { const a = Math.round(Math.max(0, o.alpha) * 100); alphas.add(a); c += `q /GS${a} gs ${fillRect} Q\n`; } else c += fillRect + "\n";
      }
      else if (o.op === "line") c += `${num(o.color[0])} ${num(o.color[1])} ${num(o.color[2])} RG ${num(o.width)} w ${num(o.x1)} ${num(H - o.y1)} m ${num(o.x2)} ${num(H - o.y2)} l S\n`;
      else if (o.op === "text") {
        let hex = "";
        const chars = [...o.text], skipN = o.before ? [...o.before].length : 0;
        const shaped = font.shape((o.before ?? "") + o.text + (o.after ?? ""));   // 上下文必换（注音字体的多音字）；普通字体 = 逐字查表
        chars.forEach((ch, k) => {
          const cp = ch.codePointAt(0)!; const g = shaped[skipN + k] ?? 0;
          if (g === 0 && ch.trim()) missing.add(ch);
          if (!used.has(g)) used.set(g, cp);
          hex += hex4(g);
        });
        if (hex) {
          const at = o.rotate === 90 ? `0 -1 1 0 ${num(o.x)} ${num(H - o.y)} Tm` : `${num(o.x)} ${num(H - o.y)} Td`;
          c += `BT /F1 ${num(o.size)} Tf ${num(o.color[0])} ${num(o.color[1])} ${num(o.color[2])} rg ${at} <${hex}> Tj ET\n`;
        }
      } else {
        let im = images.get(o.image);
        if (!im) { im = { n: reserve(), name: `Im${images.size + 1}` }; images.set(o.image, im); }
        if (!xobj.includes(im.name)) xobj.push(im.name);
        c += `q ${num(o.w)} 0 0 ${num(o.h)} ${num(o.x)} ${num(H - o.y - o.h)} cm /${im.name} Do Q\n`;
      }
    }
    const content = reserve(), pg = pageObjs[pi]!;
    stream(content, "", enc.encode(c));
    const links = (page.links ?? []).filter((l) => l.page >= 0 && l.page < pageObjs.length);
    const annots = links.length ? ` /Annots [${links.map((l) => `<< /Type /Annot /Subtype /Link /Rect [${num(l.x)} ${num(H - l.y - l.h)} ${num(l.x + l.w)} ${num(H - l.y)}] /Border [0 0 0] /Dest [${pageObjs[l.page]} 0 R /Fit] >>`).join(" ")}]` : "";
    const xo = xobj.length ? ` /XObject << ${xobj.map((nm) => `/${nm} ${[...images.values()].find((v) => v.name === nm)!.n} 0 R`).join(" ")} >>` : "";
    obj(pg, `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(page.w)} ${num(page.h)}] /Resources << /Font << /F1 ${fontObj} 0 R >>${xo}${alphas.size ? ` /ExtGState << ${[...alphas].map((a) => `/GS${a} << /ca ${num(a / 100)} >>`).join(" ")} >>` : ""} >> /Contents ${content} 0 R${annots} >>`);
  });
  for (const [img, { n }] of images) stream(n, `/Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /${img.components === 1 ? "DeviceGray" : img.components === 4 ? "DeviceCMYK" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode`, img.jpeg, false);
  obj(pagesObj, `<< /Type /Pages /Kids [${pageObjs.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjs.length} >>`);

  // ── 字体：子集 + 宽度表 + ToUnicode ──
  const k = 1000 / font.unitsPerEm; const s = (v: number): number => Math.round(v * k);
  const gids = [...used.keys()].sort((a, b) => a - b);
  const sub = font.subset(gids);
  const tagSeed = gids.reduce((a, g) => (a * 31 + g) >>> 0, gids.length);   // 子集前缀：六个大写字母，同一子集同一前缀（同内容同字节）
  let prefix = ""; for (let i = 0, v = tagSeed; i < 6; i++) { prefix += String.fromCharCode(65 + (v % 26)); v = Math.floor(v / 26) + i * 7; }
  const base = `${prefix}+${font.psName}`;
  // /W：连续字形号并成一段
  let W = ""; for (let i = 0; i < gids.length;) { let j = i; const ws: number[] = []; while (j < gids.length && gids[j] === gids[i]! + (j - i)) { ws.push(s(font.advance(gids[j]!))); j++; } W += `${gids[i]} [${ws.join(" ")}] `; i = j; }
  stream(fileObj, `/Length1 ${sub.length}`, sub);
  obj(descObj, `<< /Type /FontDescriptor /FontName /${base} /Flags 4 /FontBBox [${font.bbox.map(s).join(" ")}] /ItalicAngle 0 /Ascent ${s(font.ascender)} /Descent ${s(font.descender)} /CapHeight ${s(font.capHeight)} /StemV 80 /FontFile2 ${fileObj} 0 R >>`);
  obj(cidObj, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descObj} 0 R /DW 1000 /W [ ${W}] /CIDToGIDMap /Identity >>`);
  let cmapText = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n";
  const pairs = gids.filter((g) => g !== 0).map((g) => { const cp = used.get(g)!; const u = cp > 0xffff ? hex4(0xd800 + ((cp - 0x10000) >> 10)) + hex4(0xdc00 + ((cp - 0x10000) & 0x3ff)) : hex4(cp); return `<${hex4(g)}> <${u}>`; });
  for (let i = 0; i < pairs.length; i += 100) { const part = pairs.slice(i, i + 100); cmapText += `${part.length} beginbfchar\n${part.join("\n")}\nendbfchar\n`; }
  cmapText += "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n";
  stream(uniObj, "", enc.encode(cmapText));
  obj(fontObj, `<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${cidObj} 0 R] /ToUnicode ${uniObj} 0 R >>`);

  // ── 书签：和书的目录树同一个层级（user 2026-10-01「pdf的目录能有一样的Hierarchy结构吗？」）。条目按先序给、带 level；这里拼成 PDF 的父子兄弟链。全部展开。──
  let outlineRef = "";
  const items = (doc.outline ?? []).filter((it) => it.page >= 0 && it.page < pageObjs.length);
  if (items.length) {
    const root = reserve(); const ids = items.map(() => reserve());
    type Node = { parent: number; kids: number[]; desc: number };   // parent = -1 表示挂在根上
    const nodes: Node[] = items.map(() => ({ parent: -1, kids: [], desc: 0 })); const top: number[] = []; const stack: { i: number; level: number }[] = [];
    items.forEach((it, i) => {
      const level = Math.max(0, it.level ?? 0);
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      const par = stack.length ? stack[stack.length - 1]!.i : -1;
      nodes[i]!.parent = par; (par < 0 ? top : nodes[par]!.kids).push(i);
      for (let a = par; a >= 0; a = nodes[a]!.parent) nodes[a]!.desc++;
      stack.push({ i, level });
    });
    items.forEach((it, i) => {
      const n = nodes[i]!, sibs = n.parent < 0 ? top : nodes[n.parent]!.kids, k = sibs.indexOf(i);
      obj(ids[i]!, `<< /Title ${hexString(it.title)} /Parent ${n.parent < 0 ? root : ids[n.parent]} 0 R${k > 0 ? ` /Prev ${ids[sibs[k - 1]!]} 0 R` : ""}${k < sibs.length - 1 ? ` /Next ${ids[sibs[k + 1]!]} 0 R` : ""}${n.kids.length ? ` /First ${ids[n.kids[0]!]} 0 R /Last ${ids[n.kids[n.kids.length - 1]!]} 0 R /Count ${n.desc}` : ""} /Dest [${pageObjs[it.page]} 0 R /Fit] >>`);
    });
    obj(root, `<< /Type /Outlines /First ${ids[top[0]!]} 0 R /Last ${ids[top[top.length - 1]!]} 0 R /Count ${items.length} >>`);
    outlineRef = ` /Outlines ${root} 0 R /PageMode /UseOutlines`;
  }
  const pdfDate = (d: Date): string => { const p2 = (v: number): string => String(v).padStart(2, "0"); const off = -d.getTimezoneOffset(), sign = off < 0 ? "-" : "+", ao = Math.abs(off); return `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}${sign}${p2(Math.floor(ao / 60))}'${p2(ao % 60)}'`; };
  obj(infoObj, `<< /Title ${hexString(doc.title)} /Producer ${hexString(doc.producer ?? "WebXiaoHeiWu")}${doc.created ? ` /CreationDate (${pdfDate(doc.created)})` : ""} >>`);
  obj(catalog, `<< /Type /Catalog /Pages ${pagesObj} 0 R${outlineRef} >>`);

  // ── xref + trailer ──
  const xrefAt = length; const count = offsets.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(xref); push(`trailer\n<< /Size ${count} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  if (opts.stats) { opts.stats.glyphs = gids.length; opts.stats.missing = [...missing]; opts.stats.fontBytes = sub.length; }
  const out = new Uint8Array(length); let p = 0;
  for (const cnk of chunks) { out.set(cnk, p); p += cnk.length; }
  return out;
}
