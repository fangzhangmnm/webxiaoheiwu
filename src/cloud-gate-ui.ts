// cloud-gate-ui.ts —— 闸门的界面：罩 / 闸借 sheets.ts 的 lockSyncGate 那个锁屏位，常驻条 = index.html #offlineBar。created 2026-11-03 by Claude Opus 5.5（家族工单 D；设计稿 §5）
//   锁屏位只有一个（#gateSheet）：库的冲突面来了会盖掉罩——这是对的（冲突面优先）。靠 sheets.ts 的 gateGeneration 认「现在上面是不是我那张」：不是我的就不关、不抢。
import { gateGeneration, gateIsUp, lockSyncGate, unlockSyncGate } from "./sheets.ts";
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
  let mine = -1;   // 我上一次占锁屏位时的代号
  const ownFace = () => gateIsUp() && gateGeneration() === mine;

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
      void lockSyncGate<"skip" | null>({ title: t("gate.checking"), message: "", showSpinner: true, actions: [{ label: t("gate.skipOffline"), value: "skip" }] })
        .then((v) => { if (v === "skip") onEscape(); });
      mine = gateGeneration();
    },
    blocked(reason: GateReason, on) {
      const body = reason === "expired" ? t("gate.reasonExpired") : reason === "offline" ? t("gate.reasonOffline") : t("gate.reasonNoResponse");
      void lockSyncGate<"signin" | "offline" | null>({
        title: t("gate.title"), message: body,
        actions: [{ label: t("gate.signIn"), value: "signin", primary: true }, { label: t("gate.offline"), value: "offline" }],
      }).then((v) => { if (v === "signin") on.signIn(); else if (v === "offline") on.offline(); });
      mine = gateGeneration();
    },
    release() {
      if (!ownFace()) return;
      unlockSyncGate();
      o.afterRelease();
    },
    foreignFaceUp: () => gateIsUp() && gateGeneration() !== mine,
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
