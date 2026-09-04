// 主线程 ASR 门面：懒建 worker（URL 来自 index.html <meta name="asr-worker">，build.sh 注入 content-hash），promise RPC + 进度回调。
// 状态/下载/导入/删除/加载/解码/卸载七个动词；worker 内部严格串行。created 2026-09-03 by Claude Fable 5.1
import type { AsrRequest, AsrResponse, PackProgress, PackStatus, LoadResult, DecodeResult, AsrLang } from "./protocol.ts";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: PackProgress) => void };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Req = DistributiveOmit<AsrRequest, "id">;

class AsrEngine {
  private worker: Worker | null = null;
  private knownReady = new Map<string, boolean>();   // 最近一次 status/download/delete 的结论：让 PTT 起录前能**同步**判「有没有包」（没包不碰 getUserMedia）
  private seq = 0;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const url = document.querySelector<HTMLMetaElement>('meta[name="asr-worker"]')?.content;
    if (!url) throw new Error("asr worker url missing (<meta name=asr-worker>)");
    const w = new Worker(url);
    w.onmessage = (e: MessageEvent<AsrResponse>) => {
      const m = e.data; const p = this.pending.get(m.id); if (!p) return;
      if ("progress" in m) { p.onProgress?.(m.progress); return; }
      this.pending.delete(m.id);
      if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error));
    };
    w.onerror = (e) => { const err = new Error(`asr worker crashed: ${e.message || "unknown"}`); for (const p of this.pending.values()) p.reject(err); this.pending.clear(); try { w.terminate(); } catch { /* ignore */ } this.worker = null; };
    this.worker = w;
    return w;
  }
  private call<T>(req: Req, onProgress?: (p: PackProgress) => void, transfer?: Transferable[]): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      try { this.ensureWorker().postMessage({ ...req, id }, transfer ?? []); }
      catch (e) { this.pending.delete(id); reject(e instanceof Error ? e : new Error(String(e))); }
    });
  }

  isKnownReady(slug: string): boolean | undefined { return this.knownReady.get(slug); }
  private note(st: PackStatus): PackStatus { this.knownReady.set(st.slug, st.ready); return st; }
  status(slug: string): Promise<PackStatus> { return this.call<PackStatus>({ op: "status", slug }).then((st) => this.note(st)); }
  download(slug: string, base: string, onProgress?: (p: PackProgress) => void): Promise<PackStatus> { return this.call<PackStatus>({ op: "download", slug, base }, onProgress).then((st) => this.note(st)); }
  importFiles(slug: string, files: File[], onProgress?: (p: PackProgress) => void): Promise<PackStatus> { return this.call<PackStatus>({ op: "import", slug, files }, onProgress).then((st) => this.note(st)); }
  delete(slug: string): Promise<void> { return this.call<void>({ op: "delete", slug }).then(() => { this.knownReady.set(slug, false); }); }
  load(slug: string, lang: AsrLang): Promise<LoadResult> { return this.call({ op: "load", slug, lang }); }
  decode(samples: Float32Array, lang: AsrLang): Promise<DecodeResult> { return this.call({ op: "decode", samples, lang }, undefined, [samples.buffer]); }
  unload(): Promise<void> { return this.call({ op: "unload" }); }
}

export const asr = new AsrEngine();
