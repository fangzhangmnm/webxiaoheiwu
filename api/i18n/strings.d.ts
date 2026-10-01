export type Lang = "zh" | "en";
export type Entry = {
    zh: string;
    en: string;
};
export declare const S: {
    readonly "common.ok": {
        readonly zh: "确定";
        readonly en: "OK";
    };
    readonly "common.cancel": {
        readonly zh: "取消";
        readonly en: "Cancel";
    };
    readonly "common.saved": {
        readonly zh: "已保存";
        readonly en: "Saved";
    };
    readonly "common.continue": {
        readonly zh: "继续";
        readonly en: "Continue";
    };
    readonly "err.dismissHint": {
        readonly zh: "点击关闭";
        readonly en: "tap to dismiss";
    };
    readonly "err.cloudNetwork": {
        readonly zh: "连不上云端（网络问题），本地已保留，稍后自动重试";
        readonly en: "Cloud unreachable (network); kept locally, will retry";
    };
    readonly "ui.appTitle": {
        readonly zh: "网页版小黑屋";
        readonly en: "WebXiaoHeiWu";
    };
    readonly "ui.menu": {
        readonly zh: "菜单";
        readonly en: "Menu";
    };
    readonly "top.docName": {
        readonly zh: "文件名（管理用，OneDrive 上可见）· 点击改名";
        readonly en: "File name (for organizing; visible on OneDrive) · tap to rename";
    };
    readonly "top.newDocName": {
        readonly zh: "新稿";
        readonly en: "New draft";
    };
    readonly "fn.title": {
        readonly zh: "文件名";
        readonly en: "File name";
    };
    readonly "fn.hint": {
        readonly zh: "只用于管理和排序，OneDrive 上可见；不是标题。留空 = 不改。";
        readonly en: "For organizing and sorting only; visible on OneDrive. Not a title. Leave empty to keep.";
    };
    readonly "fn.hintEnc": {
        readonly zh: "加密稿的文件名在 OneDrive 上仍是明文——别把标题写进来。留空 = 不改。";
        readonly en: "An encrypted draft's file name is still plaintext on OneDrive — do not put the title here. Leave empty to keep.";
    };
    readonly "fn.ph": {
        readonly zh: "例如 20260904-1a2b";
        readonly en: "e.g. 20260904-1a2b";
    };
    readonly "fn.ok": {
        readonly zh: "改名";
        readonly en: "Rename";
    };
    readonly "ui.editorAria": {
        readonly zh: "小说编辑区";
        readonly en: "Writing area";
    };
    readonly "ui.mic": {
        readonly zh: "语音输入";
        readonly en: "Voice input";
    };
    readonly "lock.aria": {
        readonly zh: "已锁定";
        readonly en: "Locked";
    };
    readonly "lock.locked": {
        readonly zh: "「{name}」是加密稿，已锁定。";
        readonly en: "“{name}” is encrypted and locked.";
    };
    readonly "lock.otherPw": {
        readonly zh: "「{name}」用的不是当前密码。";
        readonly en: "“{name}” uses a different password.";
    };
    readonly "lock.unavailable": {
        readonly zh: "「{name}」本地没有缓存，云端也连不上。";
        readonly en: "“{name}” is not cached locally and the cloud is unreachable.";
    };
    readonly "lock.unlock": {
        readonly zh: "解锁…";
        readonly en: "Unlock…";
    };
    readonly "lock.retry": {
        readonly zh: "重试";
        readonly en: "Retry";
    };
    readonly "lock.newDoc": {
        readonly zh: "新建稿";
        readonly en: "New draft";
    };
    readonly "lock.unpushedHint": {
        readonly zh: "这篇有还没上传的改动，解锁后会自动上传。";
        readonly en: "It has changes not yet uploaded; they upload once you unlock.";
    };
    readonly "save.aria": {
        readonly zh: "保存 / 同步";
        readonly en: "Save / sync";
    };
    readonly "save.title.clean": {
        readonly zh: "已同步 · 点击复查云端";
        readonly en: "Synced · tap to check the cloud";
    };
    readonly "save.title.unsynced": {
        readonly zh: "有改动未同步 · 点击立即上传（Ctrl+S）";
        readonly en: "Unsynced changes · tap to upload now (Ctrl+S)";
    };
    readonly "save.title.local": {
        readonly zh: "未登录 · 稿子只在本机 · 点击立即落盘";
        readonly en: "Not signed in · draft lives on this device · tap to save now";
    };
    readonly "save.title.offline": {
        readonly zh: "离线 · 已存本机，联网后自动上传";
        readonly en: "Offline · saved locally, uploads when back online";
    };
    readonly "save.title.encryptPending": {
        readonly zh: "加密还没成功 · 本地已存、未上云";
        readonly en: "Encryption pending · saved locally, not uploaded";
    };
    readonly "save.synced": {
        readonly zh: "已同步";
        readonly en: "Synced";
    };
    readonly "save.local": {
        readonly zh: "已存本机";
        readonly en: "Saved on this device";
    };
    readonly "save.offline": {
        readonly zh: "离线：已存本机，联网后自动上传";
        readonly en: "Offline: saved locally, uploads when back online";
    };
    readonly "save.stillPending": {
        readonly zh: "还没推上去，稍后自动重试";
        readonly en: "Not uploaded yet — will retry";
    };
    readonly "save.upToDate": {
        readonly zh: "已是云端最新";
        readonly en: "Up to date with the cloud";
    };
    readonly "ui.voiceBackspace": {
        readonly zh: "退格（按住连删）";
        readonly en: "Backspace (hold to repeat)";
    };
    readonly "voice.blockedLocked": {
        readonly zh: "这篇锁着，先解锁再口述";
        readonly en: "This draft is locked — unlock it to dictate";
    };
    readonly "voice.blockedReadOnly": {
        readonly zh: "这篇是只读，先关掉只读再口述";
        readonly en: "This draft is read-only — turn that off to dictate";
    };
    readonly "ui.busy": {
        readonly zh: "处理中…";
        readonly en: "Working…";
    };
    readonly "ui.busyHint": {
        readonly zh: "请稍候";
        readonly en: "Please wait";
    };
    readonly "ui.updateText": {
        readonly zh: "有新版本";
        readonly en: "New version available";
    };
    readonly "ui.updateReload": {
        readonly zh: "刷新";
        readonly en: "Reload";
    };
    readonly "ui.updateDismiss": {
        readonly zh: "忽略";
        readonly en: "Dismiss";
    };
    readonly "ui.drawerBack": {
        readonly zh: "返回";
        readonly en: "Back";
    };
    readonly "ui.drawerReload": {
        readonly zh: "刷新页面（从云端拉最新）";
        readonly en: "Reload page (pull latest from cloud)";
    };
    readonly "ui.drawerClose": {
        readonly zh: "关闭";
        readonly en: "Close";
    };
    readonly "ui.newMenu": {
        readonly zh: "新建…";
        readonly en: "New…";
    };
    readonly "ui.newDoc": {
        readonly zh: "新建稿";
        readonly en: "New draft";
    };
    readonly "ui.newEncDoc": {
        readonly zh: "新建加密稿";
        readonly en: "New encrypted draft";
    };
    readonly "ui.newFolder": {
        readonly zh: "新建文件夹";
        readonly en: "New folder";
    };
    readonly "ui.breadcrumbAria": {
        readonly zh: "文件夹";
        readonly en: "Folder";
    };
    readonly "list.root": {
        readonly zh: "全部稿件";
        readonly en: "All drafts";
    };
    readonly "list.emptyFolderDocs": {
        readonly zh: "这个夹里还没有稿。";
        readonly en: "No drafts in this folder yet.";
    };
    readonly "list.moveTo": {
        readonly zh: "移到…";
        readonly en: "Move to…";
    };
    readonly "list.more": {
        readonly zh: "更多";
        readonly en: "More";
    };
    readonly "list.rename": {
        readonly zh: "改名…";
        readonly en: "Rename…";
    };
    readonly "list.stalled": {
        readonly zh: "列表读取超时（本机存储没有响应）";
        readonly en: "List timed out (local storage did not respond)";
    };
    readonly "list.stalledFailed": {
        readonly zh: "列表读取失败";
        readonly en: "List failed to load";
    };
    readonly "list.retry": {
        readonly zh: "重试";
        readonly en: "Retry";
    };
    readonly "list.encrypted": {
        readonly zh: "加密稿";
        readonly en: "Encrypted";
    };
    readonly "ui.cloud": {
        readonly zh: "云端";
        readonly en: "Cloud";
    };
    readonly "cloud.titleIn": {
        readonly zh: "OneDrive · {who}";
        readonly en: "OneDrive · {who}";
    };
    readonly "cloud.titleOffline": {
        readonly zh: "OneDrive · {who}（离线）";
        readonly en: "OneDrive · {who} (offline)";
    };
    readonly "cloud.titleOut": {
        readonly zh: "未连接 OneDrive";
        readonly en: "Not connected to OneDrive";
    };
    readonly "cloud.account": {
        readonly zh: "已连接 · {who}";
        readonly en: "Connected · {who}";
    };
    readonly "cloud.accountOffline": {
        readonly zh: "已连接 · {who}（离线）";
        readonly en: "Connected · {who} (offline)";
    };
    readonly "cloud.notConnected": {
        readonly zh: "未连接（稿只在本机）";
        readonly en: "Not connected (drafts stay on this device)";
    };
    readonly "cloud.refresh": {
        readonly zh: "刷新云端";
        readonly en: "Refresh from cloud";
    };
    readonly "cloud.connect": {
        readonly zh: "连接 OneDrive";
        readonly en: "Connect OneDrive";
    };
    readonly "cloud.disconnect": {
        readonly zh: "断开连接";
        readonly en: "Disconnect";
    };
    readonly "folder.newTitle": {
        readonly zh: "新建文件夹";
        readonly en: "New folder";
    };
    readonly "folder.newHint": {
        readonly zh: "文件夹只有一层，用来分小说 / 系列。稿仍按日期命名。";
        readonly en: "Folders are one level deep — one per novel or series. Drafts keep their date names.";
    };
    readonly "folder.namePh": {
        readonly zh: "文件夹名";
        readonly en: "Folder name";
    };
    readonly "folder.badName": {
        readonly zh: "文件夹名不能为空";
        readonly en: "Folder name cannot be empty";
    };
    readonly "folder.created": {
        readonly zh: "已建文件夹「{name}」";
        readonly en: "Folder \"{name}\" created";
    };
    readonly "folder.createFailed": {
        readonly zh: "建文件夹失败：{e}";
        readonly en: "Could not create folder: {e}";
    };
    readonly "folder.delete": {
        readonly zh: "删除空文件夹";
        readonly en: "Delete empty folder";
    };
    readonly "folder.deleting": {
        readonly zh: "正在删除文件夹…";
        readonly en: "Deleting folder…";
    };
    readonly "folder.deleteTitle": {
        readonly zh: "删除文件夹「{name}」？";
        readonly en: "Delete folder \"{name}\"?";
    };
    readonly "folder.deleteMsg": {
        readonly zh: "只能删空文件夹；里面还有稿（含云端）会被拒绝，不会碰任何稿。";
        readonly en: "Only empty folders can be deleted; if drafts remain (including in the cloud) it is refused and nothing is touched.";
    };
    readonly "folder.deleted": {
        readonly zh: "已删除文件夹「{name}」";
        readonly en: "Folder \"{name}\" deleted";
    };
    readonly "folder.deleteFailed": {
        readonly zh: "删不掉（可能不是空的，或云端无法确认）：{e}";
        readonly en: "Could not delete (not empty, or cloud could not confirm): {e}";
    };
    readonly "move.title": {
        readonly zh: "移到哪个文件夹？";
        readonly en: "Move to which folder?";
    };
    readonly "move.msg": {
        readonly zh: "「{name}」";
        readonly en: "\"{name}\"";
    };
    readonly "move.noTarget": {
        readonly zh: "还没有别的文件夹可以移过去";
        readonly en: "No other folder to move to yet";
    };
    readonly "st.moved": {
        readonly zh: "已移到「{dir}」";
        readonly en: "Moved to \"{dir}\"";
    };
    readonly "st.moveFailed": {
        readonly zh: "移动失败";
        readonly en: "Move failed";
    };
    readonly "ui.emptyTrash": {
        readonly zh: "清空回收站";
        readonly en: "Empty trash";
    };
    readonly "ui.settings": {
        readonly zh: "设置";
        readonly en: "Settings";
    };
    readonly "ui.trash": {
        readonly zh: "回收站";
        readonly en: "Trash";
    };
    readonly "ui.sec.account": {
        readonly zh: "账号";
        readonly en: "Account";
    };
    readonly "ui.sec.language": {
        readonly zh: "界面语言";
        readonly en: "Language";
    };
    readonly "ui.sec.reading": {
        readonly zh: "行宽";
        readonly en: "Line width";
    };
    readonly "ui.reading.chars14": {
        readonly zh: "每行 14 字";
        readonly en: "14 per line";
    };
    readonly "ui.reading.chars20": {
        readonly zh: "每行 20 字";
        readonly en: "20 per line";
    };
    readonly "ui.reading.chars28": {
        readonly zh: "每行 28 字";
        readonly en: "28 per line";
    };
    readonly "ui.reading.font": {
        readonly zh: "字体";
        readonly en: "Font";
    };
    readonly "ui.reading.fontSans": {
        readonly zh: "黑体";
        readonly en: "Sans";
    };
    readonly "ui.reading.fontPinyin": {
        readonly zh: "拼音";
        readonly en: "Pinyin";
    };
    readonly "ui.reading.fontHint": {
        readonly zh: "字体也跟书走；导出默认用同一款（导出面板里可以另选）。拼音字体 12 MB，选了才取。";
        readonly en: "The font is saved with the book; exports use the same one by default (the export sheet can pick another). The pinyin font is 12 MB and is fetched only when chosen.";
    };
    readonly "ui.reading.fontScale": {
        readonly zh: "字号（本机）";
        readonly en: "Text size (this device)";
    };
    readonly "ui.reading.fontScale.s": {
        readonly zh: "小";
        readonly en: "Small";
    };
    readonly "ui.reading.fontScale.m": {
        readonly zh: "标准";
        readonly en: "Standard";
    };
    readonly "ui.reading.fontScale.l": {
        readonly zh: "大";
        readonly en: "Large";
    };
    readonly "ui.reading.fontScale.xl": {
        readonly zh: "特大";
        readonly en: "Extra large";
    };
    readonly "ui.reading.fontScale.xxl": {
        readonly zh: "超大";
        readonly en: "Huge";
    };
    readonly "ui.reading.ruled": {
        readonly zh: "写字线";
        readonly en: "Ruled lines";
    };
    readonly "ui.reading.wordCount": {
        readonly zh: "字数统计";
        readonly en: "Word count";
    };
    readonly "foot.wordCount": {
        readonly zh: "{cjk} 字 {en} 词";
        readonly en: "{cjk} chars · {en} words";
    };
    readonly "edge.fromImage": {
        readonly zh: "从图片…";
        readonly en: "From image…";
    };
    readonly "edge.backlinks": {
        readonly zh: "谁指向这里";
        readonly en: "Linked from";
    };
    readonly "edge.cutIncoming": {
        readonly zh: "断开";
        readonly en: "Unlink from here";
    };
    readonly "edge.cutDone": {
        readonly zh: "已断开「{name}」指向这页的边";
        readonly en: "Unlinked “{name}” from this page";
    };
    readonly "img.pickTitle": {
        readonly zh: "加图片页";
        readonly en: "Add image pages";
    };
    readonly "img.pickHint": {
        readonly zh: "长边超过 2048 会缩小并转成 JPEG；小图只剥掉隐私 metadata；动图 GIF 原样进来。";
        readonly en: "Long edge over 2048 is downscaled to JPEG; small images only lose their privacy metadata; animated GIFs pass through as-is.";
    };
    readonly "img.hd": {
        readonly zh: "保留高清（上限 4096）";
        readonly en: "Keep high-res (up to 4096)";
    };
    readonly "img.pick": {
        readonly zh: "选择图片…";
        readonly en: "Choose images…";
    };
    readonly "img.fatGifTitle": {
        readonly zh: "这张动图有点胖";
        readonly en: "Big animated GIF";
    };
    readonly "img.fatGifMsg": {
        readonly zh: "「{name}」有 {size}，书会跟着变胖，推云也慢。仍要加进来？";
        readonly en: "“{name}” is {size}; the book gets heavier and cloud sync slower. Add it anyway?";
    };
    readonly "img.fatGifOk": {
        readonly zh: "仍要加";
        readonly en: "Add anyway";
    };
    readonly "img.notImage": {
        readonly zh: "「{name}」不是图片（jpg / png / webp / gif）";
        readonly en: "“{name}” is not an image (jpg / png / webp / gif)";
    };
    readonly "img.addedSibling": {
        readonly zh: "已加入 {n} 张图片，放在「{name}」之后";
        readonly en: "Added {n} image(s) after “{name}”";
    };
    readonly "img.addedChild": {
        readonly zh: "已加入 {n} 张图片，作为「{name}」的子节";
        readonly en: "Added {n} image(s) as children of “{name}”";
    };
    readonly "img.addedLinked": {
        readonly zh: "已加入 {n} 张图片，从「{name}」链出";
        readonly en: "Added {n} image(s), linked from “{name}”";
    };
    readonly "img.compressedSuffix": {
        readonly zh: "（已压缩 {from} → {to}）";
        readonly en: " (compressed {from} → {to})";
    };
    readonly "img.txtAdded": {
        readonly zh: "已加入「{name}」";
        readonly en: "Added “{name}”";
    };
    readonly "img.dropDraft": {
        readonly zh: "已新建稿「{name}」";
        readonly en: "New draft “{name}”";
    };
    readonly "img.setCover": {
        readonly zh: "设为封面";
        readonly en: "Set as cover";
    };
    readonly "img.coverSet": {
        readonly zh: "已设为封面";
        readonly en: "Cover set";
    };
    readonly "img.replace": {
        readonly zh: "替换图片…";
        readonly en: "Replace image…";
    };
    readonly "img.replaced": {
        readonly zh: "已替换";
        readonly en: "Replaced";
    };
    readonly "img.replacedCover": {
        readonly zh: "已替换，封面跟着换了";
        readonly en: "Replaced; cover updated too";
    };
    readonly "img.dropTxtMode": {
        readonly zh: "图片要放进书里：先把这篇变成书";
        readonly en: "Images live in books: turn this draft into a book first";
    };
    readonly "img.making": {
        readonly zh: "处理图片…";
        readonly en: "Processing image…";
    };
    readonly "img.meta": {
        readonly zh: "{name} · {w}×{h} · {size}";
        readonly en: "{name} · {w}×{h} · {size}";
    };
    readonly "img.failed": {
        readonly zh: "图片处理失败：{e}";
        readonly en: "Image failed: {e}";
    };
    readonly "galx.tileActive": {
        readonly zh: "打开中";
        readonly en: "Open";
    };
    readonly "ui.reading.hintBook": {
        readonly zh: "这本书的行宽（跟书走；导出长图 / PDF 默认也用它，导出面板里可以另选）。只管一行最多放几个字，行距跟着走；字多大只看「字号」。";
        readonly en: "This book’s line width (saved with the book; exports use it by default — the export sheet can pick another). Only the most characters a line may hold; line spacing follows; text size comes from “Text size” alone.";
    };
    readonly "ui.reading.hintBookDefault": {
        readonly zh: "这本书还没定行宽，先用默认；改一下就记进这本书（导出长图 / PDF 默认也用它，导出面板里可以另选）。";
        readonly en: "This book has no line width of its own yet — showing the default; change it and it’s saved with the book (exports use it by default — the export sheet can pick another).";
    };
    readonly "ui.reading.hint": {
        readonly zh: "默认行宽（新书和 txt 稿用；每本书可以自己改）。只管一行最多放几个字，行距跟着走；字多大只看「字号」，两者互不相干。屏幕放不下时一行少排几个字，不缩字。14 = 诗 / 小故事 / 自律篇幅，20 = 高考作文格，28 = 纸书。";
        readonly en: "Only the most characters a line may hold; line spacing follows. Text size comes from “Text size” alone — the two never affect each other. When the screen is too narrow, fewer characters per line, never smaller text. 14 = poems / vignettes / disciplined length, 20 = exam essay grid, 28 = paperback.";
    };
    readonly "ui.sec.voice": {
        readonly zh: "语音输入";
        readonly en: "Voice input";
    };
    readonly "ui.voice.localHint": {
        readonly zh: "识别在本机运行，声音不出设备；加密稿也能用。第一次用会先下载语音包（一次，离线可用）。按语音键说话，或点右下角话筒。";
        readonly en: "Recognition runs on this device; audio never leaves it, so it works on encrypted drafts too. The first use downloads a voice pack once (works offline after). Press the voice key to talk, or tap the mic.";
    };
    readonly "ui.voice.pttKey": {
        readonly zh: "语音（本机）";
        readonly en: "Voice (this device)";
    };
    readonly "ui.voice.pttKey.ctrl": {
        readonly zh: "左 Ctrl：按住说话";
        readonly en: "Left Ctrl: hold to talk";
    };
    readonly "ui.voice.pttKey.caps": {
        readonly zh: "CapsLock：按一下开始，再按一下停";
        readonly en: "CapsLock: press to start, press again to stop";
    };
    readonly "ui.voice.pttKey.none": {
        readonly zh: "禁用（这台设备不用语音，话筒也收起）";
        readonly en: "Off (no voice on this device; mic button hidden too)";
    };
    readonly "ui.voice.pttKeyHint": {
        readonly zh: "左 Ctrl 和 Ctrl+C 之类会撞车时换 CapsLock。CapsLock 会翻大小写锁，所以用它当语音键时实体键盘打的字母一律按小写进输入法。";
        readonly en: "Switch to CapsLock if Left Ctrl collides with Ctrl+C and friends. CapsLock toggles caps lock, so letters typed on a hardware keyboard are folded to lowercase for the IME while it is the voice key.";
    };
    readonly "ui.voice.model": {
        readonly zh: "识别模型";
        readonly en: "Model";
    };
    readonly "ui.voice.model.sensevoice": {
        readonly zh: "SenseVoice（推荐 · 228 MB · 带标点）";
        readonly en: "SenseVoice (recommended · 228 MB · punctuation)";
    };
    readonly "ui.voice.model.zh14m": {
        readonly zh: "极限小杯 zh-14M（30 MB · 流式 · 实验）";
        readonly en: "Tiny zh-14M (30 MB · streaming · experimental)";
    };
    readonly "ui.voice.download": {
        readonly zh: "下载语音包";
        readonly en: "Download voice pack";
    };
    readonly "ui.voice.import": {
        readonly zh: "从文件导入…";
        readonly en: "Import from file…";
    };
    readonly "ui.voice.delete": {
        readonly zh: "删除语音包";
        readonly en: "Delete voice pack";
    };
    readonly "ui.voice.source": {
        readonly zh: "模型源（可换镜像；字节到手都先校验）";
        readonly en: "Model source (any mirror; bytes are verified on arrival)";
    };
    readonly "ui.font.credit": {
        readonly zh: "正文字体：思源黑体（Noto Sans SC）© Adobe。导出可选的拼音字体：萌神手写体 © 萌神 PROJECT / LXGW。两款都是 SIL 开源字体许可 1.1，随 app 附许可证全文（vendor/fonts/OFL.txt、OFL-pinyin.txt）。";
        readonly en: "Body font: Noto Sans SC (Source Han Sans) © Adobe. Optional pinyin font for exports: Mengshen-Handwritten © mengshen project / LXGW. Both under the SIL Open Font License 1.1; the full licenses ship with the app (vendor/fonts/OFL.txt, OFL-pinyin.txt).";
    };
    readonly "ui.sec.maintenance": {
        readonly zh: "维护";
        readonly en: "Maintenance";
    };
    readonly "ui.forceUpdate": {
        readonly zh: "强制更新（清缓存重启）";
        readonly en: "Force update (clear cache & restart)";
    };
    readonly "ui.diag": {
        readonly zh: "诊断日志";
        readonly en: "Diagnostics";
    };
    readonly "ui.sheetOk": {
        readonly zh: "确定";
        readonly en: "OK";
    };
    readonly "ui.sheetInput2Ph": {
        readonly zh: "再次输入以确认";
        readonly en: "Repeat to confirm";
    };
    readonly "st.loading": {
        readonly zh: "加载中…";
        readonly en: "Loading…";
    };
    readonly "st.unsynced": {
        readonly zh: "未同步";
        readonly en: "Not synced";
    };
    readonly "st.localDraft": {
        readonly zh: "本地草稿";
        readonly en: "Local draft";
    };
    readonly "st.syncing": {
        readonly zh: "正在同步…";
        readonly en: "Syncing…";
    };
    readonly "st.saveFailed": {
        readonly zh: "保存失败：{e}";
        readonly en: "Save failed: {e}";
    };
    readonly "st.syncFailed": {
        readonly zh: "同步失败：{e}";
        readonly en: "Sync failed: {e}";
    };
    readonly "st.renameFailed": {
        readonly zh: "改名失败（名字被占用？）";
        readonly en: "Rename failed (name taken?)";
    };
    readonly "st.renamed": {
        readonly zh: "已改名：{name}";
        readonly en: "Renamed: {name}";
    };
    readonly "fn.retryHint": {
        readonly zh: "改名没成功，再试一次或取消。";
        readonly en: "Rename failed — try again or cancel.";
    };
    readonly "st.wrongPasswordOrLocked": {
        readonly zh: "密码不对，无法解密这篇";
        readonly en: "Wrong password — cannot decrypt this draft";
    };
    readonly "st.unavailable": {
        readonly zh: "本地没有缓存，云端也连不上";
        readonly en: "Not cached locally and cloud unreachable";
    };
    readonly "st.loadedCloudLatest": {
        readonly zh: "已加载云端最新 {time}";
        readonly en: "Loaded latest from cloud {time}";
    };
    readonly "st.cloudGone": {
        readonly zh: "此文件在云端已不存在";
        readonly en: "This file no longer exists in the cloud";
    };
    readonly "st.replacingFromCloud": {
        readonly zh: "云端有新版本，正在载入…";
        readonly en: "Loading the newer version from the cloud…";
    };
    readonly "rescue.title": {
        readonly zh: "{name} 冲突留底";
        readonly en: "{name} (conflict copy)";
    };
    readonly "rescue.saved": {
        readonly zh: "上传途中打的字已另存为「{name}」";
        readonly en: "What you typed during the upload was saved as “{name}”";
    };
    readonly "rescue.failed": {
        readonly zh: "上传途中打的字没能留底：{e}";
        readonly en: "Could not keep what you typed during the upload: {e}";
    };
    readonly "st.pushedAll": {
        readonly zh: "已补传 {n} 个文件";
        readonly en: "Caught up: {n} file(s) uploaded";
    };
    readonly "st.pushAllFailed": {
        readonly zh: "{n} 个文件没传上去（加密未解锁 / 冲突 / 网络），详见诊断日志";
        readonly en: "{n} file(s) still not uploaded (locked / conflict / network); see diagnostics";
    };
    readonly "st.pendingEncrypted": {
        readonly zh: "新稿将以加密保存";
        readonly en: "This new draft will be saved encrypted";
    };
    readonly "st.pendingPlain": {
        readonly zh: "新稿将以明文保存";
        readonly en: "This new draft will be saved in plaintext";
    };
    readonly "st.encryptPendingHint": {
        readonly zh: "加密还没成功（本地已存、不会推云）——联网后会自动重试";
        readonly en: "Encryption has not succeeded yet (saved locally, not pushed) — retries automatically when online";
    };
    readonly "st.encryptedKeepName": {
        readonly zh: "已加密 {time}；文件名「{name}」不变（OneDrive 上可见，想藏点顶栏改名）";
        readonly en: "Encrypted {time}; file name “{name}” unchanged (visible on OneDrive — rename from the top bar to hide it)";
    };
    readonly "st.renameOldKept": {
        readonly zh: "已按新文件名另存；旧名那份云端还在（列表里会有两份）";
        readonly en: "Saved under the new file name; the old copy is still in the cloud (you will see both)";
    };
    readonly "st.renameCloudDeferred": {
        readonly zh: "文件名已改（云端待推）";
        readonly en: "File name changed (cloud pending)";
    };
    readonly "st.encryptFailed": {
        readonly zh: "加密失败：{e}";
        readonly en: "Encrypt failed: {e}";
    };
    readonly "st.decrypted": {
        readonly zh: "已解密 {time}（{status}）";
        readonly en: "Decrypted {time} ({status})";
    };
    readonly "st.decryptFailed": {
        readonly zh: "解密失败：{e}";
        readonly en: "Decrypt failed: {e}";
    };
    readonly "st.cancelled": {
        readonly zh: "已取消";
        readonly en: "Cancelled";
    };
    readonly "st.movedToTrash": {
        readonly zh: "已移到回收站：{name}";
        readonly en: "Moved to trash: {name}";
    };
    readonly "st.cloudCopyStillThere": {
        readonly zh: "（云端那份稍后随队列删）";
        readonly en: " (cloud copy queued)";
    };
    readonly "st.trashFailed": {
        readonly zh: "移到回收站失败：{e}";
        readonly en: "Trash failed: {e}";
    };
    readonly "st.restored": {
        readonly zh: "已恢复：{name}";
        readonly en: "Restored: {name}";
    };
    readonly "st.restoredRenamed": {
        readonly zh: "已恢复（改名为 {name}）";
        readonly en: "Restored (renamed to {name})";
    };
    readonly "st.restoreFailed": {
        readonly zh: "恢复失败：{e}";
        readonly en: "Restore failed: {e}";
    };
    readonly "st.purged": {
        readonly zh: "已永久删除：{name}";
        readonly en: "Permanently deleted: {name}";
    };
    readonly "st.purgeFailed": {
        readonly zh: "删除失败：{e}";
        readonly en: "Delete failed: {e}";
    };
    readonly "st.trashEmptied": {
        readonly zh: "回收站已清空（{n} 项）";
        readonly en: "Trash emptied ({n} items)";
    };
    readonly "st.reloading": {
        readonly zh: "刷新中…";
        readonly en: "Reloading…";
    };
    readonly "st.online": {
        readonly zh: "已联网，正在同步…";
        readonly en: "Back online, syncing…";
    };
    readonly "st.syncPushing": {
        readonly zh: "正在上传…";
        readonly en: "Uploading…";
    };
    readonly "st.fileRenaming": {
        readonly zh: "正在改名…";
        readonly en: "Renaming…";
    };
    readonly "st.filePulling": {
        readonly zh: "正在拉取云端版本…";
        readonly en: "Pulling cloud version…";
    };
    readonly "st.cloudChecking": {
        readonly zh: "正在检查云端…";
        readonly en: "Checking cloud…";
    };
    readonly "st.fileDeleting": {
        readonly zh: "正在移到回收站…";
        readonly en: "Moving to trash…";
    };
    readonly "st.trashRestoring": {
        readonly zh: "正在恢复…";
        readonly en: "Restoring…";
    };
    readonly "st.trashPurging": {
        readonly zh: "正在永久删除…";
        readonly en: "Deleting permanently…";
    };
    readonly "st.trashEmptyTrash": {
        readonly zh: "正在清空回收站…";
        readonly en: "Emptying trash…";
    };
    readonly "st.trashEmptyBackups": {
        readonly zh: "正在清空备份箱…";
        readonly en: "Emptying backups…";
    };
    readonly "st.fileEncrypting": {
        readonly zh: "正在加密…";
        readonly en: "Encrypting…";
    };
    readonly "st.fileDecrypting": {
        readonly zh: "正在解密…";
        readonly en: "Decrypting…";
    };
    readonly "st.fileRekeying": {
        readonly zh: "正在换钥匙重封…";
        readonly en: "Re-keying…";
    };
    readonly "st.fileReuploading": {
        readonly zh: "正在重新上传…";
        readonly en: "Re-uploading…";
    };
    readonly "st.folderCreating": {
        readonly zh: "正在建文件夹…";
        readonly en: "Creating folder…";
    };
    readonly "st.folderDeleting": {
        readonly zh: "正在删文件夹…";
        readonly en: "Deleting folder…";
    };
    readonly "cf.title": {
        readonly zh: "云端有新版本";
        readonly en: "Newer version in the cloud";
    };
    readonly "cf.bodyOpen": {
        readonly zh: "「{name}」在云端有更新的版本，本机也有未上传的修改。";
        readonly en: "“{name}” has a newer cloud version and unsent local edits.";
    };
    readonly "cf.bodyPush": {
        readonly zh: "「{name}」在你编辑期间被别的设备改过。保留哪一边？";
        readonly en: "“{name}” was changed by another device while you edited. Keep which side?";
    };
    readonly "cf.noteKeptSafe": {
        readonly zh: "被替换的版本会自动留底，不会丢失。";
        readonly en: "The replaced version is kept as a backup; nothing is lost.";
    };
    readonly "cf.openLocal": {
        readonly zh: "先打开本地";
        readonly en: "Open local for now";
    };
    readonly "cf.cloudWins": {
        readonly zh: "云端覆盖本地";
        readonly en: "Cloud wins";
    };
    readonly "cf.localWins": {
        readonly zh: "本地覆盖云端";
        readonly en: "Local wins";
    };
    readonly "cf.checkingCloud": {
        readonly zh: "正在检查云端…";
        readonly en: "Checking the cloud…";
    };
    readonly "cf.skipToOffline": {
        readonly zh: "跳过，先离线打开";
        readonly en: "Skip, open offline";
    };
    readonly "replay.progress": {
        readonly zh: "正在上传离线新稿 {done}/{total}…";
        readonly en: "Uploading offline drafts {done}/{total}…";
    };
    readonly "replay.done": {
        readonly zh: "离线新稿已上传 {done}/{total}";
        readonly en: "Offline drafts uploaded {done}/{total}";
    };
    readonly "replay.collision": {
        readonly zh: "「{name}」云端已有同名文件，本地这份未覆盖上去（请改个文件名再存）";
        readonly en: "“{name}” already exists in the cloud; the local copy was not uploaded (rename the file and save again)";
    };
    readonly "drawer.files": {
        readonly zh: "文件";
        readonly en: "Files";
    };
    readonly "drawer.trash": {
        readonly zh: "回收站";
        readonly en: "Trash";
    };
    readonly "drawer.settings": {
        readonly zh: "设置";
        readonly en: "Settings";
    };
    readonly "list.empty": {
        readonly zh: "这里还没有任何文件。";
        readonly en: "No files yet.";
    };
    readonly "list.loading": {
        readonly zh: "加载中…";
        readonly en: "Loading…";
    };
    readonly "list.toTrash": {
        readonly zh: "移到回收站";
        readonly en: "Move to trash";
    };
    readonly "sync.synced": {
        readonly zh: "已同步";
        readonly en: "Synced";
    };
    readonly "sync.unpushed": {
        readonly zh: "未上传";
        readonly en: "Not uploaded";
    };
    readonly "sync.cloudOnly": {
        readonly zh: "仅云端";
        readonly en: "Cloud only";
    };
    readonly "sync.localOnly": {
        readonly zh: "仅本机";
        readonly en: "Local only";
    };
    readonly "sync.newerOnCloud": {
        readonly zh: "云端有新版";
        readonly en: "Newer in cloud";
    };
    readonly "sync.conflict": {
        readonly zh: "冲突";
        readonly en: "Conflict";
    };
    readonly "sync.ghost": {
        readonly zh: "云端已删";
        readonly en: "Gone from cloud";
    };
    readonly "sync.pendingGone": {
        readonly zh: "云端似已删";
        readonly en: "Possibly gone";
    };
    readonly "sync.float": {
        readonly zh: "游离";
        readonly en: "Float";
    };
    readonly "trash.empty": {
        readonly zh: "回收站是空的。";
        readonly en: "Trash is empty.";
    };
    readonly "trash.sideBoth": {
        readonly zh: "本机 + 云端";
        readonly en: "Local + cloud";
    };
    readonly "trash.sideCloud": {
        readonly zh: "云端";
        readonly en: "Cloud";
    };
    readonly "trash.sideLocal": {
        readonly zh: "本机";
        readonly en: "Local";
    };
    readonly "trash.conflictLive": {
        readonly zh: "原名仍在云端";
        readonly en: "Original still live in cloud";
    };
    readonly "trash.restore": {
        readonly zh: "恢复";
        readonly en: "Restore";
    };
    readonly "trash.purge": {
        readonly zh: "永久删除";
        readonly en: "Delete permanently";
    };
    readonly "trash.purgeTitle": {
        readonly zh: "永久删除「{name}」？";
        readonly en: "Delete “{name}” permanently?";
    };
    readonly "trash.purgeMsg": {
        readonly zh: "此文件将永久删除，无法恢复。";
        readonly en: "This file will be deleted permanently and cannot be recovered.";
    };
    readonly "trash.emptyTitle": {
        readonly zh: "清空回收站？";
        readonly en: "Empty the trash?";
    };
    readonly "trash.emptyMsg": {
        readonly zh: "回收站里的全部文件将永久删除（本机与云端），无法恢复。";
        readonly en: "All files in the trash (local and cloud) will be deleted permanently.";
    };
    readonly "trash.emptyAction": {
        readonly zh: "清空";
        readonly en: "Empty";
    };
    readonly "busy.restoring": {
        readonly zh: "恢复「{name}」…";
        readonly en: "Restoring “{name}”…";
    };
    readonly "busy.purging": {
        readonly zh: "永久删除「{name}」…";
        readonly en: "Deleting “{name}”…";
    };
    readonly "busy.emptyingTrash": {
        readonly zh: "清空回收站…";
        readonly en: "Emptying trash…";
    };
    readonly "busy.encrypting": {
        readonly zh: "加密中…";
        readonly en: "Encrypting…";
    };
    readonly "busy.decrypting": {
        readonly zh: "解密中…";
        readonly en: "Decrypting…";
    };
    readonly "pw.unlockTitle": {
        readonly zh: "解锁加密";
        readonly en: "Unlock";
    };
    readonly "pw.unlockHint": {
        readonly zh: "输入密码以解锁加密稿。错了不会污染任何文件。";
        readonly en: "Enter the password to unlock encrypted drafts. A wrong password touches nothing.";
    };
    readonly "pw.setupTitle": {
        readonly zh: "设置加密密码";
        readonly en: "Set an encryption password";
    };
    readonly "pw.setupHint": {
        readonly zh: "这个密码用于本账号下所有加密稿。忘了就找不回——没有任何后门。";
        readonly en: "Used for every encrypted draft in this account. If you forget it, the drafts are gone — there is no backdoor.";
    };
    readonly "pw.wrong": {
        readonly zh: "密码错误";
        readonly en: "Wrong password";
    };
    readonly "pw.mismatch": {
        readonly zh: "两次输入不一致";
        readonly en: "The two entries differ";
    };
    readonly "pw.unlock": {
        readonly zh: "解锁";
        readonly en: "Unlock";
    };
    readonly "pw.set": {
        readonly zh: "设置";
        readonly en: "Set";
    };
    readonly "pw.setupNeedsNetwork": {
        readonly zh: "首次设置密码要先联网同步（避免盖掉别的设备已设的密码）";
        readonly en: "Setting the first password needs a sync first (so another device's password is not overwritten)";
    };
    readonly "fp.title": {
        readonly zh: "这篇稿的密码";
        readonly en: "This draft's password";
    };
    readonly "fp.hint": {
        readonly zh: "「{name}」用的不是当前密码。输入它自己的密码；错了不会碰任何文件。";
        readonly en: "\"{name}\" was not encrypted with the current password. Enter its own password; a wrong one touches nothing.";
    };
    readonly "st.otherPasswordHint": {
        readonly zh: "这篇用的不是当前密码";
        readonly en: "This draft uses a different password";
    };
    readonly "ui.key.otherPw": {
        readonly zh: "这篇用的不是当前密码（保存仍用它自己的密码）";
        readonly en: "This draft uses a different password (saves keep using its own)";
    };
    readonly "ui.key.rekey": {
        readonly zh: "换成当前密码";
        readonly en: "Re-key to current password";
    };
    readonly "busy.rekeying": {
        readonly zh: "正在换成当前密码…";
        readonly en: "Re-keying…";
    };
    readonly "st.rekeyed": {
        readonly zh: "已换成当前密码";
        readonly en: "Re-keyed to the current password";
    };
    readonly "st.rekeyFailed": {
        readonly zh: "换密码失败：{e}";
        readonly en: "Re-key failed: {e}";
    };
    readonly "ui.sec.password": {
        readonly zh: "加密密码";
        readonly en: "Encryption password";
    };
    readonly "ui.pw.hint": {
        readonly zh: "一个账号一个当前密码；每篇加密稿用它自己被封时的那把（改密码时可选择把已有稿一起换）。没有任何后门。";
        readonly en: "One current password per account; each encrypted draft keeps the password it was sealed with (you can migrate them when changing). There is no backdoor.";
    };
    readonly "ui.pw.change": {
        readonly zh: "更改密码…";
        readonly en: "Change password…";
    };
    readonly "ui.pw.lockNow": {
        readonly zh: "立即锁定";
        readonly en: "Lock now";
    };
    readonly "pw.status.none": {
        readonly zh: "还没设置密码——新建加密稿或点锁图标时设置";
        readonly en: "No password yet — set it when you create an encrypted draft or tap the lock";
    };
    readonly "pw.status.unlocked": {
        readonly zh: "已设置 · 当前已解锁（本机内存里，关页即忘）";
        readonly en: "Set · currently unlocked (in memory only, forgotten when the page closes)";
    };
    readonly "pw.status.locked": {
        readonly zh: "已设置 · 当前已锁定";
        readonly en: "Set · currently locked";
    };
    readonly "ui.pw.reset": {
        readonly zh: "忘记密码，重置…";
        readonly en: "Forgot password — reset…";
    };
    readonly "cp.newTitle": {
        readonly zh: "新密码";
        readonly en: "New password";
    };
    readonly "cp.newHint": {
        readonly zh: "之后新建的加密稿用这个密码。已有的稿下一步决定。";
        readonly en: "New encrypted drafts will use this password. Existing drafts are decided next.";
    };
    readonly "cp.same": {
        readonly zh: "和当前密码一样，没改";
        readonly en: "Same as the current password — nothing changed";
    };
    readonly "cp.migrateTitle": {
        readonly zh: "已有的加密稿怎么办？";
        readonly en: "What about existing encrypted drafts?";
    };
    readonly "cp.migrateMsg": {
        readonly zh: "「同时换成新密码」会逐篇解开再用新密码重封（能碰到的都换；用别的密码封的、拿不到的仍保持原样，打开时会单独问）。「保留」= 每篇仍用它自己的密码。";
        readonly en: "\"Migrate\" re-encrypts each reachable draft with the new password (drafts with another password or unreachable ones stay as they are and prompt when opened). \"Keep\" leaves every draft on its own password.";
    };
    readonly "cp.migrate": {
        readonly zh: "同时换成新密码（推荐）";
        readonly en: "Migrate them too (recommended)";
    };
    readonly "cp.keep": {
        readonly zh: "保留各自的旧密码";
        readonly en: "Keep their own passwords";
    };
    readonly "busy.migrating": {
        readonly zh: "正在更换密码…";
        readonly en: "Changing password…";
    };
    readonly "cp.done": {
        readonly zh: "密码已更改：{n} 篇已换成新密码，{m} 篇仍用旧密码";
        readonly en: "Password changed: {n} draft(s) re-keyed, {m} still on an old password";
    };
    readonly "cp.doneKeep": {
        readonly zh: "密码已更改；已有的加密稿仍用各自旧密码";
        readonly en: "Password changed; existing drafts keep their own passwords";
    };
    readonly "rp.title": {
        readonly zh: "忘记密码，重置？";
        readonly en: "Forgot password — reset?";
    };
    readonly "rp.msg": {
        readonly zh: "重置后下次加密时设新密码。已有的加密稿仍是旧密码——只有想起旧密码才能打开，没有后门。";
        readonly en: "After reset you set a new password next time you encrypt. Existing encrypted drafts keep the old password — only remembering it opens them; there is no backdoor.";
    };
    readonly "rp.action": {
        readonly zh: "重置";
        readonly en: "Reset";
    };
    readonly "rp.done": {
        readonly zh: "已重置。下次加密时设置新密码";
        readonly en: "Reset. Set a new password next time you encrypt";
    };
    readonly "top.encryptDoc": {
        readonly zh: "加密这篇";
        readonly en: "Encrypt this draft";
    };
    readonly "top.decryptDoc": {
        readonly zh: "解密为明文";
        readonly en: "Decrypt to plaintext";
    };
    readonly "top.unlockDoc": {
        readonly zh: "解锁加密";
        readonly en: "Unlock";
    };
    readonly "top.readOnlyOn": {
        readonly zh: "只读保护";
        readonly en: "Read-only";
    };
    readonly "top.readOnlyOff": {
        readonly zh: "解除只读";
        readonly en: "Allow editing";
    };
    readonly "enc.decryptTitle": {
        readonly zh: "解密为明文？";
        readonly en: "Decrypt to plaintext?";
    };
    readonly "enc.decryptWarning": {
        readonly zh: "解密会把明文上传到 OneDrive——即使你之后再次加密，这一次的明文有可能已被云端扫描。";
        readonly en: "Decrypting uploads plaintext to OneDrive. Even if you re-encrypt later, this plaintext may already have been scanned.";
    };
    readonly "enc.decryptAction": {
        readonly zh: "解密";
        readonly en: "Decrypt";
    };
    readonly "enc.lockedNow": {
        readonly zh: "加密已锁定";
        readonly en: "Encryption locked";
    };
    readonly "ime.system": {
        readonly zh: "系统输入法";
        readonly en: "System IME";
    };
    readonly "ime.clickToToggle": {
        readonly zh: "点击切换中/英（Shift 同）";
        readonly en: "Click to toggle 中/EN (same as Shift)";
    };
    readonly "ime.schema.luna": {
        readonly zh: "全拼";
        readonly en: "Pinyin";
    };
    readonly "ime.schema.mspy": {
        readonly zh: "微软双拼";
        readonly en: "Microsoft double pinyin";
    };
    readonly "ime.schema.wubi": {
        readonly zh: "五笔 86";
        readonly en: "Wubi 86";
    };
    readonly "ime.schema.fluency": {
        readonly zh: "全拼 · 语句流（整句连打）";
        readonly en: "Pinyin · sentence flow";
    };
    readonly "ime.schema.ziranma": {
        readonly zh: "自然码双拼";
        readonly en: "Ziranma double pinyin";
    };
    readonly "ime.schema.flypy": {
        readonly zh: "小鹤双拼";
        readonly en: "Xiaohe double pinyin";
    };
    readonly "ime.schema.abc": {
        readonly zh: "智能 ABC 双拼";
        readonly en: "ABC double pinyin";
    };
    readonly "ime.schema.pyjj": {
        readonly zh: "拼音加加双拼";
        readonly en: "Pinyin Jiajia double pinyin";
    };
    readonly "ime.nameFallback": {
        readonly zh: "拼音（备用）";
        readonly en: "Pinyin (fallback)";
    };
    readonly "ime.schemaSwitched": {
        readonly zh: "已切换到「{name}」";
        readonly en: "Switched to {name}";
    };
    readonly "ui.sec.ime": {
        readonly zh: "输入法";
        readonly en: "Input method";
    };
    readonly "ui.ime.hint": {
        readonly zh: "内置输入法在本机运行（RIME），你敲的每个字不经过任何系统或云端输入法；会自动学习词汇并跨设备同步。";
        readonly en: "The built-in IME (RIME) runs on this device; nothing you type passes through a system or cloud IME. It learns vocabulary and syncs it across devices.";
    };
    readonly "ui.ime.schema": {
        readonly zh: "输入方案";
        readonly en: "Scheme";
    };
    readonly "ui.ime.script": {
        readonly zh: "字形";
        readonly en: "Script";
    };
    readonly "ui.ime.script.simp": {
        readonly zh: "简体（默认）";
        readonly en: "Simplified (default)";
    };
    readonly "ui.ime.script.trad": {
        readonly zh: "繁體";
        readonly en: "Traditional";
    };
    readonly "ui.ime.quotes": {
        readonly zh: "引号样式（打字与语音同用）";
        readonly en: "Quote style (typing and voice)";
    };
    readonly "ui.ime.quotes.curly": {
        readonly zh: "弯引号 “ ” ‘ ’（默认）";
        readonly en: "Curly “ ” ‘ ’ (default)";
    };
    readonly "ui.ime.quotes.corner": {
        readonly zh: "方引号 「 」『 』";
        readonly en: "Corner brackets 「 」『 』";
    };
    readonly "ui.ime.softKeyboard": {
        readonly zh: "内置软键盘（本机）";
        readonly en: "Built-in on-screen keyboard (this device)";
    };
    readonly "ui.ime.softKeyboard.auto": {
        readonly zh: "自动（触屏设备上露出；敲了实体键盘就让位）";
        readonly en: "Auto (shown on touch devices; steps aside for a hardware keyboard)";
    };
    readonly "ui.ime.softKeyboard.on": {
        readonly zh: "总是露出";
        readonly en: "Always shown";
    };
    readonly "ui.ime.softKeyboard.off": {
        readonly zh: "不用（只用实体键盘）";
        readonly en: "Off (hardware keyboard only)";
    };
    readonly "kb.space": {
        readonly zh: "空格";
        readonly en: "space";
    };
    readonly "kb.symbols": {
        readonly zh: "123";
        readonly en: "123";
    };
    readonly "kb.more": {
        readonly zh: "#+=";
        readonly en: "#+=";
    };
    readonly "kb.letters": {
        readonly zh: "ABC";
        readonly en: "ABC";
    };
    readonly "kb.enter": {
        readonly zh: "换行 / 确定";
        readonly en: "Return";
    };
    readonly "kb.shift": {
        readonly zh: "上档";
        readonly en: "Shift";
    };
    readonly "kb.hide": {
        readonly zh: "收起键盘";
        readonly en: "Hide keyboard";
    };
    readonly "kb.show": {
        readonly zh: "软键盘";
        readonly en: "On-screen keyboard";
    };
    readonly "kb.prevPage": {
        readonly zh: "上一页候选";
        readonly en: "Previous candidates";
    };
    readonly "kb.nextPage": {
        readonly zh: "更多候选";
        readonly en: "More candidates";
    };
    readonly "ui.ime.useSystem": {
        readonly zh: "改用系统输入法（关闭内置输入法；系统/云端输入法可能上传击键）";
        readonly en: "Use the system IME instead (disables the built-in one; system/cloud IMEs may upload keystrokes)";
    };
    readonly "ime.modeZh": {
        readonly zh: "中";
        readonly en: "中";
    };
    readonly "ime.modeEn": {
        readonly zh: "EN";
        readonly en: "EN";
    };
    readonly "ime.loading": {
        readonly zh: "加载中…";
        readonly en: "Loading…";
    };
    readonly "ime.fallback": {
        readonly zh: "输入法以降级模式运行：{e}";
        readonly en: "IME running in fallback mode: {e}";
    };
    readonly "voice.mic": {
        readonly zh: "语音输入";
        readonly en: "Voice input";
    };
    readonly "voice.recording": {
        readonly zh: "录音中…";
        readonly en: "Recording…";
    };
    readonly "voice.transcribing": {
        readonly zh: "识别中…";
        readonly en: "Transcribing…";
    };
    readonly "voice.failed": {
        readonly zh: "语音失败：{e}";
        readonly en: "Voice failed: {e}";
    };
    readonly "voice.micDenied": {
        readonly zh: "没拿到麦克风权限";
        readonly en: "Microphone permission denied";
    };
    readonly "voice.loadingModel": {
        readonly zh: "加载识别模型…";
        readonly en: "Loading model…";
    };
    readonly "voice.pack.missing": {
        readonly zh: "语音包未下载（点右下角话筒下载）";
        readonly en: "Voice pack not downloaded (tap the mic to download)";
    };
    readonly "voice.pack.missingHint": {
        readonly zh: "语音输入要先下载语音包——点右下角话筒";
        readonly en: "Voice input needs the voice pack first — tap the mic";
    };
    readonly "voice.pack.offerTitle": {
        readonly zh: "下载语音识别模型？";
        readonly en: "Download the speech model?";
    };
    readonly "voice.pack.offerMsg": {
        readonly zh: "{name}，约 {mb} MB，一次下载、离线可用。识别全在本机跑，声音不出设备。";
        readonly en: "{name}, about {mb} MB, downloaded once and works offline. Recognition runs entirely on this device; audio never leaves it.";
    };
    readonly "voice.pack.readyHint": {
        readonly zh: "语音包已就绪——按住左 Ctrl 或点话筒说话";
        readonly en: "Voice pack ready — hold Left Ctrl or tap the mic to talk";
    };
    readonly "voice.pack.none": {
        readonly zh: "未下载（约 {mb} MB，一次下载，离线可用）";
        readonly en: "Not downloaded (~{mb} MB, one-time, works offline)";
    };
    readonly "voice.pack.partial": {
        readonly zh: "下载了一部分（{done}/{total} MB），可续传";
        readonly en: "Partially downloaded ({done}/{total} MB), resumable";
    };
    readonly "voice.pack.ready": {
        readonly zh: "已就绪 · {mb} MB · 本机";
        readonly en: "Ready · {mb} MB · on this device";
    };
    readonly "voice.pack.downloading": {
        readonly zh: "下载并校验中 {done}/{total} MB…";
        readonly en: "Downloading & verifying {done}/{total} MB…";
    };
    readonly "voice.pack.readyToast": {
        readonly zh: "语音包已就绪";
        readonly en: "Voice pack ready";
    };
    readonly "voice.pack.deleted": {
        readonly zh: "语音包已删除";
        readonly en: "Voice pack deleted";
    };
    readonly "voice.pack.failed": {
        readonly zh: "语音包失败：{e}";
        readonly en: "Voice pack failed: {e}";
    };
    readonly "voice.pack.deleteTitle": {
        readonly zh: "删除语音包？";
        readonly en: "Delete voice pack?";
    };
    readonly "voice.pack.deleteMsg": {
        readonly zh: "释放约 {mb} MB；要再用得重新下载。";
        readonly en: "Frees ~{mb} MB; you will need to download it again to use voice.";
    };
    readonly "voice.attr.sensevoice": {
        readonly zh: "识别模型：SenseVoiceSmall（阿里巴巴通义实验室 / FunAudioLLM，FunASR 模型开源协议 v1.1）；运行时 sherpa-onnx（Apache-2.0）。";
        readonly en: "Model: SenseVoiceSmall (Alibaba Tongyi Lab / FunAudioLLM, FunASR Model Open Source License v1.1); runtime sherpa-onnx (Apache-2.0).";
    };
    readonly "voice.attr.zh14m": {
        readonly zh: "识别模型：Streaming Zipformer zh-14M（k2-fsa / icefall，Apache-2.0）；运行时 sherpa-onnx（Apache-2.0）。";
        readonly en: "Model: Streaming Zipformer zh-14M (k2-fsa / icefall, Apache-2.0); runtime sherpa-onnx (Apache-2.0).";
    };
    readonly "auth.signIn": {
        readonly zh: "登录 OneDrive 同步";
        readonly en: "Sign in to OneDrive";
    };
    readonly "auth.signedIn": {
        readonly zh: "已登录";
        readonly en: "Signed in";
    };
    readonly "auth.signedInAs": {
        readonly zh: "已登录 · {name}";
        readonly en: "Signed in · {name}";
    };
    readonly "auth.signOut": {
        readonly zh: "退出";
        readonly en: "Sign out";
    };
    readonly "auth.signOutTitle": {
        readonly zh: "退出登录？";
        readonly en: "Sign out?";
    };
    readonly "auth.signOutMsg": {
        readonly zh: "退出后将停止 OneDrive 同步；本机缓存保留。";
        readonly en: "Cloud sync stops after signing out; the local cache stays.";
    };
    readonly "auth.signedOut": {
        readonly zh: "已退出";
        readonly en: "Signed out";
    };
    readonly "auth.redirecting": {
        readonly zh: "正在跳转到 Microsoft 登录…";
        readonly en: "Redirecting to Microsoft sign-in…";
    };
    readonly "auth.signInFailed": {
        readonly zh: "登录失败：{e}";
        readonly en: "Sign-in failed: {e}";
    };
    readonly "auth.lockCrypto": {
        readonly zh: "锁定加密";
        readonly en: "Lock encryption";
    };
    readonly "auth.lockCryptoHint": {
        readonly zh: "清除内存中的密码";
        readonly en: "Forget the password held in memory";
    };
    readonly "auth.readyTitle": {
        readonly zh: "已保存到本机，去登录？";
        readonly en: "Saved on this device — sign in now?";
    };
    readonly "auth.readyMsg": {
        readonly zh: "接下来会跳到 Microsoft 登录页，登录后自动回来。";
        readonly en: "Next you'll go to the Microsoft sign-in page and come back automatically.";
    };
    readonly "auth.go": {
        readonly zh: "去登录";
        readonly en: "Sign in";
    };
    readonly "auth.later": {
        readonly zh: "暂不";
        readonly en: "Not now";
    };
    readonly "auth.flushFailed": {
        readonly zh: "本机落盘失败，未跳转登录（看诊断日志）";
        readonly en: "Local save failed — not redirecting (see diagnostics)";
    };
    readonly "auth.expired": {
        readonly zh: "云端登录已过期，点云图标重新登录";
        readonly en: "Cloud sign-in expired — tap the cloud icon to sign in again";
    };
    readonly "settings.forceUpdateTitle": {
        readonly zh: "强制更新？";
        readonly en: "Force update?";
    };
    readonly "settings.forceUpdating": {
        readonly zh: "正在清缓存并重启…";
        readonly en: "Clearing cache and restarting…";
    };
    readonly "settings.forceUpdated": {
        readonly zh: "已清缓存重启 · {v}";
        readonly en: "Cache cleared and restarted · {v}";
    };
    readonly "settings.forceUpdateMsg": {
        readonly zh: "清掉 app 壳缓存并重启；文档缓存不受影响。需要联网。";
        readonly en: "Clears the app shell cache and restarts; document cache is untouched. Requires network.";
    };
    readonly "settings.diagEmpty": {
        readonly zh: "（没有记录）";
        readonly en: "(nothing logged)";
    };
    readonly "diag.copy": {
        readonly zh: "复制";
        readonly en: "Copy";
    };
    readonly "diag.share": {
        readonly zh: "分享 .txt";
        readonly en: "Share .txt";
    };
    readonly "diag.download": {
        readonly zh: "下载 .txt";
        readonly en: "Download .txt";
    };
    readonly "diag.clear": {
        readonly zh: "清空";
        readonly en: "Clear";
    };
    readonly "diag.copied": {
        readonly zh: "已复制 {n} 条诊断日志";
        readonly en: "Copied {n} log lines";
    };
    readonly "diag.copyFailed": {
        readonly zh: "复制失败：已选中文本，请长按拷贝";
        readonly en: "Copy failed — text selected, long-press to copy";
    };
    readonly "diag.cleared": {
        readonly zh: "诊断日志已清空";
        readonly en: "Diagnostics cleared";
    };
    readonly "diag.downloaded": {
        readonly zh: "已下载 {name}";
        readonly en: "Downloaded {name}";
    };
    readonly "diag.shareFailed": {
        readonly zh: "分享失败";
        readonly en: "Share failed";
    };
    readonly "ui.idleAria": {
        readonly zh: "已闲置";
        readonly en: "Idle";
    };
    readonly "ui.busyAria": {
        readonly zh: "处理中";
        readonly en: "Working";
    };
    readonly "ui.buildTitle": {
        readonly zh: "构建版本";
        readonly en: "Build";
    };
    readonly "ui.factoryReset": {
        readonly zh: "还原出厂设置（清本机全部数据）…";
        readonly en: "Factory reset (wipe all local data)…";
    };
    readonly "fr.introTitle": {
        readonly zh: "还原出厂设置";
        readonly en: "Factory reset";
    };
    readonly "fr.introMsg": {
        readonly zh: "删除这台设备上的全部本地数据：稿件缓存、设置、密码记忆、输入法词典缓存、语音模型包、app 缓存。OneDrive 上的稿不受影响，登录后会重新拉回。";
        readonly en: "Deletes all local data on this device: draft cache, settings, remembered password, IME dictionary cache, voice model pack, app cache. Drafts on OneDrive are untouched and come back after sign-in.";
    };
    readonly "fr.needOnline": {
        readonly zh: "还原出厂要联网（清掉缓存后需要重新下载 app）";
        readonly en: "Factory reset needs a network connection (the app is re-downloaded afterwards)";
    };
    readonly "fr.needSync": {
        readonly zh: "有 {n} 篇未同步到云端的稿，先登录并同步再还原（不造逃生副本）";
        readonly en: "{n} draft(s) not synced to the cloud — sign in and sync first (no escape copies are made)";
    };
    readonly "fr.consentPhrase": {
        readonly zh: "删除全部本地数据";
        readonly en: "DELETE ALL LOCAL DATA";
    };
    readonly "fr.consentPrompt": {
        readonly zh: "输入「{phrase}」以确认（逐字）";
        readonly en: "Type \"{phrase}\" to confirm (exactly)";
    };
    readonly "fr.mismatch": {
        readonly zh: "输入不匹配，已取消";
        readonly en: "Input didn't match — cancelled";
    };
    readonly "fr.blocked": {
        readonly zh: "有 {n} 个库被其他标签页占用——关闭其他小黑屋标签页后重试";
        readonly en: "{n} database(s) are held open by another tab — close other tabs and retry";
    };
    readonly "fr.doneClean": {
        readonly zh: "已清空并验证归零（{db} 个库 / {ls} 个键 / {caches} 个缓存）。即将重新加载。";
        readonly en: "Wiped and verified zero residue ({db} databases / {ls} keys / {caches} caches). Reloading.";
    };
    readonly "fr.residue": {
        readonly zh: "清理完成但扫到 {n} 处残留——重新加载后可再跑一次";
        readonly en: "Wiped, but {n} residue item(s) remain — reload and run again";
    };
    readonly "project.new": {
        readonly zh: "新建书…";
        readonly en: "New book…";
    };
    readonly "project.newTitle": {
        readonly zh: "新建书";
        readonly en: "New book";
    };
    readonly "project.newHint": {
        readonly zh: "一本书 = 一个 zip：里面是一堆章节（txt）和它们之间的边。文件名只是管理用（OneDrive 上可见），撞名自动加序号。";
        readonly en: "A book is one zip: a pile of chapters (txt) and the edges between them. The file name is just a handle (visible on OneDrive); a clash gets a number.";
    };
    readonly "project.newEncrypt": {
        readonly zh: "加密这本书（建好即封，先要密码）";
        readonly en: "Encrypt this book (sealed on creation; asks for the password first)";
    };
    readonly "project.encryptSkipped": {
        readonly zh: "没设密码，这本书先是明文——顶栏锁钮随时可加密";
        readonly en: "No password set — the book stays plain for now; the lock button in the top bar can encrypt it any time";
    };
    readonly "project.defaultName": {
        readonly zh: "作品";
        readonly en: "Work";
    };
    readonly "project.firstPage": {
        readonly zh: "目录";
        readonly en: "Contents";
    };
    readonly "project.created": {
        readonly zh: "已新建书 {name}";
        readonly en: "Book {name} created";
    };
    readonly "project.createFailed": {
        readonly zh: "新建书失败：{e}";
        readonly en: "Could not create the book: {e}";
    };
    readonly "project.openLocal": {
        readonly zh: "打开本机的书…";
        readonly en: "Open a local book…";
    };
    readonly "project.localWriteBack": {
        readonly zh: "本机的书：保存写回原文件";
        readonly en: "Local book: saves write back to the file";
    };
    readonly "project.localDownloadOnly": {
        readonly zh: "本机的书：改动只在内存，用保存钮下载一份";
        readonly en: "Local book: edits live in memory; use Save to download a copy";
    };
    readonly "project.localRenameHint": {
        readonly zh: "本机的书的文件名在磁盘上自己改";
        readonly en: "Rename a local book on disk yourself";
    };
    readonly "project.writeBackDenied": {
        readonly zh: "浏览器没让写回文件——点一下保存钮，在弹出的授权里选「允许」";
        readonly en: "The browser did not allow writing the file back — tap Save and choose Allow in the prompt";
    };
    readonly "project.saved": {
        readonly zh: "已写回";
        readonly en: "Written back";
    };
    readonly "project.downloaded": {
        readonly zh: "已下载一份";
        readonly en: "Downloaded a copy";
    };
    readonly "project.tooNew": {
        readonly zh: "这本书是更新版本的小黑屋写的（格式 v{v}），本版只读不覆盖";
        readonly en: "This book was written by a newer WebXiaoHeiWu (format v{v}); read-only here, never overwritten";
    };
    readonly "project.corrupt": {
        readonly zh: "这本书的文件坏了，打不开（zip 或 graph.json 不对）";
        readonly en: "The book file is damaged (bad zip or graph.json)";
    };
    readonly "project.notProject": {
        readonly zh: "这个 zip 不是本版小黑屋的书：没有 graph.json / pages/，或是 v2 之前的旧格式（本版只读 v2，不读也不覆盖旧书）";
        readonly en: "This zip is not a book this version reads: no graph.json / pages/, or a pre-v2 format (only v2 is read; old books are neither read nor overwritten)";
    };
    readonly "lift.entry": {
        readonly zh: "把这篇变成书…";
        readonly en: "Turn this draft into a book…";
    };
    readonly "lift.title": {
        readonly zh: "变成书";
        readonly en: "Turn into a book";
    };
    readonly "lift.hint": {
        readonly zh: "这篇稿的正文成为新书的第一页（页名 = 稿名）。原稿留在书库里，不要了再送回收站。";
        readonly en: "This draft's text becomes the first page of a new book (page name = draft name). The draft stays in the library; trash it later if you don't want it.";
    };
    readonly "lift.needText": {
        readonly zh: "先写点东西再变成书";
        readonly en: "Write something first";
    };
    readonly "lift.done": {
        readonly zh: "已变成书「{name}」；原稿还在书库里";
        readonly en: "Now a book: “{name}”. The draft is still in the library";
    };
    readonly "lift.doneEncrypted": {
        readonly zh: "已变成书「{name}」并加密（原稿是加密的）；原稿还在书库里";
        readonly en: "Now a book: “{name}”, encrypted like the draft. The draft is still in the library";
    };
    readonly "lift.failed": {
        readonly zh: "变成书失败：{e}";
        readonly en: "Could not turn into a book: {e}";
    };
    readonly "st.lastOpenFailed": {
        readonly zh: "上次打开的「{name}」现在打不开，先给你一张新稿；它还在书库里";
        readonly en: "“{name}” from last time can’t be opened right now — here’s a new draft; it is still in the library";
    };
    readonly "project.unavailable": {
        readonly zh: "本地没有这本书，云端也拿不到";
        readonly en: "Book not available locally, and the cloud is unreachable";
    };
    readonly "edge.aria": {
        readonly zh: "侧栏";
        readonly en: "Sidebar";
    };
    readonly "top.addPage": {
        readonly zh: "这一页…（加页 / 挪到）";
        readonly en: "This page… (add / move)";
    };
    readonly "edge.back": {
        readonly zh: "回到上一页";
        readonly en: "Back to the previous page";
    };
    readonly "edge.forward": {
        readonly zh: "前进（回退之后再回去）";
        readonly en: "Forward (after going back)";
    };
    readonly "edge.search": {
        readonly zh: "检索";
        readonly en: "Search";
    };
    readonly "edge.searchPh": {
        readonly zh: "检索";
        readonly en: "Search";
    };
    readonly "edge.results": {
        readonly zh: "检索「{q}」";
        readonly en: "Results for “{q}”";
    };
    readonly "edge.noResults": {
        readonly zh: "没有";
        readonly en: "Nothing";
    };
    readonly "edge.noLinks": {
        readonly zh: "还没有链接";
        readonly en: "No links yet";
    };
    readonly "edge.spawnTitle": {
        readonly zh: "分裂出去的页叫什么";
        readonly en: "Name the split-off page";
    };
    readonly "edge.spawnHint": {
        readonly zh: "选中的字会移进这一新页，当前页指向它。";
        readonly en: "The selection moves into the new page, linked from here.";
    };
    readonly "edge.spawnNoSelection": {
        readonly zh: "先在正文里选中一段字";
        readonly en: "Select some text first";
    };
    readonly "edge.namePh": {
        readonly zh: "名字";
        readonly en: "name";
    };
    readonly "edge.badName": {
        readonly zh: "名字不合法（不能有 / 之类的路径字符，不能以点开头）";
        readonly en: "Invalid name (no path characters like /, no leading dot)";
    };
    readonly "edge.purge": {
        readonly zh: "彻底删除";
        readonly en: "Delete for good";
    };
    readonly "edge.unlink": {
        readonly zh: "断开链接";
        readonly en: "Unlink";
    };
    readonly "edge.unlinked": {
        readonly zh: "已断开到「{name}」的链接（那页还在）";
        readonly en: "Unlinked “{name}” (the page stays)";
    };
    readonly "edge.discardPrefix": {
        readonly zh: "_废-";
        readonly en: "_dropped-";
    };
    readonly "edge.discard": {
        readonly zh: "废弃";
        readonly en: "Discard";
    };
    readonly "edge.discardTitle": {
        readonly zh: "废弃「{name}」？";
        readonly en: "Discard “{name}”?";
    };
    readonly "edge.discardTitleTree": {
        readonly zh: "废弃「{name}」及其 {n} 个子节？";
        readonly en: "Discard “{name}” and its {n} child page(s)?";
    };
    readonly "edge.discardMsg": {
        readonly zh: "改名为「{prefix}…」沉到底；正文不删，检索能找到，之后可彻底删除。";
        readonly en: "Renamed “{prefix}…” and sunk to the bottom; text is kept, search still finds it, and it can be deleted for good later.";
    };
    readonly "edge.discardMsgTree": {
        readonly zh: "这一支从主干拿掉，{n} 个子节各自也改名「{prefix}…」（删容器 = 删内容）；正文都不删，之后可逐页彻底删除。";
        readonly en: "This branch leaves the trunk and each of its {n} child page(s) is renamed “{prefix}…” too (deleting the container deletes the contents); no text is removed, and each can be deleted for good later.";
    };
    readonly "edge.discarded": {
        readonly zh: "已废弃：「{from}」→「{to}」";
        readonly en: "Discarded: “{from}” → “{to}”";
    };
    readonly "edge.discardedTree": {
        readonly zh: "已废弃「{name}」及其 {n} 个子节（都改名「{prefix}…」）";
        readonly en: "Discarded “{name}” and its {n} child page(s) (all renamed “{prefix}…”)";
    };
    readonly "edge.purgeTitle": {
        readonly zh: "彻底删除「{name}」？";
        readonly en: "Delete “{name}” for good?";
    };
    readonly "edge.purgeMsg": {
        readonly zh: "{n} 页链接到它，那些链接会被移除。正文就没了，书里没有回收站。";
        readonly en: "{n} page(s) link to it; those links will be removed. Its text will be gone; there is no trash inside a book.";
    };
    readonly "edge.purgeMsgNoLinks": {
        readonly zh: "没有页链接到它。正文就没了，书里没有回收站。";
        readonly en: "No page links to it. Its text will be gone; there is no trash inside a book.";
    };
    readonly "edge.notDiscarded": {
        readonly zh: "只有「{prefix}」开头的页能彻底删除——先废弃";
        readonly en: "Only pages starting with “{prefix}” can be deleted for good — discard it first";
    };
    readonly "edge.detached": {
        readonly zh: "已移出树：「{name}」成了散页，{n} 页改为链接";
        readonly en: "Out of the tree: “{name}” is loose now; {n} page(s) turned into links";
    };
    readonly "edge.detachedLeaf": {
        readonly zh: "已移出树：「{name}」成了散页";
        readonly en: "Out of the tree: “{name}” is loose now";
    };
    readonly "edge.lockedHint": {
        readonly zh: "这本书是只读的，先点顶栏的笔解除";
        readonly en: "This book is read-only — tap the pen in the top bar to unlock";
    };
    readonly "edge.download": {
        readonly zh: "下载一份";
        readonly en: "Download a copy";
    };
    readonly "edge.more": {
        readonly zh: "更多";
        readonly en: "More";
    };
    readonly "edge.up": {
        readonly zh: "上移";
        readonly en: "Move up";
    };
    readonly "edge.down": {
        readonly zh: "下移";
        readonly en: "Move down";
    };
    readonly "edge.nameTaken": {
        readonly zh: "已有同名的页";
        readonly en: "A page with that name already exists";
    };
    readonly "edge.title.ph": {
        readonly zh: "页名";
        readonly en: "Page name";
    };
    readonly "edge.title.aria": {
        readonly zh: "页名（改了就是改名）";
        readonly en: "Page name (edit to rename)";
    };
    readonly "sidebar.library": {
        readonly zh: "书库";
        readonly en: "Library";
    };
    readonly "edge.settingsBack": {
        readonly zh: "回到侧栏";
        readonly en: "Back to the sidebar";
    };
    readonly "edge.times": {
        readonly zh: "创建 {created} · 修改 {modified}";
        readonly en: "Created {created} · modified {modified}";
    };
    readonly "edge.parentTitle": {
        readonly zh: "父页：{name}";
        readonly en: "Parent: {name}";
    };
    readonly "edge.root": {
        readonly zh: "书";
        readonly en: "Book";
    };
    readonly "edge.rootTitle": {
        readonly zh: "这一层就是书的顶层";
        readonly en: "This is the book’s top level";
    };
    readonly "edge.siblings": {
        readonly zh: "兄弟";
        readonly en: "Siblings";
    };
    readonly "edge.children": {
        readonly zh: "子节";
        readonly en: "Children";
    };
    readonly "edge.links": {
        readonly zh: "链接";
        readonly en: "Links";
    };
    readonly "edge.addSibling": {
        readonly zh: "加兄弟页";
        readonly en: "Add a sibling";
    };
    readonly "edge.addChild": {
        readonly zh: "加子节";
        readonly en: "Add a child";
    };
    readonly "edge.addSiblingTitle": {
        readonly zh: "兄弟页叫什么";
        readonly en: "Name the sibling page";
    };
    readonly "edge.addChildTitle": {
        readonly zh: "子节叫什么";
        readonly en: "Name the child page";
    };
    readonly "edge.addSiblingHint": {
        readonly zh: "新页放到这页之后。打已有页的名字 = 把那页归档到这里。";
        readonly en: "The new page goes right after this one. An existing page’s name = file that page here.";
    };
    readonly "edge.addChildHint": {
        readonly zh: "新页放到这页之下（末尾）。打已有页的名字 = 把那页归档到这里。";
        readonly en: "The new page goes under this one (at the end). An existing page’s name = file that page here.";
    };
    readonly "edge.addLooseHint": {
        readonly zh: "打已有页的名字 = 从这里连过去。";
        readonly en: "An existing page’s name = link to it from here.";
    };
    readonly "edge.outdent": {
        readonly zh: "升级（出到上一层）";
        readonly en: "Promote (out one level)";
    };
    readonly "edge.indent": {
        readonly zh: "降级（进到上一个兄弟之下）";
        readonly en: "Demote (under the previous sibling)";
    };
    readonly "edge.detach": {
        readonly zh: "移出树（变散页）";
        readonly en: "Take out of the tree (loose page)";
    };
    readonly "edge.archiveAfter": {
        readonly zh: "归档到这页之后";
        readonly en: "File after this page";
    };
    readonly "edge.archiveUnder": {
        readonly zh: "归档到这页之下";
        readonly en: "File under this page";
    };
    readonly "edge.moveTo": {
        readonly zh: "挪到…";
        readonly en: "Move to…";
    };
    readonly "edge.moveTitle": {
        readonly zh: "把「{name}」挪到…";
        readonly en: "Move “{name}” to…";
    };
    readonly "edge.moveHintTree": {
        readonly zh: "它下面的 {n} 个子节跟着一起挪。";
        readonly en: "Its {n} child page(s) move with it.";
    };
    readonly "edge.movePh": {
        readonly zh: "搜页名或正文";
        readonly en: "Search page names or text";
    };
    readonly "edge.moveRootEnd": {
        readonly zh: "书的末尾（顶层）";
        readonly en: "End of the book (top level)";
    };
    readonly "edge.movePutHere": {
        readonly zh: "放到这里";
        readonly en: "Put it here";
    };
    readonly "edge.moveUnder": {
        readonly zh: "放到它之下";
        readonly en: "Put it under this page";
    };
    readonly "edge.moveAfter": {
        readonly zh: "放到它之后";
        readonly en: "Put it after this page";
    };
    readonly "edge.movedUnder": {
        readonly zh: "已把「{name}」挪到「{to}」之下";
        readonly en: "Moved “{name}” under “{to}”";
    };
    readonly "edge.movedAfter": {
        readonly zh: "已把「{name}」挪到「{to}」之后";
        readonly en: "Moved “{name}” after “{to}”";
    };
    readonly "edge.movedEnd": {
        readonly zh: "已把「{name}」挪到书的末尾";
        readonly en: "Moved “{name}” to the end of the book";
    };
    readonly "edge.exportBranch": {
        readonly zh: "导出这一支…";
        readonly en: "Export this branch…";
    };
    readonly "edge.moveNoop": {
        readonly zh: "已经到头了，没动";
        readonly en: "Already at the edge; nothing moved";
    };
    readonly "edge.archived": {
        readonly zh: "已归档「{name}」";
        readonly en: "Filed “{name}”";
    };
    readonly "edge.alreadyInTree": {
        readonly zh: "「{name}」已在书的主干里，位置没动";
        readonly en: "“{name}” is already in the trunk; its place was kept";
    };
    readonly "edge.noSuchPage": {
        readonly zh: "没有这一页";
        readonly en: "No such page";
    };
    readonly "edge.exportTitle": {
        readonly zh: "导出「{name}」这一支";
        readonly en: "Export the branch “{name}”";
    };
    readonly "edge.exportHint": {
        readonly zh: "这页和它下面的所有页按目录顺序拼成一篇 txt（只拼正文页）。";
        readonly en: "This page and everything under it, in table-of-contents order, joined into one txt (text pages only).";
    };
    readonly "edge.exportSave": {
        readonly zh: "存进书库";
        readonly en: "Save to library";
    };
    readonly "edge.exportDownload": {
        readonly zh: "下载一份";
        readonly en: "Download a copy";
    };
    readonly "edge.exportDone": {
        readonly zh: "已导出为「{name}」";
        readonly en: "Exported as “{name}”";
    };
    readonly "edge.exportFailed": {
        readonly zh: "导出失败：{e}";
        readonly en: "Export failed: {e}";
    };
    readonly "edge.prev": {
        readonly zh: "上一页";
        readonly en: "Previous page";
    };
    readonly "edge.next": {
        readonly zh: "下一页";
        readonly en: "Next page";
    };
    readonly "edge.pageNav": {
        readonly zh: "上一页 / 下一页（沿目录顺序）";
        readonly en: "Previous / next page (table-of-contents order)";
    };
    readonly "sidebar.export": {
        readonly zh: "导出";
        readonly en: "Export";
    };
    readonly "sidebar.exportTitle": {
        readonly zh: "导出：复制文字 / 长图";
        readonly en: "Export: copy text / long image";
    };
    readonly "copy.done": {
        readonly zh: "已复制全页：{cjk} 字 {en} 词";
        readonly en: "Copied the whole page: {cjk} chars · {en} words";
    };
    readonly "copy.doneImage": {
        readonly zh: "已复制这张图";
        readonly en: "Image copied";
    };
    readonly "copy.empty": {
        readonly zh: "这一页是空的，没什么可复制";
        readonly en: "This page is empty — nothing to copy";
    };
    readonly "copy.locked": {
        readonly zh: "已锁定，先解锁再复制";
        readonly en: "Locked — unlock first to copy";
    };
    readonly "copy.failed": {
        readonly zh: "复制失败：{e}";
        readonly en: "Copy failed: {e}";
    };
    readonly "copy.imageUnsupported": {
        readonly zh: "这个浏览器不支持把图片复制到剪贴板";
        readonly en: "This browser can’t copy images to the clipboard";
    };
    readonly "export.title": {
        readonly zh: "导出";
        readonly en: "Export";
    };
    readonly "export.scope.page": {
        readonly zh: "这一页";
        readonly en: "This page";
    };
    readonly "export.scope.branch": {
        readonly zh: "这一支";
        readonly en: "This branch";
    };
    readonly "export.scope.book": {
        readonly zh: "整本";
        readonly en: "Whole book";
    };
    readonly "export.fmt.text": {
        readonly zh: "复制文字";
        readonly en: "Copy text";
    };
    readonly "export.fmt.copyImage": {
        readonly zh: "复制图片";
        readonly en: "Copy image";
    };
    readonly "export.fmt.image": {
        readonly zh: "长图";
        readonly en: "Long image";
    };
    readonly "export.fmt.pdf": {
        readonly zh: "PDF";
        readonly en: "PDF";
    };
    readonly "export.widthLabel": {
        readonly zh: "长图 / PDF 每行字数";
        readonly en: "Long image / PDF characters per line";
    };
    readonly "export.fontLabel": {
        readonly zh: "长图 / PDF 字体";
        readonly en: "Long image / PDF font";
    };
    readonly "export.font.sans": {
        readonly zh: "黑体";
        readonly en: "Sans";
    };
    readonly "export.font.pinyin": {
        readonly zh: "拼音";
        readonly en: "Pinyin";
    };
    readonly "export.fontLoading": {
        readonly zh: "取拼音字体（12 MB，取过就不用再取）…";
        readonly en: "Fetching the pinyin font (12 MB, cached afterwards)…";
    };
    readonly "export.fontFailed": {
        readonly zh: "拼音字体没取到：第一次用要联网";
        readonly en: "Couldn’t fetch the pinyin font: the first use needs a connection";
    };
    readonly "pdf.readyShapeSkipped": {
        readonly zh: "这款字体有一部分选读音的规则本 app 不认识，个别多音字的拼音可能不对";
        readonly en: "Some of this font’s reading-selection rules aren’t supported here; a few polyphone readings may be wrong";
    };
    readonly "export.stamp": {
        readonly zh: "{time} 导出";
        readonly en: "exported {time}";
    };
    readonly "export.partCover": {
        readonly zh: "封面：{name}";
        readonly en: "Cover: {name}";
    };
    readonly "export.partCoverNone": {
        readonly zh: "封面：无（可以选一张图片页）";
        readonly en: "Cover: none (pick an image page)";
    };
    readonly "export.partCoverTitle": {
        readonly zh: "导出「{name}」时的封面";
        readonly en: "Cover for exporting “{name}”";
    };
    readonly "export.partCoverMsg": {
        readonly zh: "只在导出这一页 / 这一支时用，长图和 PDF 都有效；封面上印这一页的名字。整本的封面还是在图片页上点「设为封面」。";
        readonly en: "Used only when exporting this page / this branch, for both long image and PDF; the cover carries this page’s name. The whole book’s cover is still set on an image page.";
    };
    readonly "export.partCoverPh": {
        readonly zh: "找图片页…";
        readonly en: "Find an image page…";
    };
    readonly "export.partCoverNoneRow": {
        readonly zh: "不要封面";
        readonly en: "No cover";
    };
    readonly "export.partCoverUse": {
        readonly zh: "用作封面";
        readonly en: "Use as cover";
    };
    readonly "export.partCoverClear": {
        readonly zh: "不要封面";
        readonly en: "No cover";
    };
    readonly "export.embedText": {
        readonly zh: "长图里附上文字（和「复制文字」同一份，藏在图片文件里）";
        readonly en: "Attach the text inside the long image file (same as Copy text)";
    };
    readonly "export.scopeStats": {
        readonly zh: "{cjk} 字 {en} 词 · {pages} 页正文";
        readonly en: "{cjk} chars · {en} words · {pages} text pages";
    };
    readonly "export.pdfPages": {
        readonly zh: "PDF 约 {n} 页";
        readonly en: "PDF ≈ {n} pages";
    };
    readonly "export.scopeStatsImages": {
        readonly zh: " · {images} 张图";
        readonly en: " · {images} images";
    };
    readonly "copy.doneScope": {
        readonly zh: "已复制 {pages} 页：{cjk} 字 {en} 词";
        readonly en: "Copied {pages} pages: {cjk} chars · {en} words";
    };
    readonly "export.making": {
        readonly zh: "生成长图…";
        readonly en: "Making the long image…";
    };
    readonly "export.readyTitle": {
        readonly zh: "长图好了：{n} 张";
        readonly en: "Long image ready: {n}";
    };
    readonly "export.readyMsg": {
        readonly zh: "{cjk} 字 {en} 词 · {pages} 页正文 · {images} 张图 · 共 {size}";
        readonly en: "{cjk} chars · {en} words · {pages} text pages · {images} images · {size} total";
    };
    readonly "export.tooTallTitle": {
        readonly zh: "长图太高了";
        readonly en: "The long image is too tall";
    };
    readonly "export.tooTallMsg": {
        readonly zh: "一整张约 {screens} 屏高（{cjk} 字），超过单张上限 {max} px（约 {maxScreens} 屏；再高手机相册 / 微信可能打不开）。切成几张？";
        readonly en: "One image would be about {screens} screens tall ({cjk} chars), past the single-image limit of {max} px (about {maxScreens} screens; taller images may not open in Photos / WeChat). Split how?";
    };
    readonly "export.sliceCap": {
        readonly zh: "切成 {n} 张（每张最多约 {s} 屏）";
        readonly en: "Split into {n} (≤ ~{s} screens each)";
    };
    readonly "export.sliceSocial": {
        readonly zh: "切成 {n} 张（每张约 3 屏，朋友圈 / 小红书）";
        readonly en: "Split into {n} (~3 screens each, for feeds)";
    };
    readonly "export.share": {
        readonly zh: "分享…";
        readonly en: "Share…";
    };
    readonly "export.download": {
        readonly zh: "下载";
        readonly en: "Download";
    };
    readonly "export.copyPng": {
        readonly zh: "复制到剪贴板";
        readonly en: "Copy to clipboard";
    };
    readonly "export.shared": {
        readonly zh: "已分享";
        readonly en: "Shared";
    };
    readonly "export.downloaded": {
        readonly zh: "已下载 {n} 张";
        readonly en: "Downloaded {n}";
    };
    readonly "export.copied": {
        readonly zh: "已复制长图";
        readonly en: "Long image copied";
    };
    readonly "export.sliceLabel": {
        readonly zh: "{i} / {n}";
        readonly en: "{i} / {n}";
    };
    readonly "export.empty": {
        readonly zh: "没有可导出的内容";
        readonly en: "Nothing to export";
    };
    readonly "export.locked": {
        readonly zh: "已锁定，先解锁再导出";
        readonly en: "Locked — unlock first to export";
    };
    readonly "export.failed": {
        readonly zh: "长图生成失败：{e}";
        readonly en: "Long image failed: {e}";
    };
    readonly "img.isCover": {
        readonly zh: "当前封面";
        readonly en: "Current cover";
    };
    readonly "edge.hide": {
        readonly zh: "隐藏（不出门）";
        readonly en: "Hide (keep out of exports)";
    };
    readonly "edge.unhide": {
        readonly zh: "取消隐藏";
        readonly en: "Unhide";
    };
    readonly "edge.hiddenTip": {
        readonly zh: "隐藏：这一页和它的子节不出门（导出 / 长图 / 字数）";
        readonly en: "Hidden: this page and its children stay out of exports and word counts";
    };
    readonly "edge.hiddenBy": {
        readonly zh: "由「{name}」隐藏，到那一页取消";
        readonly en: "Hidden by “{name}” — unhide it there";
    };
    readonly "edge.hiddenDone": {
        readonly zh: "已隐藏「{name}」（连同子节不出门）";
        readonly en: "Hidden “{name}” (with its children)";
    };
    readonly "edge.unhiddenDone": {
        readonly zh: "「{name}」已取消隐藏";
        readonly en: "“{name}” is visible again";
    };
    readonly "pdf.making": {
        readonly zh: "生成 PDF…";
        readonly en: "Making the PDF…";
    };
    readonly "pdf.readyTitle": {
        readonly zh: "PDF 好了：{pages} 页";
        readonly en: "PDF ready: {pages} pages";
    };
    readonly "pdf.readyMsg": {
        readonly zh: "{cjk} 字 {en} 词 · {size} · 字体 {font}";
        readonly en: "{cjk} chars · {en} words · {size} · font {font}";
    };
    readonly "pdf.readyMissing": {
        readonly zh: "{n} 个字这款字体里没有，印成了方框：{chars}";
        readonly en: "{n} characters are not in this font and print as boxes: {chars}";
    };
    readonly "pdf.fontTitle": {
        readonly zh: "PDF 要嵌一款字体";
        readonly en: "A PDF needs an embedded font";
    };
    readonly "pdf.fontMsg": {
        readonly zh: "内置字体还没装。先选一个本机的 TrueType 字体文件（.ttf）——这次打开期间一直用它；字体只在你的设备上读，不上传、不保存。";
        readonly en: "The built-in font isn’t installed yet. Pick a TrueType font file (.ttf) from this device — it’s used until you close the app; the font is only read on your device, never uploaded or stored.";
    };
    readonly "pdf.fontPick": {
        readonly zh: "选字体文件…";
        readonly en: "Choose a font file…";
    };
    readonly "pdf.fontBad": {
        readonly zh: "这个字体文件用不了：要 TrueType 轮廓的 .ttf（不支持 .otf / CFF）";
        readonly en: "This font file can’t be used: a TrueType-outline .ttf is required (.otf / CFF is not supported)";
    };
    readonly "pdf.failed": {
        readonly zh: "PDF 生成失败：{e}";
        readonly en: "PDF failed: {e}";
    };
    readonly "kin.parentTitle": {
        readonly zh: "回到上一级：{name}";
        readonly en: "Up to “{name}”";
    };
    readonly "gal.aria": {
        readonly zh: "书库";
        readonly en: "Library";
    };
    readonly "gal.title": {
        readonly zh: "书库";
        readonly en: "Library";
    };
    readonly "gal.editedAt": {
        readonly zh: "上次编辑 {time}";
        readonly en: "Last edited {time}";
    };
    readonly "gal.back": {
        readonly zh: "回到编辑器";
        readonly en: "Back to editor";
    };
    readonly "gal.new": {
        readonly zh: "新建";
        readonly en: "New";
    };
    readonly "gal.trash": {
        readonly zh: "回收站";
        readonly en: "Trash";
    };
    readonly "gal.settings": {
        readonly zh: "设置";
        readonly en: "Settings";
    };
    readonly "gal.trashBack": {
        readonly zh: "回到文件";
        readonly en: "Back to files";
    };
    readonly "gal.aside": {
        readonly zh: "回收站和备份箱";
        readonly en: "Trash and backups";
    };
    readonly "gal.backup": {
        readonly zh: "备份箱";
        readonly en: "Backups";
    };
    readonly "gal.empty": {
        readonly zh: "清空";
        readonly en: "Empty";
    };
    readonly "gal.emptyTrash": {
        readonly zh: "清空回收站";
        readonly en: "Empty trash";
    };
    readonly "gal.emptyBackup": {
        readonly zh: "清空备份箱";
        readonly en: "Empty backups";
    };
    readonly "gal.emptyWhich": {
        readonly zh: "清空哪一端";
        readonly en: "Empty which side";
    };
    readonly "gal.emptyLocal": {
        readonly zh: "只清本机";
        readonly en: "Local only";
    };
    readonly "gal.emptyCloud": {
        readonly zh: "只清云端";
        readonly en: "Cloud only";
    };
    readonly "gal.emptyBoth": {
        readonly zh: "两端都清";
        readonly en: "Both";
    };
    readonly "galx.emptyNone": {
        readonly zh: "还没有稿。点「新建」开始写，或打开本机的书。";
        readonly en: "No documents yet. Tap New to start writing, or open a local book.";
    };
    readonly "galx.emptyFolder": {
        readonly zh: "「{f}」是空的";
        readonly en: "“{f}” is empty";
    };
    readonly "galx.emptyTrash": {
        readonly zh: "回收站是空的";
        readonly en: "Trash is empty";
    };
    readonly "galx.firstFrameFailed": {
        readonly zh: "书库读取失败（详见诊断日志）";
        readonly en: "Library failed to load (see diagnostics)";
    };
    readonly "galx.firstFrameTimeout": {
        readonly zh: "书库读取超时：本地存储没有响应";
        readonly en: "Library timed out: local storage did not respond";
    };
    readonly "galx.openActive": {
        readonly zh: "这篇正开着——先回到书库再{verb}";
        readonly en: "This one is open — go back to the library first, then {verb}";
    };
    readonly "galx.folderNeedSignin": {
        readonly zh: "书库离线（未登录或权限失效），无法新建文件夹";
        readonly en: "Library is offline (not signed in or access expired); cannot create a folder";
    };
    readonly "galx.quotaCritical": {
        readonly zh: "本地存储 {pct}% 已满——立即去书库卸载不常用的稿";
        readonly en: "Local storage is {pct}% full — unload rarely used documents from the library now";
    };
    readonly "edge.setTime": {
        readonly zh: "改时间…";
        readonly en: "Set time…";
    };
    readonly "edge.setTimeTitle": {
        readonly zh: "「{name}」的修改时间";
        readonly en: "Modified time of “{name}”";
    };
    readonly "edge.setTimeHint": {
        readonly zh: "整理旧书用：写成 2026-09-26 14:30，或只写日期 2026-09-26 / 20260926（当天中午）。侧栏小字和检索排序用的就是它。";
        readonly en: "For tidying old books: 2026-09-26 14:30, or just a date like 2026-09-26 / 20260926 (noon). The sidebar's small print and search order use it.";
    };
    readonly "edge.setTimeBad": {
        readonly zh: "看不懂这个时间；写成 2026-09-26 14:30 或 20260926";
        readonly en: "Couldn't read that time; use 2026-09-26 14:30 or 20260926";
    };
    readonly "edge.setTimeDone": {
        readonly zh: "「{name}」的修改时间 → {time}";
        readonly en: "“{name}” modified time → {time}";
    };
    readonly "edge.orphans": {
        readonly zh: "孤儿页 · {n}";
        readonly en: "Orphans · {n}";
    };
    readonly "edge.orphansTitle": {
        readonly zh: "孤儿页";
        readonly en: "Orphan pages";
    };
    readonly "edge.orphansHint": {
        readonly zh: "废弃的页，和没有任何页指向、也不在主干里的散页。选一页：打开、归入主干、废弃或彻底删除。";
        readonly en: "Discarded pages, and loose pages nothing points to. Pick one to open, move into the trunk, discard, or delete for good.";
    };
    readonly "edge.orphansPh": {
        readonly zh: "搜索孤儿页";
        readonly en: "Search orphans";
    };
    readonly "edge.orphanDiscarded": {
        readonly zh: "废弃";
        readonly en: "discarded";
    };
    readonly "edge.orphanLoose": {
        readonly zh: "散页";
        readonly en: "loose";
    };
    readonly "edge.orphanOpen": {
        readonly zh: "打开";
        readonly en: "Open";
    };
    readonly "img.pasteAddTitle": {
        readonly zh: "把 {n} 张图片加成新页？";
        readonly en: "Add {n} image(s) as new pages?";
    };
    readonly "img.pasteAddMsg": {
        readonly zh: "会作为当前页的子节加进书里。要放进参考窗的话，先点一下参考窗再粘贴。";
        readonly en: "They will be added under the current page. To put them in the reference window instead, click the window first, then paste.";
    };
    readonly "img.pasteAddOk": {
        readonly zh: "加成新页";
        readonly en: "Add as pages";
    };
    readonly "ref.title": {
        readonly zh: "参考窗";
        readonly en: "Reference window";
    };
    readonly "ref.sendToRef": {
        readonly zh: "发到参考窗";
        readonly en: "Send to reference window";
    };
    readonly "ref.load": {
        readonly zh: "导入文件…";
        readonly en: "Import file…";
    };
    readonly "ref.paste": {
        readonly zh: "粘贴";
        readonly en: "Paste";
    };
    readonly "ref.oneToOne": {
        readonly zh: "原大";
        readonly en: "Actual size";
    };
    readonly "ref.delete": {
        readonly zh: "删除这张";
        readonly en: "Remove this card";
    };
    readonly "ref.deleteConfirm": {
        readonly zh: "确认删除";
        readonly en: "Confirm remove";
    };
    readonly "ref.closeWin": {
        readonly zh: "关闭参考窗";
        readonly en: "Close reference window";
    };
    readonly "ref.prev": {
        readonly zh: "上一张";
        readonly en: "Previous";
    };
    readonly "ref.next": {
        readonly zh: "下一张";
        readonly en: "Next";
    };
    readonly "ref.menu": {
        readonly zh: "参考窗菜单";
        readonly en: "Reference menu";
    };
    readonly "ref.move": {
        readonly zh: "拖动";
        readonly en: "Move";
    };
    readonly "ref.resize": {
        readonly zh: "调整大小";
        readonly en: "Resize";
    };
    readonly "ref.moveEarlier": {
        readonly zh: "往前挪一位";
        readonly en: "Move earlier";
    };
    readonly "ref.moveLater": {
        readonly zh: "往后挪一位";
        readonly en: "Move later";
    };
    readonly "ref.jump": {
        readonly zh: "跳到…";
        readonly en: "Jump to…";
    };
    readonly "ref.kindImage": {
        readonly zh: "图片";
        readonly en: "Image";
    };
    readonly "ref.kindText": {
        readonly zh: "文字";
        readonly en: "Text";
    };
    readonly "ref.linkMissing": {
        readonly zh: "这一页已不在书里";
        readonly en: "This page is no longer in the book";
    };
    readonly "ref.unsupported": {
        readonly zh: "「{name}」不是图片或文字，参考窗放不下";
        readonly en: "“{name}” is not an image or text; the reference window can't show it";
    };
    readonly "ref.importFailed": {
        readonly zh: "「{name}」导入失败";
        readonly en: "Failed to import “{name}”";
    };
    readonly "ref.imported": {
        readonly zh: "已加入参考窗（{n}）";
        readonly en: "Added to reference window ({n})";
    };
    readonly "ref.pasteEmpty": {
        readonly zh: "剪贴板里没有图片或文字";
        readonly en: "No image or text on the clipboard";
    };
    readonly "ref.tooNew": {
        readonly zh: "参考窗是新版本写的（清单 v{file}，本机只认到 v{lib}）：原样保留，本机不显示也不改";
        readonly en: "References were written by a newer version (manifest v{file}, this build reads up to v{lib}): kept untouched, not shown or edited here";
    };
};
