// 冻结样本语料（家族格式版本纪律 §3）：每个目录 = 一本样书 + 本版读取器当时读到的 expect.json。只读；重冻先删目录再跑 tools/freeze-format-sample.mjs。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("./", import.meta.url));
export function listFixtures() { return fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory()).sort(); }
export function readFixture(dir) {
  const d = path.join(ROOT, dir);
  return { blob: new Blob([fs.readFileSync(path.join(d, "sample.webxiaoheiwu.zip"))]), expect: JSON.parse(fs.readFileSync(path.join(d, "expect.json"), "utf8")) };
}
