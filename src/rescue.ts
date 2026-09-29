// 世界线被换掉时的留底（app 层）。created 2026-09-29 by Claude Fable 5.1
//   起因：user 2026-09-29「先确保现在如果有冲突的话会进 backup 文件夹」→ 两台设备端到端测试（test/e2e-sync/）抓到三条 app 层丢字路径。
//   库的承诺只覆盖**已经落盘的字节**：冲突面选「云端覆盖本地」时，被换掉的本地那一版进备份箱。库看不见的是还停在编辑器里、
//   没来得及落盘的字——推云是 30 s 心跳，常常就发生在打字途中；上传要一两秒，这一两秒里打的字不在库备份的那一版里。
//   这些字由本模块**另存成书库里一份新稿**，绝不写回原名：原名此刻已经是云端那一版，把旧世界写回去 = 下次推送 If-Match 云端 etag 成功
//   = 静默盖掉另一台设备的修改（数据安全词典序第一级：云端不丢 >> 当前操作不丢）。
//   加密稿的留底照样封好再留（明文绝不上云）；封不上 → 进本机回收站并响亮报错（字节还在，不泄露）。
import { createDoc, createProjectDoc, encryptDoc, trashDoc } from "./docs.ts";
import { parseDocName, formatDate } from "./doc-model.ts";
import { note as diagNote } from "./diag-log.ts";
import { t } from "./i18n/index.ts";

const titleFor = (sourceName: string): string => t("rescue.title", { name: parseDocName(sourceName).stem });

async function sealOrTrash(name: string): Promise<void> {
  try { await encryptDoc(name); }
  catch (e) {
    try { await trashDoc(name); } catch { /* 回收站也进不去：下面照样抛，调用方报错 */ }
    throw new Error(`rescue copy could not be sealed; moved to the local recycle bin: ${e instanceof Error ? e.message : String(e)}`);
  }
}
/** txt 稿：把编辑器里这一整篇另存成新稿。返回新稿身份。 */
export async function rescueText(sourceName: string, text: string, opts: { encrypted: boolean }): Promise<string> {
  const name = await createDoc(titleFor(sourceName), text, formatDate(Date.now()), parseDocName(sourceName).dir);
  if (opts.encrypted) await sealOrTrash(name);
  diagNote("sync", `rescue copy of "${sourceName}" → "${name}" (${text.length} chars)`);
  return name;
}
/** 书：把屏幕上那一整本（含还没落盘的改动）另存成一本新书。返回新书身份。 */
export async function rescueBook(sourceName: string, blob: Blob, opts: { encrypted: boolean }): Promise<string> {
  const name = await createProjectDoc(titleFor(sourceName), blob, formatDate(Date.now()), parseDocName(sourceName).dir);
  if (opts.encrypted) await sealOrTrash(name);
  diagNote("sync", `rescue copy of "${sourceName}" → "${name}" (${blob.size} bytes)`);
  return name;
}
