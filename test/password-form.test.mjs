// 口令面板 = 真表单（2026-10-21 user「口令面板改成真表单让 Edge 密码管理器记住 做，全家做」；安全模型 A11 / ADR-0026 凭据管理器那半的 app 侧）。
// 结构守卫：form + type=password + current/new-password + 账号键；永不 autocomplete=off、不禁粘贴、不再用 -webkit-text-security 躲记密码弹窗。created 2026-10-21 by Claude Fable 5.1
import { readFileSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";
const html = readFileSync("index.html", "utf8"), sheets = readFileSync("src/sheets.ts", "utf8"), app = readFileSync("src/app.ts", "utf8");
const tag = (id) => (html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`)) ?? [""])[0];

describe("password-form · 口令面板是真表单，密码管理器能记能填", () => {
  it("sheet 卡是 <form>；确定钮 type=submit；取消钮 type=button", () => {
    assert(/<form[^>]*\bid="sheetCard"/.test(html), "sheetCard 必须是 <form>");
    assert(/type="submit"/.test(tag("sheetConfirm")), "sheetConfirm type=submit"); assert(/type="button"/.test(tag("sheetCancel")), "sheetCancel type=button");
  });
  it("账号键 sheetUser：autocomplete=username、只读、视觉隐藏（sr-only，不是 display:none）；两个口令框没有 autocomplete=off", () => {
    const u = tag("sheetUser"); assert(/autocomplete="username"/.test(u) && /\breadonly\b/.test(u) && /sr-only/.test(u) && !/\shidden[\s>]/.test(u) && !/class="[^"]*\bhidden\b/.test(u), u);   // 不许 hidden 属性 / .hidden（display:none 密码管理器看不见）；aria-hidden 不算
    assert(!/autocomplete="off"/.test(tag("sheetInput")) && !/autocomplete="off"/.test(tag("sheetInput2")), "口令框不许写死 autocomplete=off");
  });
  it("sheets.ts：口令态 type=password + current-password / new-password + 账号键；submit 事件接确定；不再用 -webkit-text-security；不禁粘贴", () => {
    assert(/inp\.type = "password"/.test(sheets) && /"current-password"/.test(sheets) && /"new-password"/.test(sheets), "口令态三件");
    assert(/g\.user\(\)\.value = opts\.account \?\? APP_ID/.test(sheets), "账号键 = app 名");
    assert(/addEventListener\("submit"/.test(sheets) && /requestSubmit/.test(sheets), "submit 事件 + requestSubmit");
    assert(!/setProperty\("-webkit-text-security"/.test(sheets), "打码 hack 已撤"); assert(!/onpaste|"paste"/.test(sheets), "不禁粘贴");
  });
  it("调用侧：设密码 / 换密码走 new-password，解锁走 current-password（默认）", () => {
    assert(/newPassword: o\.confirmField/.test(app), "wireCryptoState 适配：confirmField = 设密码 = new-password");
    assert(/cp\.newTitle[^\n]*newPassword: true/.test(app), "换密码 new-password");
    eq((app.match(/password: true/g) ?? []).length, 2, "口令 sheet 只在这两处开（多出来的要登记）");
  });
});
