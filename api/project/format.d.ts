export declare const PROJECT_FORMAT = "webxiaoheiwu";
export declare const PROJECT_FORMAT_VERSION = 2;
export declare const GRAPH_ENTRY = "graph.json";
export declare const CONTENTS_DIR = "pages/";
export declare const EDITOR_STATE_ENTRY = ".webxiaoheiwu/editor-state.json";
/** 封面缩略图（ORA 同款路径；ADR-0012）。写时永远最后一个 entry（store getPeek 一次尾读命中）。 */
export declare const THUMBNAIL_ENTRY = "Thumbnails/thumbnail.png";
/** 图片页扩展名（2.1）：认这些就当图片页打开；GIF 动图原字节直通。 */
export declare const IMAGE_EXTS: readonly string[];
export type NodeKind = "txt" | "image" | "other";
/** entry 时间戳钉死 → 同内容同字节（ADR-0008 §4/§6）。 */
export declare const PINNED_MTIME: Date;
export interface NodeMeta {
    links: string[];
    created: number;
    modified: number;
}
/** 主干树节点：名字字符串（叶）或 { name, children }（组 = 有孩子的页）。`{ name, children: [] }` 与字符串同义，写出时折成字符串。 */
export type TreeNode = string | {
    name: string;
    children: TreeNode[];
};
export interface ProjectGraphJson {
    format: typeof PROJECT_FORMAT;
    version: number;
    wroteWith: string;
    readOnly?: boolean;
    tree: TreeNode[];
    pages: Record<string, NodeMeta>;
}
export interface EditorState {
    last: string | null;
    back: string[];
}
export declare const BACK_STACK_MAX = 50;
export interface Project {
    nodes: Map<string, NodeMeta>;
    contents: Map<string, Uint8Array>;
    /** 主干树（ADR-0014）。只经 graph.ts 的树操作改；散页 = 有文件但不在这里。 */
    tree: TreeNode[];
    editorState: EditorState;
    /** 读到的清单 version（太新 → 横幅 + 禁覆盖，宿主看这个）。 */
    readVersion: number;
    /** 修改锁（user 2026-09-10「zip 锁跟着作品」）：成品不想被误改。切换 = 正经改动（标脏、推云）。 */
    readOnly: boolean;
    /** 封面 PNG 字节（Thumbnails/thumbnail.png）；null = 没有封面（书库显示 book 图标）。 */
    thumbnail: Uint8Array | null;
}
export type UnpackResult = {
    kind: "ok";
    project: Project;
    warnings: string[];
} | {
    kind: "not-project";
    reason: string;
} | {
    kind: "too-new";
    version: number;
} | {
    kind: "corrupt";
    reason: string;
};
/** 撞名口径（ADR-0009 §5）：完整文件名，大小写不敏感 + NFC。 */
export declare const nameKey: (name: string) => string;
/** pages/ 下合法的页名：扁平（无 /）、非空、不以点开头、无路径字符。 */
export declare function isValidNodeName(name: string): boolean;
/** 渲染用扩展名（最后一个点之后；没有 → ""）。身份不看它（ADR-0009 §5）。 */
export declare const nodeExt: (name: string) => string;
/** 页的种类（只看扩展名）：txt 正文 / image 图片页 / other（合法但不打开）。 */
export declare const nodeKind: (name: string) => NodeKind;
export declare function emptyProject(): Project;
export declare const treeNodeName: (n: TreeNode) => string;
export declare const treeNodeChildren: (n: TreeNode) => TreeNode[];
/** 规范形：`{ name, children: [] }` 折成字符串；递归。 */
export declare function normalizeTree(nodes: TreeNode[]): TreeNode[];
/** 打包（整包重写；ADR-0008 §4）。严格写：pages 只写有文件的页、links 只留有文件的目标、tree 只留有文件的名字（写出绝不产生悬空，ADR-0014 §3）。 */
export declare function packProject(p: Project): Promise<Blob>;
/** 解包。宽容读、严格写：pages/ 里的文件没进 graph.json 也是页（一包 txt 的 zip 也是合法的书，全是散页）；graph.json 里指向不存在文件的条目 / 悬空 link / 悬空 tree 名字丢弃 + warning；tree 重名 → corrupt。 */
export declare function unpackProject(blob: Blob): Promise<UnpackResult>;
/** 文本页的解码（txt 走 doc-model 的编码链；写回永远 UTF-8）。 */
export declare const readNodeText: (p: Project, name: string) => string | null;
export declare const writeNodeText: (p: Project, name: string, text: string) => void;
