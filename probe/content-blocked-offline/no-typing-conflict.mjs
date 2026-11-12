// 施工单第 5 条（只查不改）的复现探针。created 2026-11-12 by Claude Opus 5.5（小黑屋维修线小弟；统筹 Claude Fable 5.2 重审裁定六）
//   问题：11-12 办公室那台机器上，下载文件内容一直失败、进门检查超时、16:01:21 选了「离线继续」之后，user 没写字，
//   为什么还会弹「在你编辑期间被别的设备改过」（推送那张冲突面）、之后又有「还有 1 份…」？
//   读代码的结论（施工单页末施工记录有全文）：离线时编辑器 / 书的 pushNow 只落本地，但**无条件**把 pushPending 立成 true
//   （editor.ts pushNow 的 isOffline 分支、project/mode.ts pushNow 的 isOffline 分支）——切后台（visibilitychange → pushNowAny）、
//   闲置锁屏、按保存钮都会走到。网一「通」（离线态每 60 s 静默再试：续签 + 问一次云端元数据——下载被拦不影响它）→ resumeSync：
//   快进下载失败、本机还是旧的那份 → pushNowAny 看到 pushPending → 把没改过的旧字节推上去（书：重新打包、重新封一遍）→ 网盘比它新 → 412
//   → 自愈那一拉下载不下来 → 弹冲突面。人取消 = 这一篇从此「待传」。
//   这里在真 app（测试台的假云 + 只拦下载内容的开关）里走一遍，**一个字都不打**，看会不会弹面。
//   用法：在被测的仓目录里 node probe/content-blocked-offline/no-typing-conflict.mjs
//   结果：弹面 = 复现（退出码 1）；没弹 = 没复现（退出码 0）。不进 npm test / e2e:sync（那条毛病还没修，统筹定修法）。
const ROOT = process.cwd();
const { buildBundle, startServer, createWorld, makeChecker } = await import(ROOT + "/test/e2e-sync/harness.mjs");
const { check, failed } = makeChecker();
await buildBundle();
const server = await startServer();
const w = await createWorld();
try {
  const A = await w.device("A"), B = await w.device("B");
  await A.boot(server.url); await A.type("原文。"); await A.wait(500); await A.pushNow(); await A.wait(300);
  const name = await A.eval(() => window.__xhw.editor.state.name);
  await B.boot(server.url); await B.wait(600);
  await B.eval((n) => window.__xhw.openAny(n), name); await B.wait(800);
  check("B 开着同一篇、干净", (await B.text()) === "原文。" && (await B.eval(() => window.__xhw.store().files.dirty.count())) === 0, await B.text());
  await A.type("A改了。"); await A.wait(500); await A.pushNow(); await A.wait(300);   // 别的设备改了：网盘比 B 新
  // B：云端调用挂着重开 → 进门检查 8 s 没回应 → 闸 → 点「离线继续」（11-12 16:01:21 那一下）
  await B.setGate({ hangCloud: true }, false);
  await B.bootRaw(server.url);
  await B.page.waitForFunction(() => window.__xhw?.gate?.phase() === "blocked", null, { timeout: 20000 });
  await B.clickGate("离线继续"); await B.wait(300);
  check("选了离线", await B.eval(() => !window.__xhw.cloudOnline()), "");
  await B.eval(() => { window.__e2eGate = { ...(window.__e2eGate ?? {}), hangCloud: false }; window.__e2eContentBlocked = true; });   // 云端答话了，只有下载内容被拦（同那天）
  // 一个字都不打。只切一次后台（visibilitychange → flushLocalAny → pushNowAny）
  await B.hide(); await B.wait(400);
  const whileHidden = { dirty: await B.eval(() => window.__xhw.store().files.dirty.count()), online: await B.eval(() => window.__xhw.cloudOnline()) };
  console.log(`  藏在后台时（还没回前台）：库里待传=${whileHidden.dirty} 还离线=${!whileHidden.online}`);
  check("藏在后台时：库里没有待传（什么都没改）", whileHidden.dirty === 0, `待传 = ${whileHidden.dirty}：离线时那一下 pushNow 把没改的字又存了一遍`);
  await B.show(); await B.wait(400);   // 回前台：闸门 wake → 选了离线 ∧ 浏览器说有网 → 立刻静默重连一次（不用等 60 s）
  const afterHide = { sheet: await B.gateShown(), dirty: await B.eval(() => window.__xhw.store().files.dirty.count()) };
  console.log(`  切一次后台之后：面=${afterHide.sheet} 库里待传=${afterHide.dirty}`);
  check("切一次后台之后：还没弹面", !afterHide.sheet, "");
  check("切一次后台之后：库里也没有待传（什么都没改）", afterHide.dirty === 0, `待传 = ${afterHide.dirty}（离线时那一下 pushNow 把没改的字又存了一遍 = 标脏）`);
  // 离线态的静默再试（每 60 s 一次）：续签 + 问一次云端元数据——下载被拦不影响 → 「连上了」→ resumeSync
  await B.eval(() => window.__xhw.gate.reconnect());
  let sheet = null;
  for (let t0 = Date.now(); Date.now() - t0 < 8000; ) {
    sheet = await B.eval(() => (document.getElementById("gateSheet").classList.contains("hidden") ? null : document.getElementById("gateMessage").textContent));
    if (sheet) break;
    await B.wait(100);
  }
  console.log(`  B 的正文：${JSON.stringify(await B.text())}（一个字没打）`);
  console.log(`  弹出来的面：${sheet ? JSON.stringify(sheet) : "（没有）"}`);
  check("一个字没打，不该弹「在你编辑期间被别的设备改过」", sheet == null, `复现了：${sheet}`);
  if (sheet) {
    await B.resolveGate(/取消/); await B.wait(500);
    console.log(`  取消之后库里待传 = ${await B.eval(() => window.__xhw.store().files.dirty.count())}（「还有 1 份…」的来路）`);
  }
  await A.close(); await B.close();
} finally {
  await w.close?.();
  server.close?.();
}
process.exit(failed() ? 1 : 0);
