export declare const PROJECT_FORMAT = "webxiaoheiwu";
export declare const PROJECT_FORMAT_VERSION = 1;
export declare const GRAPH_ENTRY = "graph.json";
export declare const CONTENTS_DIR = "contents/";
export declare const EDITOR_STATE_ENTRY = ".webxiaoheiwu/editor-state.json";
/** entry 时间戳钉死 → 同内容同字节（ADR-0008 §4/§6）。 */
export declare const PINNED_MTIME: Date;
export interface NodeMeta {
    links: string[];
    created: number;
    modified: number;
}
export interface ProjectGraphJson {
    format: typeof PROJECT_FORMAT;
    version: number;
    wroteWith: string;
    nodes: Record<string, NodeMeta>;
}
export interface EditorState {
    last: string | null;
    back: string[];
}
export declare const BACK_STACK_MAX = 50;
export interface Project {
    nodes: Map<string, NodeMeta>;
    contents: Map<string, Uint8Array>;
    editorState: EditorState;
    /** 读到的清单 version（太新 → 横幅 + 禁覆盖，宿主看这个）。 */
    readVersion: number;
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
/** contents/ 下合法的节点名：扁平（无 /）、非空、不以点开头、无路径字符。 */
export declare function isValidNodeName(name: string): boolean;
/** 渲染用扩展名（最后一个点之后；没有 → ""）。身份不看它（ADR-0009 §5）。 */
export declare const nodeExt: (name: string) => string;
export declare function emptyProject(): Project;
/** 打包（整包重写；ADR-0008 §4）。graph.json 只写 contents/ 里真有的节点；links 原样（可含占位符）。 */
export declare function packProject(p: Project): Promise<Blob>;
/** 解包。宽容读、严格写：contents/ 里的文件没进 graph.json 也是节点（一包 txt 的 zip 也是合法工程）；graph.json 里指向不存在文件的节点条目丢弃。 */
export declare function unpackProject(blob: Blob): Promise<UnpackResult>;
/** 文本节点的解码（txt 走 doc-model 的编码链；写回永远 UTF-8）。 */
export declare const readNodeText: (p: Project, name: string) => string | null;
export declare const writeNodeText: (p: Project, name: string, text: string) => void;
