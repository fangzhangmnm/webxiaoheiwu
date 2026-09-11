// z-index 只准在 :root band 表里出现数字（抄 WeebPaint；user 2026-09-10「z order 的问题系统解决一下」）。局部 ≤3 的层内小序放行。created 2026-09-10 by Claude Fable 5.1
import { describe, it, eq } from "./runner.mjs";
import { readFileSync } from "node:fs";
describe("styles · z-index 只在 :root 表", () => {
  it("styles.css 里所有 z-index 都是 var(--z-*) / calc(var(--z-*)…)，或 ≤3 的局部小序", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const bad = [...css.matchAll(/z-index:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => !/^(calc\()?var\(--z-/.test(v) && !/^[0-3]$/.test(v));
    eq(bad.length, 0, "numeric z-index outside the :root band table: " + bad.join(", "));
    for (const k of ["--z-page", "--z-chrome", "--z-overlay", "--z-drawer", "--z-menu", "--z-toast", "--z-modal", "--z-ime", "--z-error"]) eq(css.includes(k + ":"), true, k + " missing from :root");
  });
});
