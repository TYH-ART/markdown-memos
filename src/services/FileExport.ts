import { App, arrayBufferToBase64, FuzzySuggestModal, Modal, normalizePath, Notice, Platform, TFolder } from "obsidian";

import { getDesktopDialog } from "./DesktopDialog";

interface MobileFilePlugins {
  Filesystem?: {
    writeFile(options: { path: string; directory: string; data: string; recursive: boolean }): Promise<{ uri: string }>;
  };
  Share?: { share(options: { title: string; url: string; dialogTitle: string }): Promise<unknown> };
}

// A desktop path may be meaningless on another device sharing the same vault.
const downloadKey = "markdown-memos-download-folder";

export function getDownloadFolder(app: App): string {
  const value: unknown = app.loadLocalStorage ? app.loadLocalStorage(downloadKey)
    : window.localStorage?.getItem(downloadKey + ":" + app.vault.getName());
  return typeof value === "string" ? value.trim() : "";
}

export function setDownloadFolder(app: App, folder: string): void {
  if (app.saveLocalStorage) app.saveLocalStorage(downloadKey, folder.trim());
  else window.localStorage.setItem(downloadKey + ":" + app.vault.getName(), folder.trim());
}

async function askDesktopPath(app: App, suggested: string): Promise<string | undefined> {
  if (!Platform.isDesktopApp) return;
  const path = await import("path");
  return new Promise(resolve => {
    const modal = new Modal(app);
    modal.setTitle("选择下载位置");
    const input = modal.contentEl.createEl("input", { value: suggested, placeholder: "输入完整保存路径（包含文件名）" });
    const button = modal.contentEl.createEl("button", { text: "保存", cls: "mod-cta" });
    button.onclick = () => {
      if (!path.isAbsolute(input.value)) { new Notice("请输入包含文件名的绝对路径"); return; }
      resolve(input.value);
      modal.close();
    };
    modal.onClose = () => resolve(undefined);
    modal.open();
  });
}

async function writeDesktopFile(app: App, folder: string, name: string, bytes: Uint8Array): Promise<string | undefined> {
  if (!Platform.isDesktopApp) return;
  const fs: typeof import("fs/promises") = await import("fs/promises");
  const path: typeof import("path") = await import("path");
  if (folder) {
    if (!path.isAbsolute(folder)) throw new Error("请在插件设置中填写绝对下载路径");
    await fs.mkdir(folder, { recursive: true });
    const { name: stem, ext } = path.parse(name);
    for (let index = 0; ; index++) {
      const dest = path.join(folder, index ? `${stem} (${index})${ext}` : name);
      try {
        await fs.writeFile(dest, bytes, { flag: "wx" });
        return dest;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  }
  const dialog = await getDesktopDialog();
  let dest: string | undefined;
  if (dialog) {
    const result = await dialog.showSaveDialog({ defaultPath: name, properties: ["showOverwriteConfirmation"] });
    if (!result.canceled) dest = result.filePath;
  } else {
    const win = app.workspace?.containerEl.ownerDocument.defaultView as (Window & {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
    }) | null;
    if (win?.showSaveFilePicker) {
      const handle = await win.showSaveFilePicker({ suggestedName: name });
      const writer = await handle.createWritable();
      await writer.write(new Blob([new Uint8Array(bytes)]));
      await writer.close();
      new Notice(`已下载：${handle.name}`);
      return;
    }
    const os: typeof import("os") = await import("os");
    dest = await askDesktopPath(app, path.join(os.homedir(), name));
  }
  if (dest) await fs.writeFile(dest, bytes, { flag: dialog ? "w" : "wx" });
  return dest;
}

async function saveInVault(app: App, folder: string, name: string, data: ArrayBuffer): Promise<void> {
  if (folder !== "/" && (folder.startsWith("/") || folder.includes("\\") || folder.split("/").some(part => part === ".." || part === ".") || folder.includes(":"))) {
    throw new Error("请填写库内文件夹名称，例如 Downloads");
  }
  const dir = folder === "/" ? "" : normalizePath(folder);
  if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 0; ; i++) {
    const file = i ? `${stem} (${i})${ext}` : name;
    const dest = normalizePath(dir ? `${dir}/${file}` : file);
    if (app.vault.getAbstractFileByPath(dest)) continue;
    await app.vault.createBinary(dest, data);
    new Notice(`已下载到库内：${dest}`);
    return;
  }
}

const systemPicker = Symbol("system-picker");

function chooseMobileFolder(app: App, allowSystem: boolean): Promise<string | typeof systemPicker | undefined> {
  return new Promise(resolve => {
    type Choice = TFolder | typeof systemPicker;
    class FolderPicker extends FuzzySuggestModal<Choice> {
      getItems(): Choice[] {
        const folders = app.vault.getAllFolders(true);
        return allowSystem ? [systemPicker, ...folders] : folders;
      }
      getItemText(folder: Choice): string { return folder === systemPicker ? "打开系统保存或分享菜单…" : "库内：" + folder.path; }
      onChooseItem(folder: Choice): void { resolve(folder === systemPicker ? folder : folder.path); }
      override onClose(): void { super.onClose(); window.setTimeout(() => resolve(undefined), 0); }
    }
    const picker = new FolderPicker(app);
    picker.setPlaceholder("选择附件下载位置");
    picker.open();
  });
}

export async function exportBinaryFile(app: App, data: ArrayBuffer, name: string, mime: string): Promise<void> {
  const folder = getDownloadFolder(app);
  name = name.replace(/[\\/:*?"<>|]/g, "-").replace(/^[.]+$|[. ]+$/g, "") || "attachment";
  if (Platform.isDesktopApp) {
    const bytes = new Uint8Array(data);
    const dest = await writeDesktopFile(app, folder, name, bytes);
    if (!dest) return;
    const fs: typeof import("fs/promises") = await import("fs/promises");
    const saved = await fs.readFile(dest);
    if (saved.length !== bytes.length || !saved.every((byte, index) => byte === bytes[index])) {
      throw new Error("导出文件校验失败，请重新下载");
    }
    new Notice(`已下载到：${dest}`);
    return;
  }
  if (folder) return saveInVault(app, folder, name, data);

  const plugins = (window as Window & { Capacitor?: { Plugins?: MobileFilePlugins } }).Capacitor?.Plugins;
  const nativeShare = Boolean(plugins?.Filesystem && plugins.Share);
  const file = nativeShare ? undefined : new File([data], name, { type: mime || "application/octet-stream" });
  const selected = await chooseMobileFolder(app, nativeShare || Boolean(file && navigator.canShare?.({ files: [file] })));
  if (selected === undefined) return;
  if (selected !== systemPicker) return saveInVault(app, selected, name, data);
  if (plugins?.Filesystem && plugins.Share) {
    const { uri } = await plugins.Filesystem.writeFile({
      path: `markdown-memos-exports/${Date.now()}-${Math.random().toString(36).slice(2)}/${name}`,
      directory: "CACHE",
      // Capacitor requires base64 with no text encoding for binary writes.
      data: arrayBufferToBase64(data),
      recursive: true,
    });
    await plugins.Share.share({ title: name, url: uri, dialogTitle: "保存附件" });
    return;
  }

  if (file) {
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

}
