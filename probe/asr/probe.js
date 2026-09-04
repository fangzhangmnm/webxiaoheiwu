// probe/asr/probe.js —— 离线 ASR 探针（WASM sherpa-onnx + 分片模型包）。一页答四个数：模型加载秒数 / wasm 堆 / 5s 音频耗时(RTF) / 识别文本。
// 数据流 = 生产形态的原型：fetch 分片流式读 → 边读边 SHA-256 边填按文件预分配的 buffer → createDataFile(canOwn) 零拷贝挂 MEMFS → 建识别器 → unlink 模型文件。
// dev 工具，不进产品 bundle；UI 文案不走 i18n。?auto=<slug>&base=<url>&wav=<name> 无人值守跑 → console 打 PROBE_RESULT {json}。
// created 2026-09-03 by Claude Fable 5.1
import { Sha256 } from "./sha256.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEFAULT_BASE = "https://fangzhangmnm.github.io/pwa-models";
const WASM_DIR = new URL("../../vendor/sherpa-onnx-wasm/", location.href).href;
const st = { Module: null, rec: null, kind: null, slug: null, report: {} };
const now = () => performance.now();
const mb = (n) => (n / 1048576).toFixed(0);

function log(s) {
  const el = $("log"); el.value += s + "\n"; el.scrollTop = el.scrollHeight; console.log(s);
}
function status(s) { $("status").textContent = s; }
function mem() {
  const m = performance.memory;
  return {
    wasmHeapMB: st.Module ? +mb(st.Module.HEAPU8.length) : null,
    jsHeapMB: m ? +mb(m.usedJSHeapSize) : null,
    jsHeapLimitMB: m ? +mb(m.jsHeapSizeLimit) : null,
  };
}
function env() {
  return { ua: navigator.userAgent, deviceMemoryGB: navigator.deviceMemory ?? null, cores: navigator.hardwareConcurrency ?? null, simd: typeof WebAssembly.validate === "function" && WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])) };
}

async function loadWasm() {
  if (st.Module) return st.Module;
  status("加载 wasm…"); const t0 = now();
  const Module = await SherpaOnnx({
    locateFile: (p) => WASM_DIR + p,
    print: (s) => console.log("[sherpa]", s),
    printErr: (s) => console.warn("[sherpa]", s),
  });
  st.Module = Module;
  st.report.wasmLoadMs = Math.round(now() - t0);
  log(`wasm ready in ${st.report.wasmLoadMs} ms; wasm heap ${mb(Module.HEAPU8.length)} MB`);
  return Module;
}

/** fetch 分片（流式读）→ 边读边 sha256 边填进按文件预分配的 buffer → 校验通过后 FS.createDataFile(canOwn=true) 零拷贝挂进 MEMFS。
 *  JS 侧峰值 = 各文件 buffer 之和（= 包体积）+ 一次 reader.read() 的小块；没有「拼大 buffer」也没有 MEMFS 扩容拷贝。 */
async function fetchPack(base, slug) {
  const Module = await loadWasm(); const FS = Module.FS;
  status(`拉 manifest…`);
  const mf = await (await fetch(`${base}/packs/${slug}/manifest.json`, { cache: "no-store" })).json();
  const dir = `/packs/${slug}`;
  try { FS.mkdir("/packs"); } catch {}
  try { FS.mkdir(dir); } catch {}
  const bufs = mf.files.map((f) => new Uint8Array(f.bytes));
  let offset = 0, fetchMs = 0, hashMs = 0; const t0 = now();
  for (const c of mf.chunks) {
    status(`下载 ${c.name} (${mb(offset)}/${mb(mf.totalBytes)} MB)…`);
    const tFetch = now();
    const res = await fetch(`${base}/packs/${slug}/${c.name}`);
    if (!res.ok || !res.body) throw new Error(`fetch ${c.name}: HTTP ${res.status}`);
    const reader = res.body.getReader(); const sha = new Sha256(); let got = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      const tHash = now(); sha.update(value); hashMs += now() - tHash;
      let pos = 0;
      while (pos < value.length) {
        const abs = offset + got + pos;
        const fi = mf.files.findIndex((f) => abs >= f.offset && abs < f.offset + f.bytes);
        if (fi < 0) throw new Error(`chunk ${c.name} overflows manifest (abs ${abs})`);
        const f = mf.files[fi], n = Math.min(f.offset + f.bytes - abs, value.length - pos);
        bufs[fi].set(value.subarray(pos, pos + n), abs - f.offset); pos += n;
      }
      got += value.length; $("bar").value = (offset + got) / mf.totalBytes;
    }
    fetchMs += now() - tFetch - 0;
    if (got !== c.bytes) throw new Error(`chunk ${c.name}: got ${got} bytes, expected ${c.bytes}`);
    const tHash = now(); const h = sha.hex(); hashMs += now() - tHash;
    if (h !== c.sha256) throw new Error(`sha256 mismatch on ${c.name}: got ${h.slice(0, 12)}… expected ${c.sha256.slice(0, 12)}…`);
    offset += got;
  }
  if (offset !== mf.totalBytes) throw new Error(`size mismatch: ${offset} != ${mf.totalBytes}`);
  const tMount = now();
  mf.files.forEach((f, i) => FS.createDataFile(dir, f.path, bufs[i], true, true, true));
  const writeMs = now() - tMount;
  Object.assign(st.report, { packMB: +mb(mf.totalBytes), packFetchMs: Math.round(fetchMs - hashMs), packHashMs: Math.round(hashMs), packWriteMs: Math.round(writeMs), packTotalMs: Math.round(now() - t0) });
  log(`pack ${slug}: ${mb(mf.totalBytes)} MB in ${Math.round(now() - t0)} ms (fetch ${Math.round(fetchMs - hashMs)} / sha256 ${Math.round(hashMs)} / mount ${Math.round(writeMs)})`);
  return { mf, dir };
}

