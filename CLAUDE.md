# WebXiaoHeiWu 网页版小黑屋（家族总规则见上级 CLAUDE.md）

无干扰中文写作 PWA。**Meta Quest 是一等公民**（无中文 IME → vendored RIME 双拼 WASM），PC/iOS 次之。UI 纯中文。

- 数据：平铺 `YYYYMMDD 标题.txt`，OneDrive AppFolder 为 SSoT，IDB 离线缓存；15s debounce + 30s 心跳 + visibilitychange/beforeunload 抢救推送；可选每文档 AES（密码不落盘、16KB padding 防流量分析；错密码绝不能污染文档）。
- 核心噩梦场景：挂机一年的旧设备醒来用旧数据 override 新数据 → idle 锁屏 + If-Match 是为此而生，别削弱。
- **产品墙**：接近 sealed class。论文/LaTeX 是另一个产品；警惕滑坡成 pastebin。
- 悬而未决：WebDAV/坚果云线（GFW 朋友部署，思路需推翻重想）；加密态语音输入只允许自托管 API（未实现）。
