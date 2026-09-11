import { type Project, type NodeMeta, type TreeNode } from "./format.ts";
export type NowFn = () => number;
/** 按撞名口径找已存在的页名（大小写/NFC 不敏感）；没有 → null。 */
export declare function resolveName(p: Project, name: string): string | null;
export declare function meta(p: Project, name: string): NodeMeta;
/** 新建页：撞名 = 链接不是新建（ADR-0009 §6）→ 返回已有名并不覆盖。返回最终名。不进树（进树走 insertSibling / insertChild）。 */
export declare function createNode(p: Project, name: string, text?: string, now?: NowFn): {
    name: string;
    created: boolean;
};
/** 写正文（内容变了才 touch modified）。 */
export declare function setNodeText(p: Project, name: string, text: string, now?: NowFn): boolean;
/** 重排出边（只准重排：目标必须都是已有文件的页，悬空一律丢）。 */
export declare function setLinks(p: Project, name: string, links: string[], now?: NowFn): void;
/** 加一条出边（默认末尾：user 2026-09-10「节点应该加在末尾」；ADR-0009 修订）；目标必须有文件（占位符已废）→ 没有则抛；已有则不重复。 */
export declare function link(p: Project, from: string, to: string, opts?: {
    at?: "top" | "bottom";
    now?: NowFn;
}): boolean;
export declare function unlink(p: Project, from: string, to: string, now?: NowFn): boolean;
/** 一页的出边（侧栏「链接」段的数据；数组顺序 = 用户手排）。 */
export declare const links: (p: Project, name: string) => string[];
/** 唯一化：撞名 → `stem-hex4.ext`（user 2026-09-10「撞名加 hash，我最讨厌 123 这种的序号焦虑」）。不撞 → 原名（NFC）。 */
export declare function uniqueNodeName(p: Project, name: string): string;
/** 新建字节页（图片进门）：撞名不链接、加 hex4（新字节不是同一页）。返回最终名。 */
export declare function createBytesNode(p: Project, name: string, bytes: Uint8Array, now?: NowFn): string;
/** 替换字节（「替换图片」：保名保边，只换内容）。 */
export declare function replaceNodeBytes(p: Project, name: string, bytes: Uint8Array, now?: NowFn): void;
/** 反链 = 查询（不存）：谁的 links 里有这个名字。 */
export declare function backlinks(p: Project, name: string): string[];
/** 改名 = 改 entry 名 + 重写所有引用它的 links + tree 里的条目 + editor-state（ADR-0009 §7 / ADR-0014 §11）。目标撞名 → 抛。 */
export declare function renameNode(p: Project, from: string, to: string, now?: NowFn): void;
/** 废弃（用户面 = 删除；ADR-0014 §8）：改名 `<prefix>x`（撞名 → `<prefix>x-hex4`）；在树里 → 连同子树出树（子树边降级成 links，同 detachToLinks）且**子节各自也改名**（删容器 = 删内容）；
 *  不删字节；指向它们的 links 随改名重写（renameNode 既有行为）。已带前缀的页不再套第二层。返回 { renamed: 旧名→新名 的顺序表（x 在首）, detached: 出树的子树页数 }。散页上的废弃 = 只改名。 */
