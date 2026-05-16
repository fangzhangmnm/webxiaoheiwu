const NATURAL_CODE_STARTER_MAP = {
  ni: ["你", "呢", "泥"],
  wo: ["我", "握", "窝"],
  ta: ["他", "她", "它"],
  men: ["们", "门", "闷"],
  shi: ["是", "时", "事"],
  zai: ["在", "再", "载"],
  de: ["的", "得", "地"],
  bu: ["不", "步", "部"],
  yi: ["一", "已", "以"],
  zhe: ["这", "者", "着"],
  na: ["那", "哪", "纳"],
  ai: ["爱", "矮", "哎"],
  ma: ["吗", "妈", "马"],
  le: ["了", "乐", "勒"],
  ren: ["人", "仁", "忍"],
  wen: ["文", "问", "闻"],
  xie: ["写", "谢", "鞋"],
  xiaoshuo: ["小说"],
};

const RIME_WORKER_URL = "./src/vendor/my-rime/worker.js";
const NATURAL_CODE_SCHEMA = "double_pinyin";

const PUNCTUATION_KEYS = new Set([
  ",", ".", ";", ":", "?", "!", '"', "'",
  "(", ")", "<", ">", "{", "}", "[", "]",
  "\\", "~", "@", "#", "$", "&", "*", "|",
]);

function isAsciiLetter(event) {
  return /^[a-z]$/i.test(event.key);
}

function isRoutedPunctuation(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }
  return PUNCTUATION_KEYS.has(event.key);
}

function tryParseJsonPayload(payload) {
  if (typeof payload !== "string") {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

class StarterMapBackend {
  constructor() {
    this.buffer = "";
    this.candidates = [];
    this.engine = "starter-map";
  }

  getState() {
    return {
      buffer: this.buffer,
      candidates: this.candidates,
      engine: this.engine,
    };
  }

  resetState() {
    this.buffer = "";
    this.candidates = [];
  }

  async typeLetter(letter) {
    this.buffer += letter;
    this.candidates = NATURAL_CODE_STARTER_MAP[this.buffer] ?? [];
    return { type: "composing" };
  }

  async backspace() {
    if (this.buffer.length === 0) {
      return { type: "passthrough" };
    }

    this.buffer = this.buffer.slice(0, -1);
    this.candidates = this.buffer ? NATURAL_CODE_STARTER_MAP[this.buffer] ?? [] : [];
    return this.buffer ? { type: "composing" } : { type: "clear" };
  }

  async clear() {
    this.resetState();
    return { type: "clear" };
  }

  async chooseCandidate(index) {
    const selected = this.candidates[index];
    if (!selected) {
      return { type: "composing" };
    }

    const consumedBuffer = this.buffer;
    this.resetState();
    return {
      type: "commit",
      text: selected,
      consumedBuffer,
    };
  }

  async commitDefault(withNewline) {
    const selected = this.candidates[0] ?? this.buffer;
    const consumedBuffer = this.buffer;
    this.resetState();

    return {
      type: "commit",
      text: withNewline ? `${selected}\n` : selected,
      consumedBuffer,
    };
  }

  async changePage() {
    return { type: "composing" };
  }

  async typePunctuation() {
    return { type: "passthrough" };
  }
}

class RimeWorkerBackend {
  constructor() {
    this.worker = null;
    this.queue = Promise.resolve();
    this.buffer = "";
    this.candidates = [];
    this.engine = "rime-double_pinyin";
  }

  async initialize() {
    this.worker = new Worker(RIME_WORKER_URL);
    await this.call("setIME", NATURAL_CODE_SCHEMA);
    await this.call("setOption", "simplification", 1);
    await this.call("setOption", "ascii_punct", 0);
  }

  async typePunctuation(key) {
    return this.enqueue(async () => {
      const result = await this.call("process", key);
      return this.normalizeProcessResult(result);
    });
  }

  getState() {
    return {
      buffer: this.buffer,
      candidates: this.candidates,
      engine: this.engine,
    };
  }

  resetState() {
    this.buffer = "";
    this.candidates = [];
  }

  async enqueue(task) {
    this.queue = this.queue.then(task, task);
    return this.queue;
  }

  async call(name, ...args) {
    if (!this.worker) {
      throw new Error("RIME worker is not ready");
    }

    return new Promise((resolve, reject) => {
      const onMessage = (event) => {
        const data = event.data;
        if (!data || (data.type !== "success" && data.type !== "error")) {
          return;
        }

        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onError);

        if (data.type === "error") {
          reject(new Error(data.error?.message ?? "Worker error"));
          return;
        }

        resolve(tryParseJsonPayload(data.result));
      };

      const onError = (event) => {
        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onError);
        reject(new Error(event.message || "Worker runtime error"));
      };

      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", onError);
      this.worker.postMessage({ name, args, transferableIndices: [] });
    });
  }

  normalizeProcessResult(result) {
    if (!result || typeof result !== "object") {
      return { type: "passthrough" };
    }

    if (typeof result.committed === "string") {
      const consumedBuffer = this.buffer;
      this.resetState();
      return {
        type: "commit",
        text: result.committed,
        consumedBuffer,
      };
    }

    if (result.state === 1) {
      this.buffer = result.body ?? "";
      this.candidates = Array.isArray(result.candidates)
        ? result.candidates.map((candidate) => candidate.text ?? "")
        : [];
      return { type: "composing" };
    }

    this.resetState();
    return { type: "clear" };
  }

  async typeLetter(letter) {
    return this.enqueue(async () => {
      const result = await this.call("process", letter);
      return this.normalizeProcessResult(result);
    });
  }

  async backspace() {
    return this.enqueue(async () => {
      const result = await this.call("process", "{BackSpace}");
      return this.normalizeProcessResult(result);
    });
  }

  async clear() {
    return this.enqueue(async () => {
      const result = await this.call("process", "{Escape}");
      return this.normalizeProcessResult(result);
    });
  }

  async chooseCandidate(index) {
    return this.enqueue(async () => {
      const selected = await this.call("selectCandidateOnCurrentPage", index);
      return this.normalizeProcessResult(selected);
    });
  }

  async commitDefault(withNewline) {
    return this.enqueue(async () => {
      const result = await this.call("process", " ");
      const normalized = this.normalizeProcessResult(result);
      if (normalized.type === "commit" && withNewline) {
        return {
          ...normalized,
          text: `${normalized.text}\n`,
        };
      }
      return normalized;
    });
  }

  async changePage(next) {
    return this.enqueue(async () => {
      const result = await this.call("changePage", next);
      return this.normalizeProcessResult(result);
    });
  }
}

