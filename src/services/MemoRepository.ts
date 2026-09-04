import { App, getAllTags, normalizePath, parseYaml, stringifyYaml, TFile, TFolder } from "obsidian";
import type { CreateMemoOptions, MemoAttachment, MemoFrontmatter, MemoRecord, MemoType, ObsidianMemosSettings } from "../types";
import { extractMemoTags, formatLocalIso, formatMemoBasename, normalizeMemoFolder } from "../utils";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)^(?:---|\.\.\.)\r?$\r?\n?/m;

interface ParsedDocument {
  frontmatter: MemoFrontmatter;
  content: string;
}

export class MemoRepository {
  private createQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly app: App,
    private readonly getSettings: () => ObsidianMemosSettings,
  ) {}

  public get folder(): string {
    return normalizeMemoFolder(this.getSettings().memoFolder);
  }

  public createMemo(rawContent: string, options: CreateMemoOptions = {}): Promise<MemoRecord> {
    const operation = this.createQueue.then(() => this.createMemoInternal(rawContent, options));
    this.createQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async createMemoInternal(rawContent: string, options: CreateMemoOptions): Promise<MemoRecord> {
    if (!rawContent.trim()) {
      throw new Error("Memo 内容不能为空");
    }
    const content = rawContent;

    await this.ensureFolder(this.folder);

    const now = new Date();
    const path = this.getUniqueMemoPath(now);
    const timestamp = formatLocalIso(now);
    const markdown = this.serializeDocument(
      {
        created: timestamp,
        modified: timestamp,
        pinned: false,
        source: "markdown-memos",
        type: options.type ?? "note",
        completed: false,
        completedAt: null,
        attachments: [],
        notebookId: options.notebookId ?? "default",
        trashedAt: null,
      },
      content,
      false,
    );
    const file = await this.app.vault.create(path, markdown);

    return this.readMemo(file);
  }

  public async updateMemo(file: TFile, rawContent: string): Promise<MemoRecord> {
    if (!rawContent.trim()) {
      throw new Error("Memo 内容不能为空");
    }
    const content = rawContent;

    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
    if (!(currentFile instanceof TFile)) {
      throw new Error("Memo 文件已不存在");
    }

    const original = await this.app.vault.read(currentFile);
    const parsed = this.parseDocument(original);
    const updatedFrontmatter: MemoFrontmatter = {
      ...parsed.frontmatter,
      modified: formatLocalIso(new Date()),
    };

    await this.app.vault.modify(currentFile, this.serializeDocument(updatedFrontmatter, content, false));
    return this.readMemo(currentFile);
  }

  public async deleteMemo(file: TFile): Promise<void> {
    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
    if (!(currentFile instanceof TFile)) {
      return;
    }

    await this.app.fileManager.trashFile(currentFile);
  }

  public async trashMemo(file: TFile): Promise<MemoRecord> {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.trashedAt = formatLocalIso(new Date());
    });
    return this.readMemo(currentFile);
  }

  public async restoreMemo(file: TFile): Promise<MemoRecord> {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.trashedAt = null;
    });
    return this.readMemo(currentFile);
  }

  public async emptyTrash(notebookId?: string): Promise<void> {
    const memos = await this.getMemos();
    const trashed = memos.filter((memo) => memo.trashedAt && (!notebookId || memo.notebookId === notebookId));
    for (const memo of trashed) await this.deleteMemo(memo.file);
  }

  public async moveMemosToNotebook(fromNotebookId: string, toNotebookId: string): Promise<void> {
    const memos = await this.getMemos();
    for (const memo of memos) {
      if (memo.notebookId !== fromNotebookId) continue;
      await this.updateFrontmatter(memo.file, (frontmatter) => {
        frontmatter.notebookId = toNotebookId;
      });
    }
  }

  public async moveMemoToNotebook(file: TFile, notebookId: string): Promise<MemoRecord> {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.notebookId = notebookId;
    });
    return this.readMemo(currentFile);
  }

  public async togglePinned(file: TFile): Promise<MemoRecord> {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.pinned = frontmatter.pinned !== true;
    }, false);
    return this.readMemo(currentFile);
  }

  public async setMemoType(file: TFile, type: MemoType): Promise<MemoRecord> {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.type = type;
      if (type === "note") {
        frontmatter.completed = false;
        frontmatter.completedAt = null;
      }
    });
    return this.readMemo(currentFile);
  }

  public async toggleTaskCompleted(file: TFile): Promise<MemoRecord> {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      const completed = frontmatter.completed !== true;
      frontmatter.type = "task";
      frontmatter.completed = completed;
      frontmatter.completedAt = completed ? formatLocalIso(new Date()) : null;
    });
    return this.readMemo(currentFile);
  }

  public async setArchived(file: TFile, archived: boolean): Promise<MemoRecord> {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.archived = archived;
    });
    return this.readMemo(currentFile);
  }

  public async addAttachment(file: TFile, attachment: MemoAttachment): Promise<MemoRecord> {
    const currentFile = this.requireFile(file);
    const original = await this.app.vault.read(currentFile);
    const parsed = this.parseDocument(original);
    const attachments = this.parseAttachments(parsed.frontmatter.attachments);
    if (!attachments.some((item) => item.path === attachment.path)) {
      attachments.push(attachment);
    }
    const content = this.normalizeStoredContent(parsed.content);
    const frontmatter: MemoFrontmatter = {
      ...parsed.frontmatter,
      modified: formatLocalIso(new Date()),
      attachments,
    };
    await this.app.vault.modify(currentFile, this.serializeDocument(frontmatter, content, false));
    return this.readMemo(currentFile);
  }

  public async removeAttachment(file: TFile, attachmentPath: string): Promise<MemoRecord> {
    const currentFile = this.requireFile(file);
    const original = await this.app.vault.read(currentFile);
    const parsed = this.parseDocument(original);
    const attachments = this.parseAttachments(parsed.frontmatter.attachments).filter((item) => item.path !== attachmentPath);
    const escapedPath = attachmentPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const referencePattern = new RegExp(`^!?\\[\\[${escapedPath}(?:\\|[^\\]]*)?\\]\\]\\s*$`, "gm");
    const content = this.normalizeStoredContent(parsed.content).replace(referencePattern, "").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "");
    const frontmatter: MemoFrontmatter = {
      ...parsed.frontmatter,
      modified: formatLocalIso(new Date()),
      attachments,
    };
    await this.app.vault.modify(currentFile, this.serializeDocument(frontmatter, content, false));
    return this.readMemo(currentFile);
  }

  public async getMemo(file: TFile): Promise<MemoRecord> {
    return this.readMemo(file);
  }

  public async getMemos(): Promise<MemoRecord[]> {
    const folder = this.app.vault.getAbstractFileByPath(this.folder);
    if (!folder) {
      return [];
    }
    if (!(folder instanceof TFolder)) {
      throw new Error(`Memo 保存路径不是文件夹：${this.folder}`);
    }

    const files = folder.children.filter((child): child is TFile => child instanceof TFile && child.extension.toLowerCase() === "md");
    const settled = await Promise.allSettled(files.map((file) => this.readMemo(file)));
    const memos: MemoRecord[] = [];

    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        memos.push(result.value);
        return;
      }

        console.warn(`[Markdown Memos] 无法读取 ${files[index]?.path ?? "未知文件"}，已跳过。`, result.reason);
    });

    return memos.sort((left, right) => {
      const createdDifference = right.created.getTime() - left.created.getTime();
      return createdDifference || right.file.stat.ctime - left.file.stat.ctime || right.file.path.localeCompare(left.file.path);
    });
  }

  private async readMemo(file: TFile): Promise<MemoRecord> {
    const markdown = await this.app.vault.cachedRead(file);
    const parsed = this.parseDocument(markdown);
    const created = this.parseDate(parsed.frontmatter.created) ?? new Date(file.stat.ctime);
    const modified = this.parseDate(parsed.frontmatter.modified) ?? new Date(file.stat.mtime);
    const type: MemoType = parsed.frontmatter.type === "task" ? "task" : "note";
    const cache = this.app.metadataCache.getFileCache(file);
    const content = this.normalizeStoredContent(parsed.content);
    const cachedTags = cache ? (getAllTags(cache) ?? []) : [];
    const tags = Array.from(new Set([...cachedTags, ...extractMemoTags(content)])).sort((left, right) => left.localeCompare(right));

    return {
      file,
      content,
      created,
      modified,
      pinned: parsed.frontmatter.pinned === true,
      source: typeof parsed.frontmatter.source === "string" ? parsed.frontmatter.source : undefined,
      tags,
      type,
      completed: type === "task" && parsed.frontmatter.completed === true,
      completedAt: this.parseDate(parsed.frontmatter.completedAt),
      archived: parsed.frontmatter.archived === true,
      notebookId: typeof parsed.frontmatter.notebookId === "string" && parsed.frontmatter.notebookId
        ? parsed.frontmatter.notebookId
        : "default",
      trashedAt: this.parseDate(parsed.frontmatter.trashedAt),
      attachments: this.parseAttachments(parsed.frontmatter.attachments),
      frontmatter: parsed.frontmatter,
    };
  }

  private parseDocument(markdown: string): ParsedDocument {
    const match = markdown.match(FRONTMATTER_PATTERN);
    if (!match) {
      return { frontmatter: {}, content: markdown };
    }

    const yamlSource = match[1]?.trim() ?? "";
    let frontmatter: MemoFrontmatter = {};
    if (yamlSource) {
      const parsed: unknown = parseYaml(yamlSource);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("YAML Frontmatter 必须是对象");
      }
      frontmatter = parsed as MemoFrontmatter;
    }

    return {
      frontmatter,
      content: markdown.slice(match[0].length),
    };
  }

  private serializeDocument(frontmatter: MemoFrontmatter, content: string, trimContent = true): string {
    const body = trimContent ? content.trim() : content;
    return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n${body}${body.endsWith("\n") ? "" : "\n"}`;
  }

  private normalizeStoredContent(content: string): string {
    const normalized = content.replace(/\r\n/g, "\n");
    const withoutSeparator = normalized.startsWith("\n") ? normalized.slice(1) : normalized;
    return withoutSeparator.endsWith("\n") ? withoutSeparator.slice(0, -1) : withoutSeparator;
  }

  private parseDate(value: unknown): Date | undefined {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value !== "string" && typeof value !== "number") {
      return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private parseAttachments(value: unknown): MemoAttachment[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.path !== "string" || typeof candidate.name !== "string") {
        return [];
      }
      return [{
        path: normalizePath(candidate.path),
        name: candidate.name,
        mime: typeof candidate.mime === "string" ? candidate.mime : "application/octet-stream",
        size: typeof candidate.size === "number" ? candidate.size : undefined,
        managed: candidate.managed !== false,
      }];
    });
  }

  private requireFile(file: TFile): TFile {
    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
    if (!(currentFile instanceof TFile)) {
      throw new Error("Memo 文件已不存在");
    }
    return currentFile;
  }

  private async updateFrontmatter(
    file: TFile,
    update: (frontmatter: Record<string, unknown>) => void,
    updateModified = true,
  ): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (rawFrontmatter: unknown) => {
      const frontmatter = rawFrontmatter && typeof rawFrontmatter === "object" && !Array.isArray(rawFrontmatter)
        ? rawFrontmatter as Record<string, unknown>
        : {};
      update(frontmatter);
      if (updateModified) frontmatter.modified = formatLocalIso(new Date());
    });
  }

  private getUniqueMemoPath(date: Date): string {
    const basename = formatMemoBasename(date);
    let suffix = 0;

    while (true) {
      const filename = `${basename}${suffix === 0 ? "" : `-${suffix}`}.md`;
      const path = normalizePath(`${this.folder}/${filename}`);
      if (!this.app.vault.getAbstractFileByPath(path)) {
        return path;
      }
      suffix += 1;
    }
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const segments = normalizeMemoFolder(folderPath).split("/");
    let currentPath = "";

    for (const segment of segments) {
      currentPath = normalizePath(currentPath ? `${currentPath}/${segment}` : segment);
      const existing = this.app.vault.getAbstractFileByPath(currentPath);
      if (existing instanceof TFolder) {
        continue;
      }
      if (existing) {
        throw new Error(`无法创建 Memo 文件夹：${currentPath} 已被文件占用`);
      }
      await this.app.vault.createFolder(currentPath);
    }
  }
}
