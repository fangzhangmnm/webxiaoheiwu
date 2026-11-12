/** 字离开 app（黑匣子 / 横幅）之前过一遍。只删不加：结果永远不比原文长出地址或密钥。 */
export declare function redactForEgress(text: string): string;
/** CSP 拦截记录用：被拦的东西只记来源（协议 + 主机）；不是地址的关键字（inline / eval / data / blob）照原样记那个词。 */
export declare function originOnly(uri: string): string;
