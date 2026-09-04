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
        readonly zh: "文件菜单";
        readonly en: "File menu";
    };
    readonly "ui.titlePlaceholder": {
        readonly zh: "无标题";
        readonly en: "Untitled";
    };
    readonly "ui.titleAria": {
        readonly zh: "文档标题";
        readonly en: "Document title";
    };
    readonly "ui.editorAria": {
        readonly zh: "小说编辑区";
        readonly en: "Writing area";
    };
    readonly "ui.mic": {
        readonly zh: "语音输入";
        readonly en: "Voice input";
    };
    readonly "ui.idleTitle": {
        readonly zh: "已闲置一段时间";
        readonly en: "Idle for a while";
    };
    readonly "ui.idleHint": {
        readonly zh: "点击任意位置同步云端最新版并继续编辑";
        readonly en: "Tap anywhere to sync the latest cloud version and continue";
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
    readonly "ui.newDoc": {
        readonly zh: "新建";
        readonly en: "New";
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
        readonly zh: "阅读节奏";
        readonly en: "Reading rhythm";
    };
    readonly "ui.reading.novel": {
        readonly zh: "轻小说 · 短行";
        readonly en: "Light novel · short lines";
    };
    readonly "ui.reading.classic": {
        readonly zh: "标准 · 宽行";
        readonly en: "Standard · wide lines";
    };
    readonly "ui.reading.hint": {
        readonly zh: "短行模式收窄页面、撑开行距，逼出对话独占一行的网文节奏。";
        readonly en: "Short-line mode narrows the page and opens up line spacing for web-novel dialogue rhythm.";
    };
    readonly "ui.sec.voice": {
        readonly zh: "语音输入";
        readonly en: "Voice input";
    };
    readonly "ui.voice.localHint": {
        readonly zh: "识别在本机运行，声音不出设备；加密稿也能用。第一次用会先下载语音包（一次，离线可用）。按住左 Ctrl 说话，或点右下角话筒。";
        readonly en: "Recognition runs on this device; audio never leaves it, so it works on encrypted drafts too. The first use downloads a voice pack once (works offline after). Hold Left Ctrl to talk, or tap the mic.";
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
    readonly "wc.chars": {
        readonly zh: "{n} 字";
        readonly en: "{n} chars";
    };
    readonly "wc.words": {
        readonly zh: "{n} 词";
        readonly en: "{n} words";
    };
    readonly "st.ready": {
        readonly zh: "就绪";
        readonly en: "Ready";
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
    readonly "st.savedAt": {
        readonly zh: "已保存 {time}";
        readonly en: "Saved {time}";
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
    readonly "st.lockedHint": {
        readonly zh: "已加密 · 点锁图标解锁";
        readonly en: "Encrypted · tap the lock to unlock";
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
    readonly "st.renameOldKept": {
        readonly zh: "已按新标题另存；旧名那份云端还在（列表里会有两份）";
        readonly en: "Saved under the new title; the old copy is still in the cloud (you will see both)";
    };
    readonly "st.renameCloudDeferred": {
        readonly zh: "标题已改（云端待推）";
        readonly en: "Title changed (cloud pending)";
    };
    readonly "st.encrypted": {
        readonly zh: "已加密 {time}（{status}）";
        readonly en: "Encrypted {time} ({status})";
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
        readonly zh: "「{name}」云端已有同名文件，本地这份未覆盖上去（请改个标题再存）";
        readonly en: "“{name}” already exists in the cloud; the local copy was not uploaded (rename and save again)";
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
    readonly "ime.nameFallback": {
        readonly zh: "拼音（备用）";
        readonly en: "Pinyin (fallback)";
    };
    readonly "ime.schemaSwitched": {
        readonly zh: "已切换到「{name}」";
        readonly en: "Switched to {name}";
    };
    readonly "ime.systemIntrusion": {
        readonly zh: "系统输入法在插手——请把它切到英文（内置输入法用 Shift 切中英）";
        readonly en: "The system IME intervened — switch it to English (the built-in IME toggles with Shift)";
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
    readonly "settings.forceUpdateTitle": {
        readonly zh: "强制更新？";
        readonly en: "Force update?";
    };
    readonly "settings.forceUpdateMsg": {
        readonly zh: "清掉 app 壳缓存并重启；文档缓存不受影响。需要联网。";
        readonly en: "Clears the app shell cache and restarts; document cache is untouched. Requires network.";
    };
    readonly "settings.diagEmpty": {
        readonly zh: "（没有记录）";
        readonly en: "(nothing logged)";
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
};
