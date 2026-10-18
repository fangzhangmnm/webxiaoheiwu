# ADR-0017 这台设备可以记住当前密码（opt-in、≤ 30 天、锁定即忘）
> created 20261017 · by Claude Opus 5.5 (claude-opus-5-5) · status: **accepted**（user 2026-10-17「口令记忆功能，类似kudsrocket，这个是安全红线，我批，商量一下怎么存」→ 方案五条后「口令同意。口令加一个过期时间，最多一个月。」「升级加密库同意」）

## 决定
- **吃书**：`crypto-state.ts` 头注释的「本模块持有内存密码——永不持久化」改成「本模块自己永不持久化」；持久化的那一份住 `@internal/encryption`（0.2.0+ `createPasswordKeeper`），本机 IDB `webxiaoheiwu-remember`，口令被一把不可导出的 AES-GCM 钥匙封着，过期时间封进密文。决策与威胁模型 = 加密库仓 `ai-docs/adr/0001-device-remembers-password.md`，这里只记 WXHW 的接法。
- **只记当前密码**；每篇自己的密码（ADR-0005）照旧每次问。
- **默认不勾**：解锁 / 首次设密码的面板上一个勾「在这台设备上记住 30 天（能解锁这台设备的人就能打开你的加密稿）」。记 30 天（库的上限），到期自动忘；设置 → 加密密码显示「{日期} 自动忘记」+「忘记这台设备记着的密码」。
- **开页**：记着 → 先和 verifier 比（`crypto-state.unlockWith`），对了才算解锁，而且在开上次那篇之前；对不上（别的设备改过 / 重置过）→ 忘掉、照常问。记着却没 verifier → 忘掉。
- **锁定即忘**：「立即锁定」、退出登录、忘记密码重置 → 忘掉（`onCurrentPasswordChange` 订阅兜底 + 三个入口各自等它落地）。**2 分钟闲置锁屏不动**（它本来就不忘密码）。
- **改密码** → 记新的，**过期日不往后挪**（同意的是「从那天起最多一个月」）。
- **还原出厂**删库（`factory-reset.ts` 的自开 IDB 名单）；清缓存 / 强制更新不碰。
- **接缝**：建 = `src/encryption.ts`（唯一值级 import 点）；递 = 组装点 `src/app.ts`；用 = `src/remember-password.ts`。`test/storage-whitelist` 按把手名守着（IDB 在库里，token 扫描扫不到）。

## 为什么这样接
- verifier 是「密码对不对」的唯一裁判（ADR-0002）：记着的密码也只是一把待验的钥匙，错的绝不碰任何文件。
- 恢复放在开稿之前：否则加密稿先开成锁卡、再闪成解锁。代价 = 记着时开页多一次 PBKDF2（没记 = 一次 IDB 读；0.2.2 起没记过的设备连空库都不建）。
- 库名用连字符：`webxiaoheiwu.` 前缀归 store 命名空间（库的 wipe / scan 按它枚举）。

## 验证
`test/remember-password.test.mjs`（9 条：开页三态 + 过期、锁定即忘、改密码天数不变、没勾不记、面板只在解锁 / 设密码给勾）；`npm run e2e:remember`（真 IDB、真重载，12 项：首开不建库 → 默认不勾 → 勾上重开不用输 → 立即锁定 = 忘 → 不勾只这一次 → CSP 零拦截）。**真机未验**（iPad Edge）。