function createRecognizer(mf, dir, lang) {
  const Module = st.Module;
  const cfg = JSON.parse(JSON.stringify(mf.engineConfig));
  const mc = cfg.modelConfig;
  for (const k of Object.keys(mc)) {
    const v = mc[k];
    if (v && typeof v === "object") for (const kk of Object.keys(v)) if (typeof v[kk] === "string" && v[kk] && kk !== "language") v[kk] = `${dir}/${v[kk]}`;
  }
  mc.tokens = `${dir}/${mc.tokens}`;
  if (mc.senseVoice && lang) mc.senseVoice.language = lang;
  const kind = cfg.type; delete cfg.type;
  status("建识别器（ORT session）…"); const before = mem(); const t0 = now();
  const rec = kind === "online" ? createOnlineRecognizer(Module, cfg) : new OfflineRecognizer(cfg, Module);
  if (!rec.handle) throw new Error("recognizer handle is null (model load failed; see console)");
  st.report.createMs = Math.round(now() - t0); st.report.memBeforeCreate = before; st.report.memAfterCreate = mem();
  // 模型已进 ORT session；MEMFS 那份释放（生产也这么干）。
  const FS = Module.FS;
  for (const f of mf.files) { try { FS.unlink(`${dir}/${f.path}`); } catch {} }
  st.report.memAfterUnlink = mem();
  st.rec = rec; st.kind = kind; st.slug = mf.slug;
  log(`recognizer (${kind}) created in ${st.report.createMs} ms; wasm heap ${st.report.memAfterCreate.wasmHeapMB} MB, js heap ${st.report.memAfterCreate.jsHeapMB ?? "?"} MB`);
  return rec;
}

/** @param {Float32Array} samples 16 kHz mono */
function decode(samples) {
  const rec = st.rec, t0 = now(); let text;
  if (st.kind === "offline") {
    const s = rec.createStream(); s.acceptWaveform(16000, samples); rec.decode(s); text = rec.getResult(s).text; s.free();
  } else {
    const s = rec.createStream(); const step = 1600; // 0.1 s 一片，模拟流式
    for (let i = 0; i < samples.length; i += step) { s.acceptWaveform(16000, samples.subarray(i, Math.min(i + step, samples.length))); while (rec.isReady(s)) rec.decode(s); }
    s.acceptWaveform(16000, new Float32Array(8000)); s.inputFinished(); while (rec.isReady(s)) rec.decode(s);
    text = rec.getResult(s).text; s.free();
  }
  const ms = now() - t0, audioMs = samples.length / 16;
  return { text, ms: Math.round(ms), audioMs: Math.round(audioMs), rtf: +(ms / audioMs).toFixed(3) };
}

function parseWav(ab) {
  const dv = new DataView(ab); let p = 12, rate = 16000, ch = 1, bits = 16, data = null;
  while (p + 8 <= dv.byteLength) {
    const id = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3)); const sz = dv.getUint32(p + 4, true);
    if (id === "fmt ") { ch = dv.getUint16(p + 10, true); rate = dv.getUint32(p + 12, true); bits = dv.getUint16(p + 22, true); }
    if (id === "data") { data = new Int16Array(ab, p + 8, sz / 2); break; }
    p += 8 + sz + (sz & 1);
  }
  if (!data || bits !== 16) throw new Error("wav: need 16-bit PCM");
  const mono = new Float32Array(data.length / ch);
  for (let i = 0; i < mono.length; i++) mono[i] = data[i * ch] / 32768;
  return resample(mono, rate, 16000);
}
function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.round(x.length * to / from), y = new Float32Array(n), r = from / to;
  for (let i = 0; i < n; i++) { const s = i * r, j = Math.floor(s), t = s - j; y[i] = x[j] * (1 - t) + (x[Math.min(j + 1, x.length - 1)] || 0) * t; }
  return y;
}

