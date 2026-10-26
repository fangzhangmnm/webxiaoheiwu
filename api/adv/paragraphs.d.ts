export interface Para {
    start: number;
    end: number;
}
/** 全文的段，按顺序。 */
export declare function paragraphs(text: string): Para[];
/** pos 落在第几段：段里（含两头）= 这一段；落在分隔中间 = 后一段（光标在两段之间的空行上，算正要写的那一段）。 */
export declare function paraIndexAt(paras: readonly Para[], pos: number): number;
/** 一次改字 = 在 at 处删掉 del 个字、插进 ins（两版文字的公共前缀 / 后缀以外那一截）。没变 = null。 */
export interface Edit {
    at: number;
    del: number;
    ins: string;
}
export declare function diffEdit(before: string, after: string): Edit | null;
