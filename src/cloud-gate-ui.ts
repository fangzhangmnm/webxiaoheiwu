// cloud-gate-ui.ts —— 闸门的界面：罩 / 闸借 sheets.ts 的 lockSyncGate 那个锁屏位，常驻条 = index.html #offlineBar。created 2026-11-03 by Claude Opus 5.5（家族工单 D；设计稿 §5）
//   锁屏位只有一个（#gateSheet）：库的冲突面来了会顶掉转圈的罩——这是对的（冲突面优先）。靠 sheets.ts 的 gateGeneration 认「现在上面是不是我那张」：不是我的就不关、不抢。
//   v3.0.21（统筹重审裁定四）：问人的面（冲突面、闸门拦下）互相不顶，先来先答（sheets.ts → gate-faces.ts）；收面只收自己的号（withdrawGateFace）。
import { gateGeneration, gateIsUp, lastGateFaceId, lockSyncGate, withdrawGateFace } from "./sheets.ts";
import { t } from "./i18n/index.ts";
import { reportError } from "./error-badge.ts";
import type { BarState, GateReason, GateUi } from "./cloud-gate.ts";

const BAR_REFRESH_MS = 3000;   // 离线时份数会随打字变：条开着才数（库里是一次标量读）

export interface GateUiDeps {
  dirtyCount: () => Promise<number>;
  /** 点条 = 图库的「要处理的」列表（gallery 0.8.8）。 */
  openList: () => void;
  /** 罩 / 闸收掉之后（把焦点还给纸）。 */
  afterRelease: () => void;
}

export function createGateUi(o: GateUiDeps): GateUi {
  // v3.0.21（统筹重审裁定四）：闸门可能同时有好几张面（自己拦下的那张露着、又叫了一张核对的罩）→ 记全部的号，收的时候全收。
  //   以前只记「上一次」那张：核对的罩因为有问人的面没出来，号却记成了它，放行时收的是它、露着的「网盘没连上」没人收（端到端「闸门 ④」抓到）。
  const mine = new Set<number>();
  const ownFace = () => gateIsUp() && mine.has(gateGeneration());
  const withdrawMine = (): void => { for (const id of mine) withdrawGateFace(id); mine.clear(); };

  const bar = document.getElementById("offlineBar") as HTMLButtonElement;
  const barText = bar.querySelector(".offline-bar-text") as HTMLElement;
  let barState: BarState = "hidden";
  let barTimer: ReturnType<typeof setInterval> | null = null;
  async function paintCount(): Promise<void> {
    const n = await o.dirtyCount().catch((e) => { reportError(e, "log"); return 0; });
    if (barState !== "offline") return;   // 数的时候网回来了
    barText.textContent = n > 0 ? t("gate.bar", { n }) : t("gate.barZero");
    bar.dataset.count = String(n);
  }
  bar.addEventListener("click", () => { if (barState === "offline") o.openList(); });

  return {
    checking(onEscape) {
      withdrawMine();   // 进入核对 = 自己上一张（拦下的那张）的问题已经过时：先收回，核对的罩才露得出来
      void lockSyncGate<"skip" | null>({ title: t("gate.checking"), message: "", showSpinner: true, actions: [{ label: t("gate.skipOffline"), value: "skip" }] })
        .then((v) => { if (v === "skip") onEscape(); });
      mine.add(lastGateFaceId());   // v3.0.21：我那张的号（可能露着，也可能因为别人有问人的面根本没出来——那样它的结果已是 null）
    },
    blocked(reason: GateReason, on) {
      const body = reason === "expired" ? t("gate.reasonExpired") : reason === "offline" ? t("gate.reasonOffline") : reason === "content" ? t("gate.reasonContent") : t("gate.reasonNoResponse");
      void lockSyncGate<"signin" | "offline" | null>({
        title: t(reason === "content" ? "gate.titleContent" : "gate.title"), message: body,   // v3.0.21：下载内容失败 ≠「网盘没连上」（云端连得上），标题跟着换
        actions: [{ label: t("gate.signIn"), value: "signin", primary: true }, { label: t("gate.offline"), value: "offline" }],
      }).then((v) => { if (v === "signin") on.signIn(); else if (v === "offline") on.offline(); });
      const old = [...mine]; mine.clear();
      mine.add(lastGateFaceId());   // v3.0.21：前面有问人的面（库的冲突面）时这张排队，先来先答（统筹重审裁定四）
      for (const id of old) withdrawGateFace(id);   // 先叫新的、再收自己的旧罩：自己的罩被新问题顶掉，不闪一下
    },
    release() {
      // v3.0.21：只收自己那张（露着或还在排队都收），别人的面不碰；露着的才把焦点还给纸。
      const shown = ownFace();
      withdrawMine();
      if (shown) o.afterRelease();
    },
    foreignFaceUp: () => gateIsUp() && !mine.has(gateGeneration()),
    bar(state) {
      barState = state;
      if (barTimer) { clearInterval(barTimer); barTimer = null; }
      bar.classList.toggle("hidden", state === "hidden");
      bar.dataset.state = state;
      if (state === "syncing") barText.textContent = t("gate.barSyncing");
      else if (state === "offline") { void paintCount(); barTimer = setInterval(() => { void paintCount(); }, BAR_REFRESH_MS); }
    },
  };
}
