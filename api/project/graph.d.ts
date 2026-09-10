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
/** 加一条出边（默认顶部 = 最新最热，ADR-0009 journal 拍板）；已有则不重复。 */
export declare function link(p: Project, from: string, to: string, opts?: {
    at?: "top" | "bottom";
    now?: NowFn;
}): boolean;
export declare function unlink(p: Project, from: string, to: string, now?: NowFn): boolean;
/** 反链 = 查询（不存）：谁的 links 里有这个名字。 */
export declare function backlinks(p: Project, name: string): string[];
/** 改名 = 改 entry 名 + 重写所有引用它的 links（ADR-0009 §7）。目标撞名 → 抛。 */
export declare function renameNode(p: Project, from: string, to: string, now?: NowFn): void;
/** 删除节点（正文没了；别人指向它的边留着 = 变占位符，符合「打已有名字 = 链接」的逆）。 */
export declare function deleteNode(p: Project, name: string): boolean;
/** 检索（ADR-0009：至少两个字符、结果临时）：名字或正文包含 q（大小写不敏感）。返回名字，按 modified 降序。 */
export declare function search(p: Project, q: string, opts?: {
    minChars?: number;
    limit?: number;
}): string[];
/** 一个节点的邻居面（边栏的数据）：出边按数组顺序，每条带「有没有文件」。 */
export declare function neighbors(p: Project, name: string): {
    name: string;
    stub: boolean;
}[];
