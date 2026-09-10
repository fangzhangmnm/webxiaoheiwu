// 无地骑士（Editor Only）：没有库也能开/写工程 zip。created 2026-09-10 by Claude Fable 5.1。
//   · 有 File System Access（Chromium / Quest）：句柄写回原文件；
//   · 没有（iPad Safari）：读走 <input type=file>，写 = 下载一份（用户自己放回去）。
// 这里不碰 store、不碰 IDB：本机文件的正本在磁盘，会话只在内存（ADR-0008 §9 无地从 day 1）。
export interface LocalHome {
  readonly fileName: string;
  readonly canWriteBack: boolean;
  read(): Promise<Blob | null>;
  write(blob: Blob): Promise<"written" | "downloaded">;
}
type FsaWindow = Window & { showOpenFilePicker?: (o?: unknown) => Promise<FileSystemFileHandle[]> };
export const hasFsa = (): boolean => typeof (globalThis as unknown as FsaWindow).showOpenFilePicker === "function";

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function homeFromHandle(handle: FileSystemFileHandle): LocalHome {
  return {
    fileName: handle.name, canWriteBack: true,
    read: async () => { try { return await handle.getFile(); } catch { return null; } },
    write: async (blob) => { const w = await handle.createWritable(); await w.write(blob); await w.close(); return "written"; },
  };
}
function homeFromFile(file: File): LocalHome {
  return { fileName: file.name, canWriteBack: false, read: async () => file, write: async (blob) => { triggerDownload(blob, file.name); return "downloaded"; } };
}
/** 挑一个本机 `.webxiaoheiwu.zip`。取消 → null。 */
export async function pickLocalProject(accept = ".zip"): Promise<LocalHome | null> {
  const w = globalThis as unknown as FsaWindow;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ multiple: false, types: [{ description: "webxiaoheiwu project", accept: { "application/zip": [accept] } }] });
      return h ? homeFromHandle(h) : null;
    } catch { return null; }   // AbortError = 取消
  }
  return new Promise((resolve) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = accept; input.style.display = "none";
    input.addEventListener("change", () => { const f = input.files?.[0]; input.remove(); resolve(f ? homeFromFile(f) : null); });
    input.addEventListener("cancel", () => { input.remove(); resolve(null); });
    document.body.appendChild(input); input.click();
  });
}
