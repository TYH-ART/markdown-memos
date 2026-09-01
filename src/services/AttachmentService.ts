import { App, FuzzySuggestModal, normalizePath, Notice, TFile, TFolder } from "obsidian";
import type { MemoAttachment, ObsidianMemosSettings } from "../types";
import { formatMemoBasename, normalizeMemoFolder } from "../utils";
import type { MemoRepository } from "./MemoRepository";

export class AttachmentService {
  public constructor(
    private readonly app: App,
    private readonly repository: MemoRepository,
    private readonly getSettings: () => ObsidianMemosSettings,
  ) {}

  public get folder(): string {
    const configured = this.getSettings().attachmentFolder.trim();
    return configured ? normalizeMemoFolder(configured) : normalizePath(`${this.repository.folder}/_attachments`);
  }

  public async addExternalAttachments(memoFile: TFile): Promise<number> {
    const files = await this.pickExternalAttachments();
    return this.addExternalFiles(memoFile, files);
  }

  public pickExternalAttachments(): Promise<File[]> {
    return this.pickExternalFiles();
  }

  public async addExternalFiles(memoFile: TFile, files: File[]): Promise<number> {
    if (files.length === 0) {
      return 0;
    }
    await this.ensureFolder(this.folder);
    let added = 0;
    for (const file of files) {
      const path = this.uniqueAttachmentPath(file.name);
      await this.app.vault.createBinary(path, await file.arrayBuffer());
      await this.repository.addAttachment(memoFile, {
        path,
        name: file.name,
        mime: file.type || inferMime(file.name),
        size: file.size,
        managed: true,
      });
      added += 1;
    }
    return added;
  }

  public async linkVaultFile(memoFile: TFile): Promise<boolean> {
    const linkedFile = await this.pickVaultAttachment(memoFile.path);
    if (!linkedFile) {
      return false;
    }
    await this.linkChosenVaultFile(memoFile, linkedFile);
    return true;
  }

  public pickVaultAttachment(excludingPath?: string): Promise<TFile | undefined> {
    return this.chooseVaultFile("链接 Vault 文件", (file) => file.path !== excludingPath);
  }

  public async linkChosenVaultFile(memoFile: TFile, linkedFile: TFile): Promise<void> {
    await this.repository.addAttachment(memoFile, {
      path: linkedFile.path,
      name: linkedFile.name,
      mime: inferMime(linkedFile.name),
      size: linkedFile.stat.size,
      managed: false,
    });
  }

  public async chooseMarkdownFile(title: string): Promise<TFile | undefined> {
    return this.chooseVaultFile(title, (file) => file.extension.toLowerCase() === "md");
  }

  public async openAttachment(attachment: MemoAttachment): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    if (!(file instanceof TFile)) {
      new Notice(`附件不存在：${attachment.name}`);
      return;
    }
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  public getResourceUrl(attachment: MemoAttachment): string | undefined {
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    return file instanceof TFile ? this.app.vault.getResourcePath(file) : undefined;
  }

  public async downloadAttachment(attachment: MemoAttachment): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    if (!(file instanceof TFile)) {
      new Notice(`附件不存在：${attachment.name}`);
      return;
    }
    const data = await this.app.vault.readBinary(file);
    const url = URL.createObjectURL(new Blob([data], { type: attachment.mime }));
    const anchor = this.app.workspace.containerEl.ownerDocument.createElement("a");
    anchor.href = url;
    anchor.download = attachment.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  public async deleteManagedAttachment(attachment: MemoAttachment): Promise<void> {
    if (!attachment.managed) return;
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    if (file instanceof TFile) {
      await this.app.fileManager.trashFile(file);
    }
  }

  public async isAttachmentReferenced(path: string, excludingMemoPath?: string): Promise<boolean> {
    const memos = await this.repository.getMemos();
    return memos.some((memo) => memo.file.path !== excludingMemoPath && memo.attachments.some((attachment) => attachment.path === path));
  }

  private pickExternalFiles(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = this.app.workspace.containerEl.ownerDocument.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "*/*";
      let resolved = false;
      const finish = (files: File[]): void => {
        if (resolved) return;
        resolved = true;
        input.remove();
        resolve(files);
      };
      input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
      input.addEventListener("cancel", () => finish([]), { once: true });
      input.click();
    });
  }

  private chooseVaultFile(title: string, predicate: (file: TFile) => boolean): Promise<TFile | undefined> {
    return new Promise((resolve) => {
      new VaultFileSuggestModal(this.app, title, this.app.vault.getFiles().filter(predicate), resolve).open();
    });
  }

  private uniqueAttachmentPath(originalName: string): string {
    const safeName = sanitizeFilename(originalName);
    const prefix = formatMemoBasename(new Date());
    const extensionIndex = safeName.lastIndexOf(".");
    const stem = extensionIndex > 0 ? safeName.slice(0, extensionIndex) : safeName;
    const extension = extensionIndex > 0 ? safeName.slice(extensionIndex) : "";
    let suffix = 0;
    while (true) {
      const candidate = normalizePath(`${this.folder}/${prefix}-${stem}${suffix === 0 ? "" : `-${suffix}`}${extension}`);
      if (!this.app.vault.getAbstractFileByPath(candidate)) {
        return candidate;
      }
      suffix += 1;
    }
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const segments = normalizeMemoFolder(folderPath).split("/");
    let current = "";
    for (const segment of segments) {
      current = normalizePath(current ? `${current}/${segment}` : segment);
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`附件目录被文件占用：${current}`);
      await this.app.vault.createFolder(current);
    }
  }
}

class VaultFileSuggestModal extends FuzzySuggestModal<TFile> {
  private selected = false;

  public constructor(
    app: App,
    title: string,
    private readonly files: TFile[],
    private readonly resolve: (file: TFile | undefined) => void,
  ) {
    super(app);
    this.setPlaceholder(title);
  }

  public getItems(): TFile[] {
    return this.files;
  }

  public getItemText(item: TFile): string {
    return item.path;
  }

  public onChooseItem(item: TFile): void {
    this.selected = true;
    this.resolve(item);
  }

  public override onClose(): void {
    super.onClose();
    if (!this.selected) {
      this.resolve(undefined);
    }
  }
}

function sanitizeFilename(name: string): string {
  const sanitized = name.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
  return sanitized.slice(0, 120) || "attachment";
}

export function inferMime(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeByExtension: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip", txt: "text/plain", md: "text/markdown",
  };
  return mimeByExtension[extension] ?? "application/octet-stream";
}
