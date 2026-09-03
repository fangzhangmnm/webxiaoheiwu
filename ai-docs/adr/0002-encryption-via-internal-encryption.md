# ADR-0002 加密走 @internal/encryption 容器（放弃 v1 自研 AES-GCM/.enc 布局）
> created 20260903 · by Claude Fable 5.1 · status: accepted（标题可见性待 user 复核）

## 决定
加密稿 = 库透明容器（明文 zip 壳 + 7z AES-256 payload + 尾部加密 peek），云端 at-rest 名 `YYYYMMDD 标题.txt.zip`，本地 IDB 里也是密文（库 seal：明文永不落持久层）。统一密码住内存；「设过密码没 / 密码对不对」= verifier 记录（AES-GCM(PBKDF2×250k) 固定明文）住 `synced-app-state`；错密码只碰 verifier，永不碰稿。

## 背景
v1：自研 `XHWENC` AES-GCM 容器、`.enc/enc-<hex>.bin` 随机名（藏标题）、`.crypto/salt.json+verifier.bin`。家族已立户 `@internal/encryption`（WeebPaint 同款，7-Zip 可直接恢复 = anti-abandonware），store 0.7.0 起 `encryption` 是必填表态。user 2026-09-03「按 WeebPaint 对齐」。

## 取舍（明说）
- **标题在文件名里可见**（v1 藏进密文）。理由：对齐 WeebPaint（`X.ora.zip`）、零 app 侧容器知识、列表不必逐份解密。**如需藏标题**：改为文件名只留 `YYYYMMDD <hex>.txt`、真标题写进容器 meta——库无 peek 读面（RawFile 无 getPeek），需解锁后逐份 unpack 取标题（v1 也是全解一遍）。等 user 拍板。
- 16KB padding（防流量分析）不再有；7z 容器大小 ≈ 正文大小。
- 解密（密文→明文）仍需红字警告（明文一旦上云可能已被扫描）——保留。

## 否决
- 保留 v1 容器做双读：两套密码学、两套布局、库外解密 = 绕库。改为一次性只读导入（ADR-0004）。
