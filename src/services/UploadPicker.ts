import { App, Platform } from "obsidian";

import { getDesktopDialog } from "./DesktopDialog";

const selectedPaths = new WeakMap<File, string>();
const lastFolderKey = "markdown-memos:last-upload-folder";

export function getDesktopUploadPath(file: File): string {
  if (!Platform.isDesktopApp) return "";
  const known = selectedPaths.get(file) || (file as File & { path?: string }).path;
  if (known) return known;
  try {
    return require("electron").webUtils?.getPathForFile(file) ?? "";
  } catch {
    return "";
  }
}

export type MobileUploadSource = "album" | "camera" | "files";

export async function pickUploadFiles(app: App, accept: string, mimeFor: (name: string) => string, mobileSource?: MobileUploadSource): Promise<File[]> {
  if (mobileSource) {
    const filter = mobileSource === "album" ? "image/*,video/*" : mobileSource === "camera" ? "image/*" : "*/*";
    return pickBrowserFiles(app, filter, mobileSource === "camera");
  }
  if (accept === "*/*") {
    const dialog = Platform.isDesktopApp ? getDesktopDialog() : undefined;
    if (dialog) {
      const saved = app.loadLocalStorage ? app.loadLocalStorage(lastFolderKey) : window.localStorage.getItem(lastFolderKey);
      const result = await dialog.showOpenDialog({
        title: "上传附件",
        properties: ["openFile", "multiSelections"],
        defaultPath: typeof saved === "string" ? saved : undefined,
      });
      if (result.canceled || !result.filePaths.length) return [];
      const fs: typeof import("fs/promises") = require("fs/promises");
      const path: typeof import("path") = require("path");
      const dir = path.dirname(result.filePaths[0]);
      if (app.saveLocalStorage) app.saveLocalStorage(lastFolderKey, dir);
      else window.localStorage.setItem(lastFolderKey, dir);
      const files: File[] = [];
      for (const source of result.filePaths) {
        const name = path.basename(source);
        const bytes = await fs.readFile(source);
        const file = new File([new Uint8Array(bytes)], name, { type: mimeFor(name) });
        selectedPaths.set(file, source);
        files.push(file);
      }
      return files;
    }

    const win = app.workspace.containerEl.ownerDocument.defaultView as (Window & {
      showOpenFilePicker?: (options: { id: string; multiple: boolean }) => Promise<{ getFile(): Promise<File> }[]>;
    }) | null;
    if (win?.showOpenFilePicker) {
      try {
        const handles = await win.showOpenFilePicker({ id: "markdown-memos-upload", multiple: true });
        return await Promise.all(handles.map(handle => handle.getFile()));
      } catch (error) {
        const name = (error as Error).name;
        if (name === "AbortError") return [];
        if (name !== "SecurityError" && name !== "NotAllowedError") throw error;
      }
    }
  }

  return pickBrowserFiles(app, accept);
}

function pickBrowserFiles(app: App, accept: string, camera = false): Promise<File[]> {
  return new Promise(resolve => {
    const input = app.workspace.containerEl.createEl("input", { type: "file" });
    input.multiple = !camera;
    if (camera) input.setAttribute("capture", "environment");
    input.accept = accept;
    input.hidden = true;
    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });
    input.click();
  });
}
