// 加密稿学到的词只进内存（家族规则书 §1 第 5 条；Fable 11-03 裁定）：垫片 vendor/my-rime/worker-guard.js 的逻辑 + 接线守卫。created 2026-11-03 by Claude Opus 5.5（家族工单 D2）
//   真 RIME 的整条链在 test/e2e-sync/run.mjs「词库」那两组。
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it, assert, eq } from "./runner.mjs";

function loadGuard() {
  const posted = [], syncs = [], upstreamGot = [];
  const FS = { syncfs(populate, cb) { syncs.push(populate); cb(null); } };
  const self = { Module: { FS }, postMessage: (m) => posted.push(m), onmessage: null };
  const ctx = { self, importScripts: () => { self.onmessage = (e) => upstreamGot.push(e.data.name); }, Promise, String };
  vm.createContext(ctx);
  vm.runInContext(readFileSync("vendor/my-rime/worker-guard.js", "utf8"), ctx);
  const send = async (name, ...args) => { self.onmessage({ data: { name, args } }); await new Promise((r) => setTimeout(r, 0)); };
  return { FS, posted, syncs, upstreamGot, send };
}

describe("worker-guard · 只进内存的开关", () => {
  it("别的消息原样交给上游", async () => {
    const g = loadGuard();
    await g.send("process", "a");
    eq(g.upstreamGot.join(), "process"); eq(g.posted.length, 0);
  });
  it("打开：先把之前学到的落盘一次，之后写回变空操作、回调照走", async () => {
    const g = loadGuard();
    await g.send("setMemoryOnly", true);
    eq(g.syncs.join(), "false", "打开那一下落盘一次"); eq(g.posted[0].type, "success");
    let called = false;
    g.FS.syncfs(false, () => { called = true; });
    eq(g.syncs.length, 1, "写回没发生"); assert(called, "回调要走，不然上游的 await 卡死");
  });
  it("开着时读不受影响", async () => {
    const g = loadGuard();
    await g.send("setMemoryOnly", true);
    g.FS.syncfs(true, () => {});
    eq(g.syncs.join(), "false,true");
  });
  it("关掉：写回恢复；关的那一下不写（内存层要先丢，归主线程）", async () => {
    const g = loadGuard();
    await g.send("setMemoryOnly", true);
    await g.send("setMemoryOnly", false);
    eq(g.syncs.length, 1, "关的时候不写");
    g.FS.syncfs(false, () => {});
    eq(g.syncs.length, 2, "写回恢复");
  });
  it("重复打开不重复落盘（第二次已经在内存层，写了就漏了）", async () => {
    const g = loadGuard();
    await g.send("setMemoryOnly", true);
    await g.send("setMemoryOnly", true);
    eq(g.syncs.length, 1);
  });
});