export class NaturalCodeIMEAdapter {
  constructor() {
    this.enabled = true;
    this.asciiMode = false;
    this.backend = new StarterMapBackend();
    this.initializeError = null;
  }

  async initialize() {
    const workerBackend = new RimeWorkerBackend();
    try {
      await workerBackend.initialize();
      this.backend = workerBackend;
      this.initializeError = null;
    } catch (error) {
      this.backend = new StarterMapBackend();
      this.initializeError = error instanceof Error ? error.message : "Unknown RIME init error";
    }
  }

  getState() {
    const state = this.backend.getState();
    return {
      enabled: this.enabled,
      asciiMode: this.asciiMode,
      buffer: state.buffer,
      candidates: state.candidates,
      engine: state.engine,
      initializeError: this.initializeError,
    };
  }

  isComposing() {
    const state = this.backend.getState();
    return this.enabled && !this.asciiMode && state.buffer.length > 0;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.backend.resetState();
    }
    return this.getState();
  }

  async toggleAsciiMode() {
    const switchingToAscii = !this.asciiMode;
    const pendingBuffer = this.backend.getState().buffer;
    await this.backend.clear();
    this.asciiMode = switchingToAscii;

    if (switchingToAscii && pendingBuffer) {
      return {
        type: "commit",
        text: pendingBuffer,
        consumedBuffer: pendingBuffer,
        state: this.getState(),
      };
    }
    return { type: "clear", state: this.getState() };
  }

  async onKeydown(event) {
    if (event.ctrlKey && event.code === "Space") {
      event.preventDefault();
      return { type: "toggle", state: this.toggle() };
    }

    if (!this.enabled || this.asciiMode) {
      return { type: "passthrough" };
    }

    if (isAsciiLetter(event)) {
      event.preventDefault();
      const result = await this.backend.typeLetter(event.key.toLowerCase());
      return { ...result, state: this.getState() };
    }

    if (isRoutedPunctuation(event)) {
      const composing = this.isComposing();
      const isPaginator = composing && (event.key === "[" || event.key === "]");
      if (!isPaginator) {
        event.preventDefault();
        const result = await this.backend.typePunctuation(event.key);
        return { ...result, state: this.getState() };
      }
    }

    if (event.key === "Backspace" && this.isComposing()) {
      event.preventDefault();
      const result = await this.backend.backspace();
      return { ...result, state: this.getState() };
    }

    if (event.key === "Escape" && this.isComposing()) {
      event.preventDefault();
      const result = await this.backend.clear();
      return { ...result, state: this.getState() };
    }

    if (/^[1-9]$/.test(event.key) && this.isComposing()) {
      event.preventDefault();
      const result = await this.backend.chooseCandidate(Number(event.key) - 1);
      return { ...result, state: this.getState() };
    }

    if (event.key === " " && this.isComposing()) {
      event.preventDefault();
      const result = await this.backend.commitDefault(false);
      return { ...result, state: this.getState() };
    }

    if (event.key === "Enter" && this.isComposing()) {
      event.preventDefault();
      const result = await this.backend.commitDefault(true);
      return { ...result, state: this.getState() };
    }

    if ((event.key === "PageDown" || event.key === "]" || event.key === "=") && this.isComposing()) {
      event.preventDefault();
      const result = await this.backend.changePage(false);
      return { ...result, state: this.getState() };
    }

    if ((event.key === "PageUp" || event.key === "[" || event.key === "-") && this.isComposing()) {
      event.preventDefault();
      const result = await this.backend.changePage(true);
      return { ...result, state: this.getState() };
    }

    return { type: "passthrough", state: this.getState() };
  }
}
