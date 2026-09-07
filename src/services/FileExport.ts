import { App, arrayBufferToBase64, Modal, Platform } from "obsidian";

interface MobileFilePlugins {
  Filesystem?: {
    writeFile(options: { path: string; directory: string; data: string; recursive: boolean }): Promise<{ uri: string }>;
  };
  Share?: { share(options: { title: string; url: string; dialogTitle: string }): Promise<unknown> };
}

/** Use a real file export instead of routing a blob URL through Obsidian's link handler. */
export async function exportBinaryFile(app: App, data: ArrayBuffer, name: string, mime: string): Promise<void> {
  if (Platform.isDesktop) {
    const electron = await import("electron");
    const result = await electron.remote.dialog.showSaveDialog({
      defaultPath: name,
      properties: ["showOverwriteConfirmation"],
    });
    if (result.canceled || !result.filePath) return;
    const fs = await import("fs/promises");
    // Do not turn binary data into a string or write the whole backing Buffer.
    const bytes = new Uint8Array(data);
    await fs.writeFile(result.filePath, bytes);
    const saved = await fs.readFile(result.filePath);
    if (saved.length !== data.byteLength || !saved.every((byte, index) => byte === bytes[index])) {
      throw new Error("导出文件校验失败，请重新下载");
    }
    return;
  }

  const plugins = (window as Window & { Capacitor?: { Plugins?: MobileFilePlugins } }).Capacitor?.Plugins;
  if (plugins?.Filesystem && plugins.Share) {
    const filename = name.replace(/[\\/:*?"<>|]/g, "-") || "attachment";
    const { uri } = await plugins.Filesystem.writeFile({
      path: `markdown-memos-exports/${Date.now()}-${Math.random().toString(36).slice(2)}/${filename}`,
      directory: "CACHE",
      // Capacitor requires base64 with no text encoding for binary writes.
      data: arrayBufferToBase64(data),
      recursive: true,
    });
    await plugins.Share.share({ title: name, url: uri, dialogTitle: "保存附件" });
    return;
  }

  const file = new File([data], name, { type: mime || "application/octet-stream" });
  if (navigator.canShare?.({ files: [file] })) {
    // Reading the vault can consume iOS's transient user activation. A fresh
    // tap after preparation lets the native share sheet open reliably.
    await new Promise<void>((resolve, reject) => {
      const modal = new Modal(app);
      modal.setTitle("保存附件");
      modal.contentEl.createEl("p", { text: name });
      const button = modal.contentEl.createEl("button", { text: "选择保存位置", cls: "mod-cta" });
      modal.onClose = () => resolve();
      button.addEventListener("click", () => {
        void navigator.share({ files: [file] }).then(() => modal.close(), (error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          reject(error instanceof Error ? error : new Error(String(error)));
          modal.close();
        });
      });
      modal.open();
    });
    return;
  }
  throw new Error("此设备暂不支持附件导出，请更新 Obsidian 后重试");
}