describe("接线", () => {
  const ime = readFileSync("src/ime.ts", "utf8"), app = readFileSync("src/app.ts", "utf8"), sw = readFileSync("service-worker.js", "utf8");
  it("worker 从垫片进（上游文件一字不动）；垫片进离线壳", () => {
    assert(/RIME_WORKER_URL = "\.\/vendor\/my-rime\/worker-guard\.js"/.test(ime));
    assert(sw.includes('"./vendor/my-rime/worker-guard.js"'));
  });
  it("丢内存层：重开（关老库）→ 换文件 → 重开 → 才恢复写回（顺序不能反：老库的句柄会把挂着的词写回来）", () => {
    const m = /private async leaveEphemeral\(\): Promise<void> \{([\s\S]*?)\n  \}/.exec(ime);
    assert(m, "找得到 leaveEphemeral");
    const a = m[1].indexOf("reopenEngine"), b = m[1].indexOf("replaceUserFiles"), c = m[1].indexOf("reopenEngine", b), d = m[1].indexOf('"setMemoryOnly", false');
    assert(a >= 0 && a < b && b < c && c < d, "顺序");
  });
  it("推词库、拉词库都看开关；开着加密稿不许出门", () => {
    const push = /async function pushUserDict\(\)[\s\S]*?\n\}/.exec(app)?.[0] ?? "", pull = /async function pullUserDict\(\)[\s\S]*?\n\}/.exec(app)?.[0] ?? "";
    assert(/ime\.memoryOnly\) return;/.test(push), "推之前看"); assert((push.match(/ime\.memoryOnly/g) ?? []).length >= 2, "导完再看一次（导的时候可能刚开了加密稿）");
    assert(/ime\.memoryOnly\) return;/.test(pull), "拉之前看");
  });
  it("加密词库的接线（D3）：开稿灌、关稿先拿最后一眼、丢口令前先封、输入法后起也灌", () => {
    const sync = /function syncImeMemoryOnly\(\): void \{[\s\S]*?\n\}/.exec(app)?.[0] ?? "";
    assert(/encDict\.ensureLoaded\(\)/.test(sync), "开着加密稿就灌");
    assert(/encDict\.leave\(done\)/.test(sync) && /ime\.setMemoryOnly\(on, !on && encDict\.loaded\(\)\)/.test(sync), "关稿用丢内存层之前最后一眼");
    assert(/await encDict\.sealNow\(true\);[^\n]*\n(?:[^\n]*\n)?\s*(?:const wasRemembered[^\n]*\n\s*)?cryptoLock\(\);/.test(app), "锁定：先封再丢口令");
    assert(/await encDict\.sealNow\(true\);[^\n]*\n\s*try \{ await flushCollections\(\); cryptoLock\(\);/.test(app), "登出：先封再丢口令");
    assert(/syncImeMemoryOnly\(\);[^\n]*\n\s*await pullUserDict\(\);/.test(app), "输入法后起来：再看一次");
    assert(/else void encDict\.onLocked\(\)/.test(app), "锁定：灌进去的丢掉");
    assert(/collection: rimeEncDict/.test(app) && /rime-enc-dict/.test(readFileSync("src/config.ts", "utf8")), "走自己的 collection，不和明文词库混");
  });
  it("出门规则（F-181）：加密副本取容器字节、不解密；明文下载前明说；不走「解除加密」", () => {
    const flow = /async function exportSealedCopyFlow\(\)[\s\S]*?\n\}/.exec(app)?.[0] ?? "";
    assert(/sealedBlobOf\(name\)/.test(flow) && !/decryptDoc|toggleEncryption|unpackContainer|\.open\(\)/.test(flow), "容器字节原样出门");
    assert(/!opts\.sealed && activeEncrypted\(\)\) message \+= /.test(app), "offerFiles 一处管明说（长图 / PDF / TXT 都过它）");
    assert(/value: "sealed" as const, primary: true/.test(app) && /primary: !enc/.test(app), "加密稿的默认是加密副本");
    assert(/getEncryptedBlob\(\)/.test(readFileSync("src/docs.ts", "utf8")), "docs.ts 走库发的容器字节");
  });
  it("状态变化都过 syncImeMemoryOnly（renderTopbar 第一句）", () => {
    assert(/function renderTopbar\(\): void \{\n  syncImeMemoryOnly\(\);/.test(app));
  });
});

describe("先封再存 · 结构守卫（Fable 11-03 裁定：IndexedDB 里一刻明文都不留）", () => {
  const rescue = readFileSync("src/rescue.ts", "utf8"), editor = readFileSync("src/editor.ts", "utf8"), app = readFileSync("src/app.ts", "utf8");
  it("新建 / 留底 / 拆新书都不走「先存明文再 encryptDoc」", () => {
    assert(!/encryptDoc/.test(rescue), "rescue.ts 不再先存后封");
    assert(/createDoc\(st\.pendingTitle \?\? "", text, st\.pendingDate, st\.pendingDir, \{ encrypted: st\.encrypted \}\)/.test(editor), "新建加密稿");
    assert(!/project\.toggleEncryption\(\(\) => Promise\.resolve\(false\), withBusy\)/.test(app), "拆新书 / 新书勾加密不再先建明文再封");
    assert(/\{ encrypted: wasEncrypted \}/.test(app) && /\{ encrypted: wantEncrypt \}/.test(app) && /\{ encrypted: sealIt \}/.test(app), "三处都传");
  });
  it("封不上就不写：docs.ts 没口令直接抛", () => {
    const docs = readFileSync("src/docs.ts", "utf8");
    assert(/if \(!password\) throw new Error/.test(docs));
    assert(/opts\.encrypted \? await sealForNewDoc\(cand, plain\) : plain/.test(docs) && /opts\.encrypted \? await sealForNewDoc\(cand, blob\) : blob/.test(docs));
  });
});