async function runWav(name) {
  const ab = await (await fetch(`./wav/${name}.wav`)).arrayBuffer();
  const samples = parseWav(ab);
  status(`识别 ${name}.wav（${(samples.length / 16000).toFixed(1)} s）…`);
  const r = decode(samples);
  log(`[${name}.wav] ${r.audioMs} ms audio → ${r.ms} ms compute, RTF ${r.rtf}\n  → ${r.text}`);
  (st.report.wav ??= {})[name] = r;
  st.report.memAfterDecode = mem();
  status("完成");
  return r;
}

async function recordMic(seconds) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1); const chunks = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc); proc.connect(ctx.destination);
  for (let i = seconds; i > 0; i--) { status(`录音中… ${i}`); await new Promise((r) => setTimeout(r, 1000)); }
  proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop());
  const rate = ctx.sampleRate; await ctx.close();
  const n = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(n); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return { samples: resample(all, rate, 16000), rate };
}

async function runMic() {
  if (!st.rec) { log("先加载一个模型"); return; }
  try {
    const { samples, rate } = await recordMic(5);
    status("识别麦克风…");
    const r = decode(samples);
    log(`[mic ${rate} Hz→16k, ${r.audioMs} ms] ${r.ms} ms compute, RTF ${r.rtf}\n  → ${r.text || "(空)"}`);
    (st.report.mic ??= []).push(r); status("完成");
  } catch (e) { log(`mic error: ${e.message}`); status("麦克风失败"); }
}

async function loadModel(slug) {
  const base = $("base").value.replace(/\/+$/, "");
  const lang = $("lang").value.trim();
  try {
    if (st.rec) { st.rec.free(); st.rec = null; log("(freed previous recognizer; wasm heap does not shrink — reload page for a clean number)"); }
    st.report = { slug, base, lang, env: env(), startedAt: new Date().toISOString() };
    const { mf, dir } = await fetchPack(base, slug);
    createRecognizer(mf, dir, lang);
    $("wavs").hidden = false; $("mic").hidden = false; status(`就绪：${mf.name}`);
    render();
  } catch (e) { log(`ERROR: ${e.message}`); status("失败：" + e.message); st.report.error = String(e.message); render(); throw e; }
}

function render() {
  const r = st.report, m = r.memAfterDecode || r.memAfterUnlink || r.memAfterCreate || {};
  $("nums").textContent = [
    `模型 ${r.slug ?? "-"}  ${r.packMB ?? "-"} MB`,
    `下载 ${r.packTotalMs ?? "-"} ms（fetch ${r.packFetchMs ?? "-"} / sha256 ${r.packHashMs ?? "-"} / 写 FS ${r.packWriteMs ?? "-"}）`,
    `建识别器 ${r.createMs ?? "-"} ms`,
    `wasm 堆 ${m.wasmHeapMB ?? "-"} MB · JS 堆 ${m.jsHeapMB ?? "?"} MB · 设备内存 ${r.env?.deviceMemoryGB ?? "?"} GB · 核 ${r.env?.cores ?? "?"}`,
    ...Object.entries(r.wav ?? {}).map(([k, v]) => `${k}.wav: ${v.ms} ms / ${v.audioMs} ms 音频 = RTF ${v.rtf}`),
    ...(r.mic ?? []).map((v, i) => `mic#${i + 1}: ${v.ms} ms / ${v.audioMs} ms = RTF ${v.rtf}`),
  ].join("\n");
}

function wire() {
  $("base").value = params.get("base") || DEFAULT_BASE;
  $("lang").value = params.get("lang") ?? "zh";
  document.querySelectorAll("[data-slug]").forEach((b) => b.addEventListener("click", () => loadModel(b.dataset.slug)));
  $("loadCustom").addEventListener("click", () => loadModel($("slug").value.trim()));
  document.querySelectorAll("[data-wav]").forEach((b) => b.addEventListener("click", async () => { try { await runWav(b.dataset.wav); render(); } catch (e) { log("ERROR: " + e.message); } }));
  $("mic").addEventListener("click", async () => { await runMic(); render(); });
  $("copy").addEventListener("click", async () => {
    const txt = $("log").value + "\n---\n" + JSON.stringify({ ...st.report, ua: undefined }, null, 1);
    try { await navigator.clipboard.writeText(txt); status("已复制"); } catch { $("log").select(); status("复制失败——已全选，手动复制"); }
  });
  log(`env: ${JSON.stringify(env())}`);
}

wire();
const auto = params.get("auto");
if (auto) (async () => {
  try {
    await loadModel(auto);
    await runWav(params.get("wav") || "zh");
    render();
    window.__probeResult = st.report; console.log("PROBE_RESULT " + JSON.stringify(st.report));
  } catch (e) { window.__probeError = String(e?.message || e); console.log("PROBE_RESULT " + JSON.stringify({ ...st.report, error: window.__probeError })); }
})();