export declare function discard(p: Project, name: string, prefix: string, now?: NowFn, prefixes?: readonly string[]): {
    renamed: {
        from: string;
        to: string;
    }[];
    detached: number;
};
/** 彻底删除：只对带废弃前缀的页（别的 → 抛；UI 先弹 sheet 写明有几页链接到它）。删文件 + 指向它的 links 条目移除（deleteNode）。返回被移除的入链来源。 */
export declare function purge(p: Project, name: string, prefixes: readonly string[]): string[];
/** 删除页（正文没了）。不留悬空：指向它的边一并断掉；在树里则拿掉（它的孩子提到它的位置）。2.0.7 起 UI 不直接用它（走 dropRef / purgeOrphan）。 */
export declare function deleteNode(p: Project, name: string): boolean;
/** 检索（结果临时）：名字或正文包含 q（大小写不敏感）。返回名字，按 modified 降序。最少字数默认 1（user 2026-09-10「检索不限字数，这样可以搜全量孤儿」）。 */
export declare function search(p: Project, q: string, opts?: {
    minChars?: number;
    limit?: number;
}): string[];
export declare const inTree: (p: Project, name: string) => boolean;
/** 父页名；顶层 / 不在树里 → null（配 inTree 区分）。 */
export declare function treeParent(p: Project, name: string): string | null;
/** 同一层的兄弟（含自己，数组顺序）；不在树里 → []。 */
export declare function treeSiblings(p: Project, name: string): string[];
/** 孩子（数组顺序）；不在树里 / 没孩子 → []。 */
export declare function treeChildren(p: Project, name: string): string[];
/** 祖先链：根 → … → 自己；不在树里 → []。 */
export declare function treePath(p: Project, name: string): string[];
/** 前序 DFS：自己 → 孩子 → 下一个兄弟 → 回溯（ADR-0014 §6；上一页/下一页与导出的顺序）。只走 tree，不看 links。 */
export declare function dfsOrder(p: Project, root?: TreeNode[]): string[];
/** 上一页 / 下一页（首尾不绕回：树首 prev = null、树尾 next = null；散页 = null）。 */
export declare function dfsPrev(p: Project, name: string): string | null;
export declare function dfsNext(p: Project, name: string): string | null;
/** 上移 / 下移：只在同一个 children 数组内交换；到头 / 不在树里 → false。 */
export declare function moveUp(p: Project, name: string): boolean;
export declare function moveDown(p: Project, name: string): boolean;
/** 升级：x 从父 P 的 children 移除，插到 P 在它所在数组中的位置之后；x 已是顶层（没有 P）→ false。 */
export declare function outdent(p: Project, name: string): boolean;
/** 降级：x 移除，追加到上一个兄弟 S 的 children 末尾（S 是字符串 → 升格为 { name: S, children: [x] }）；没有上一个兄弟 → false。 */
export declare function indent(p: Project, name: string): boolean;
/** 移出树：整个子树拿掉（x 的孩子跟着 x 走——树是唯一的容器，它们也都成散页）。页文件、links 一个字节不动。返回拿掉的子树（归档 / 移动时原样放回）；不在树里 → null。 */
export declare function detach(p: Project, name: string): TreeNode | null;
/** 移出树（用户面动作；ADR-0014 §8）：x 连同子树离开树，**子树边降级成 links**——每一层的孩子按原顺序追加到父亲的 links 末尾（已有的边不重复），结构不丢；不改名。
 *  返回改成链接的页数（= 子树里的边数）；不在树里 → null。树内搬家仍用纯 detach（子树保持为树）。 */
export declare function detachToLinks(p: Project, name: string, now?: NowFn): number | null;
/** 归档 / 移动：x 放到 anchor 之后（同一层）。x 已在树里 → 先 detach（子树跟着走）再放；anchor 在 x 的子树里 → 抛（不能把自己放进自己）。x / anchor 没文件 → 抛。 */
export declare function attachAfter(p: Project, name: string, anchor: string): void;
/** 归档 / 移动：x 放到 parent 之下（孩子末尾；parent 是字符串 → 升格为组）。规则同 attachAfter。 */
export declare function attachUnder(p: Project, name: string, parent: string): void;
/** 放到树的最末尾（顶层）：没有锚时的归档。 */
export declare function attachAtEnd(p: Project, name: string): void;
export type InsertResult = {
    name: string;
    created: boolean;
    placed: boolean;
};
/** 「+ 兄弟」：打新名 = 当场建空文件并接在 after 之后；打已有名（ADR-0009 §6「撞名 = 链接」在树上的读法）= 散页 → 归档到这里；已在树里的页 → 不动它的位置（placed:false，调用方跳过去即可）。 */
export declare function insertSibling(p: Project, after: string, newName: string, now?: NowFn): InsertResult;
/** 「+ 子节」：同 insertSibling，但放到 parent 的孩子末尾。 */
export declare function insertChild(p: Project, parent: string, newName: string, now?: NowFn): InsertResult;
/** 导出这一支（ADR-0014 §6）：选中页的子树前序 DFS，把 txt 页的正文用 `\n\n` 拼成一个文本（图片页 / 其他页跳过）。不在树里 → 只有它自己。 */
export declare function exportSubtree(p: Project, name: string): string;
