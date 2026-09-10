import { type Project, type NodeMeta } from "./format.ts";
export type NowFn = () => number;
/** 按撞名口径找已存在的节点名（大小写/NFC 不敏感）；没有 → null。 */
export declare function resolveName(p: Project, name: string): string | null;
export declare const isStub: (p: Project, name: string) => boolean;
export declare function meta(p: Project, name: string): NodeMeta;
/** 新建节点：撞名 = 链接不是新建（ADR-0009 §6）→ 返回已有名并不覆盖。返回最终名。 */
export declare function createNode(p: Project, name: string, text?: string, now?: NowFn): {
    name: string;
    created: boolean;
};
/** 写正文（内容变了才 touch modified）。 */
export declare function setNodeText(p: Project, name: string, text: string, now?: NowFn): boolean;
export declare function setLinks(p: Project, name: string, links: string[], now?: NowFn): void;
/** 加一条出边（默认末尾：user 2026-09-10「节点应该加在末尾」，取代 09-09 journal 的「顶部最新最热」；ADR-0009 修订）；已有则不重复。 */
export declare function link(p: Project, from: string, to: string, opts?: {
    at?: "top" | "bottom";
    now?: NowFn;
}): boolean;
export declare function unlink(p: Project, from: string, to: string, now?: NowFn): boolean;
/** 反链 = 查询（不存）：谁的 links 里有这个名字。 */
export declare function backlinks(p: Project, name: string): string[];
/** 改名 = 改 entry 名 + 重写所有引用它的 links（ADR-0009 §7）。目标撞名 → 抛。 */
export declare function renameNode(p: Project, from: string, to: string, now?: NowFn): void;
/** 孤儿：有文件、但没有任何节点指向它。 */
export declare const isOrphan: (p: Project, name: string) => boolean;
/** 丢引用（user 2026-09-10「删除模型就是 gc 里面的丢引用」）：断开 from→to；to 若因此成孤儿（有文件、没人再指向）→ 改名 `<prefix><名>`（唯一化）让原名腾出来
 *  （prefix 由调用方按界面语言给，如 zh `_废-`、en `_dropped-`——user「英文界面不要自动生成中文名字」；ADR-0009 §2 的沉底前缀）。
 *  **只有这个动作改名**：别的途径成孤儿（根页本来就没人指、读进来的散 txt）一律不动（user「非删除的变成孤儿不应自动改名」）。返回孤儿的新名；没成孤儿 / 占位符 → null。 */
export declare function dropRef(p: Project, from: string, to: string, prefix: string, now?: NowFn): string | null;
/** 彻底删除：只准孤儿（还有人指向 → 抛；UI 先弹框确认）。 */
export declare function purgeOrphan(p: Project, name: string): boolean;
/** 删除节点（正文没了；别人指向它的边留着 = 变占位符）。2.0.7 起 UI 不直接用它（走 dropRef / purgeOrphan）。 */
export declare function deleteNode(p: Project, name: string): boolean;
/** 检索（结果临时）：名字或正文包含 q（大小写不敏感）。返回名字，按 modified 降序。最少字数默认 1（user 2026-09-10「检索不限字数，这样可以搜全量孤儿」，取代 ADR-0009 的「至少两个字」）。 */
export declare function search(p: Project, q: string, opts?: {
    minChars?: number;
    limit?: number;
}): string[];
/** 一个节点的邻居面（边栏的数据）：出边按数组顺序，每条带「有没有文件」。 */
export declare function neighbors(p: Project, name: string): {
    name: string;
    stub: boolean;
}[];
