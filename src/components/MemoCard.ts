import { App, Component, MarkdownRenderChild, MarkdownRenderer, Menu, Notice, setIcon } from "obsidian";
import type { AttachmentService } from "../services/AttachmentService";
import type { MemoRepository } from "../services/MemoRepository";
import type { MemoAttachment, MemoRecord } from "../types";
import { errorMessage, extractExternalUrls, joinMemoContent, splitMemoContent } from "../utils";
import { MemoAttachmentList } from "./MemoAttachmentList";
import { openTextEditingMenu } from "./TextEditingMenu";

export interface MemoCardOptions {
  onChanged: () => Promise<void>;
  attachmentService: AttachmentService;
  onEditingChange?: (editing: boolean) => void;
  getPopularTags?: () => string[];
  isMobileLayout?: () => boolean;
  trashMode?: boolean;
  onMove?: () => void;
}

export class MemoCard {
  private readonly article: HTMLElement;
  private readonly display: HTMLElement;
  private markdownChild?: MarkdownRenderChild;
  private editSaveTimer?: number;
  private editDraft?: string;
  private editSaveQueue: Promise<void> = Promise.resolve();
  private editorTitleInput?: HTMLInputElement | HTMLTextAreaElement;
  private editorTextarea?: HTMLTextAreaElement;
  private editorTagTarget?: HTMLInputElement | HTMLTextAreaElement;
  private lastPersistedContent?: string;
  private finishingEdit = false;
  private deleteArmed = false;
  private readonly deleteButton: HTMLButtonElement;

  public constructor(
    private readonly app: App,
    private readonly owner: Component,
    container: HTMLElement,
    private readonly repository: MemoRepository,
    private readonly memo: MemoRecord,
    private readonly options: MemoCardOptions,
  ) {
    const isTitleless = !splitMemoContent(memo.content).title.trim();
    this.article = container.createEl("article", {
      cls: `obsidian-memos-card${memo.type === "task" ? " is-task" : ""}${memo.completed ? " is-completed" : ""}${isTitleless ? " is-titleless" : ""}`,
    });
    const header = this.article.createDiv({ cls: "obsidian-memos-card__header" });
    const metadata = header.createDiv({ cls: "obsidian-memos-card__metadata" });
    if (memo.type === "task") {
      const taskButton = metadata.createEl("button", {
        cls: `obsidian-memos-task-toggle${memo.completed ? " is-completed" : ""}`,
        text: memo.completed ? "✓" : "○",
        attr: { type: "button", "aria-label": memo.completed ? "恢复为未完成" : "标记为已完成" },
      });
      owner.registerDomEvent(taskButton, "click", () => void this.toggleCompleted());
    }
    const time = metadata.createEl("time", {
      cls: "obsidian-memos-card__time",
      text: formatMemoTime(memo.created),
      attr: { datetime: memo.created.toISOString() },
    });
    time.setAttr("title", `创建：${memo.created.toLocaleString()}\n修改：${memo.modified.toLocaleString()}`);
    const actions = header.createDiv({ cls: "obsidian-memos-card__toolbar" });
    const pinButton = actions.createEl("button", { cls: "clickable-icon", attr: { type: "button" } });
    setIcon(pinButton, "pin");
    pinButton.toggleClass("is-pinned", memo.pinned);
    pinButton.setAttr("aria-pressed", String(memo.pinned));
    const deleteButton = createIconButton(actions, "trash-2", "删除 Memo");
    this.deleteButton = deleteButton;
    deleteButton.toggleClass("is-hidden", options.trashMode === true);
    const readingCloseButton = createIconButton(actions, "x", "退出阅读模式");
    readingCloseButton.addClass("obsidian-memos-card__reading-close");
    owner.registerDomEvent(pinButton, "click", () => void this.togglePinned());
    owner.registerDomEvent(deleteButton, "click", (event: MouseEvent) => {
      event.stopPropagation();
      void this.handleDeleteClick();
    });
    owner.registerDomEvent(this.article.ownerDocument, "pointerdown", (event: PointerEvent) => {
      if (!this.deleteArmed) return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !this.deleteButton.contains(target)) this.clearDeleteArmed();
    });
    owner.registerDomEvent(readingCloseButton, "click", () => this.exitReadingMode());
    owner.registerDomEvent(this.article, "contextmenu", (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        openTextEditingMenu(target, event);
        return;
      }
      if (this.article.hasClass("is-reading-mode") && this.hasReadingSelection(event)) {
        event.preventDefault();
        this.openReadingSelectionMenu(event);
        return;
      }
      event.preventDefault();
      this.openMenu(event);
    });
    owner.registerDomEvent(this.article, "click", (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("a, button, select, input, textarea")) return;
      if (this.article.hasClass("is-editing") && event.detail === 1) {
        event.preventDefault();
        const title = this.editorTitleInput?.value ?? "";
        const body = this.editorTextarea?.value ?? "";
        void this.finishEditing(joinMemoContent(title, body));
        return;
      }
      if (event.detail === 2) {
        event.preventDefault();
        if (this.article.hasClass("is-editing")) {
          const title = this.editorTitleInput?.value ?? "";
          const body = this.editorTextarea?.value ?? "";
          void this.finishEditing(joinMemoContent(title, body));
        } else {
          void this.startEditing();
        }
      }
    });
    owner.registerDomEvent(this.article, "keydown", (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.article.hasClass("is-reading-mode")) {
        event.preventDefault();
        this.exitReadingMode();
      }
    });
    this.article.tabIndex = -1;

    this.display = this.article.createDiv({ cls: "obsidian-memos-card__display" });
  }

  public async render(): Promise<void> {
    await this.renderDisplay();
  }

  public get path(): string {
    return this.memo.file.path;
  }

  public expand(): void {
    this.enterReadingMode();
    void this.startEditing();
  }

  public destroy(): void {
    if (this.editSaveTimer !== undefined) window.clearTimeout(this.editSaveTimer);
    this.options.onEditingChange?.(false);
    this.unloadMarkdownChild();
  }

  private openMenu(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("移动").setIcon("folder-input").onClick(() => this.options.onMove?.()));
    if (!this.options.isMobileLayout?.()) {
      menu.addItem((item) => item.setTitle(this.memo.pinned ? "取消置顶" : "置顶").setIcon("pin").onClick(() => void this.togglePinned()));
      menu.addItem((item) => item.setTitle("#").setIcon("hash").onClick(() => void this.addTag("#")));
      menu.addItem((item) => item.setTitle("删除").setIcon("trash-2").onClick(() => void this.deleteMemo()));
    }
    menu.showAtMouseEvent(event);
  }

  private async renderDisplay(): Promise<void> {
    this.unloadMarkdownChild();
    this.display.empty();
    this.article.removeClass("is-editing");

    const parts = splitMemoContent(this.memo.content);
    if (parts.title) {
      const title = this.display.createEl("h2", { cls: "obsidian-memos-card__title" });
      this.renderTextWithTags(title, parts.title);
    }
    const content = this.display.createDiv({ cls: "obsidian-memos-card__content markdown-rendered" });
    if (!parts.body) {
      if (!parts.title) {
        content.createEl("p", { cls: "obsidian-memos-card__empty-content", text: "（空 Memo）" });
      }
    } else {
      this.markdownChild = new MarkdownRenderChild(content);
      this.owner.addChild(this.markdownChild);
      try {
        await MarkdownRenderer.render(this.app, parts.body, content, this.memo.file.path, this.markdownChild);
        this.highlightInlineTags(content);
      } catch (error) {
        console.warn(`[Markdown Memos] Markdown 渲染失败：${this.memo.file.path}`, error);
        content.empty();
        content.createEl("pre", { text: parts.body });
      }
    }
    this.renderDetectedLinks(this.display, this.memo.content);

    new MemoAttachmentList(this.owner, this.options.attachmentService, (attachment) => this.removeAttachment(attachment)).render(
      this.display,
      this.memo.attachments,
    );
  }

  private async startEditing(tagToInsert?: string): Promise<void> {
    if (this.article.hasClass("is-editing")) {
      if (tagToInsert) this.insertTagIntoEditor(tagToInsert);
      return;
    }
    this.unloadMarkdownChild();
    this.display.empty();
    this.article.addClass("is-editing");
    this.options.onEditingChange?.(true);
    this.lastPersistedContent = this.memo.content;

    const parts = splitMemoContent(this.memo.content);
    const editor = this.display.createDiv({ cls: "obsidian-memos-card__editor-shell" });
    const titleField = editor.createDiv({ cls: "obsidian-memos-card__editor-field is-title" });
    const titleMirror = titleField.createDiv({ cls: "obsidian-memos-card__editor-mirror" });
    const titleInput = titleField.createEl("textarea", {
      cls: "obsidian-memos-card__title-editor",
      attr: { rows: "1", "aria-label": "编辑 Memo 标题", placeholder: "" },
    });
    titleInput.value = parts.title;
    if (tagToInsert) {
      titleInput.value += `${titleInput.value && !/\s$/.test(titleInput.value) ? " " : ""}${tagToInsert}`;
    }
    const bodyField = editor.createDiv({ cls: "obsidian-memos-card__editor-field is-body" });
    const bodyMirror = bodyField.createDiv({ cls: "obsidian-memos-card__editor-mirror" });
    const textarea = bodyField.createEl("textarea", {
      cls: "obsidian-memos-card__editor",
      attr: { rows: "1", "aria-label": "编辑 Memo 内容", placeholder: "" },
    });
    textarea.value = parts.body;
    this.renderEditorMirror(titleMirror, titleInput.value);
    this.renderEditorMirror(bodyMirror, textarea.value);
    this.editorTitleInput = titleInput;
    this.editorTextarea = textarea;
    this.editorTagTarget = titleInput;
    const links = this.display.createDiv({ cls: "obsidian-memos-card__editor-links" });
    this.display.createDiv({ cls: "obsidian-memos-card__autosave-hint", text: "自动保存" });

    const updateDraft = (): void => {
      const content = joinMemoContent(titleInput.value, textarea.value);
      this.scheduleAutoSave(content);
      titleInput.setCssProps({ height: "auto" });
      titleInput.setCssProps({ height: `${titleInput.scrollHeight}px` });
      this.resizeMobileBodyEditor(textarea);
      this.renderEditorMirror(titleMirror, titleInput.value);
      this.renderEditorMirror(bodyMirror, textarea.value);
      links.empty();
      this.renderDetectedLinks(links, content);
    };
    titleInput.addEventListener("input", updateDraft);
    textarea.addEventListener("input", updateDraft);
    titleInput.addEventListener("focus", () => { this.editorTagTarget = titleInput; });
    textarea.addEventListener("focus", () => { this.editorTagTarget = textarea; });
    titleInput.addEventListener("scroll", () => { titleMirror.scrollLeft = titleInput.scrollLeft; });
    textarea.addEventListener("scroll", () => {
      bodyMirror.scrollTop = textarea.scrollTop;
      bodyMirror.scrollLeft = textarea.scrollLeft;
    });
    this.display.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (this.article.contains(document.activeElement)) return;
        void this.finishEditing(joinMemoContent(titleInput.value, textarea.value));
      }, 0);
    });
    this.renderDetectedLinks(links, this.memo.content);
    // Keep mobile attachments available while editing so images/files can still
    // be opened without leaving the editor. Desktop keeps its existing editor
    // layout unchanged.
    new MemoAttachmentList(this.owner, this.options.attachmentService, (attachment) => this.removeAttachment(attachment)).render(
      this.display,
      this.memo.attachments,
    );
    titleInput.setCssProps({ height: "auto" });
    titleInput.setCssProps({ height: `${titleInput.scrollHeight}px` });
    this.resizeMobileBodyEditor(textarea);
    const initialTarget = !tagToInsert && !parts.title && parts.body ? textarea : titleInput;
    initialTarget.focus();
    initialTarget.setSelectionRange(initialTarget.value.length, initialTarget.value.length);
  }

  private enterReadingMode(): void {
    this.article.addClass("is-reading-mode");
    this.article.focus({ preventScroll: true });
  }

  private resizeMobileBodyEditor(textarea: HTMLTextAreaElement): void {
    textarea.setCssProps({ height: "0px" });
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 26;
    textarea.setCssProps({ height: `${Math.ceil(textarea.scrollHeight + lineHeight)}px` });
  }

  private exitReadingMode(): void {
    this.article.removeClass("is-reading-mode");
  }

  private hasReadingSelection(event: MouseEvent): boolean {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("a")) return true;
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && selection.toString().trim() && selection.anchorNode && this.article.contains(selection.anchorNode));
  }

  private openReadingSelectionMenu(event: MouseEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    const link = target?.closest<HTMLAnchorElement>("a");
    const selectedText = window.getSelection()?.toString().trim() ?? "";
    const text = selectedText || link?.href || "";
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("复制").setIcon("copy").onClick(() => void this.copyText(text)));
    menu.addItem((item) => item.setTitle("粘贴").setIcon("clipboard-paste").setDisabled(true));
    menu.addItem((item) => item.setTitle("剪切").setIcon("scissors").setDisabled(true));
    menu.showAtMouseEvent(event);
  }

  private scheduleAutoSave(content: string): void {
    this.editDraft = content;
    if (this.editSaveTimer !== undefined) window.clearTimeout(this.editSaveTimer);
    this.editSaveTimer = window.setTimeout(() => void this.flushAutoSave(), 450);
  }

  private async flushAutoSave(): Promise<void> {
    if (this.editSaveTimer !== undefined) window.clearTimeout(this.editSaveTimer);
    this.editSaveTimer = undefined;
    const draft = this.editDraft;
    this.editDraft = undefined;
    if (draft === undefined || !draft.trim() || draft === this.lastPersistedContent) return this.editSaveQueue;
    this.editSaveQueue = this.editSaveQueue.then(async () => {
      await this.repository.updateMemo(this.memo.file, draft);
      this.lastPersistedContent = draft;
    }).catch((error) => {
      console.error(`[Markdown Memos] 自动保存失败：${this.memo.file.path}`, error);
      new Notice(`自动保存失败：${errorMessage(error)}`);
    });
    return this.editSaveQueue;
  }

  private async finishEditing(content: string): Promise<void> {
    if (!this.article.hasClass("is-editing") || this.finishingEdit) return;
    this.finishingEdit = true;
    try {
      this.editDraft = content;
      await this.flushAutoSave();
      this.options.onEditingChange?.(false);
      await this.options.onChanged();
    } finally {
      this.finishingEdit = false;
    }
  }

  private renderDetectedLinks(container: HTMLElement, content: string): void {
    const urls = extractExternalUrls(content);
    if (urls.length === 0) return;
    const links = container.createDiv({ cls: "obsidian-memos-detected-links", attr: { "aria-label": "内容中的网址" } });
    for (const url of urls) {
      links.createEl("a", { cls: "external-link", text: url, href: url, attr: { target: "_blank", rel: "noopener noreferrer" } });
    }
  }

  public async addTag(tag: string): Promise<void> {
    await this.startEditing(tag);
  }

  private insertTagIntoEditor(tag: string): void {
    const target = this.editorTagTarget ?? this.editorTitleInput ?? this.editorTextarea;
    if (!target) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const prefix = start > 0 && !/\s/.test(target.value.charAt(start - 1)) ? " " : "";
    target.setRangeText(`${prefix}${tag}`, start, end, "end");
    target.dispatchEvent(new Event("input"));
    target.focus();
    const caret = start + prefix.length + tag.length;
    target.setSelectionRange(caret, caret);
  }

  private renderTextWithTags(container: HTMLElement, text: string): void {
    const pattern = /#([\p{L}\p{N}_/-]+)/gu;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > cursor) container.appendText(text.slice(cursor, match.index));
      container.createSpan({ cls: "obsidian-memos-inline-tag", text: match[0] });
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) container.appendText(text.slice(cursor));
  }

  private highlightInlineTags(container: HTMLElement): void {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let current: Node | null;
    while ((current = walker.nextNode())) {
      if (current.instanceOf(Text) && /#[\p{L}\p{N}_/-]+/u.test(current.data)) nodes.push(current);
    }
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || parent.closest("a, code, pre, .obsidian-memos-inline-tag")) continue;
      const replacement = container.createSpan();
      this.renderTextWithTags(replacement, node.data);
      node.replaceWith(...Array.from(replacement.childNodes));
    }
  }

  private renderEditorMirror(container: HTMLElement, text: string): void {
    container.empty();
    this.renderTextWithTags(container, text || " ");
  }

  private async toggleCompleted(): Promise<void> {
    await this.runAction("更新任务失败", () => this.repository.toggleTaskCompleted(this.memo.file));
  }

  private async togglePinned(): Promise<void> {
    await this.runAction("更新置顶状态失败", () => this.repository.togglePinned(this.memo.file));
  }

  private async removeAttachment(attachment: MemoAttachment): Promise<void> {
    try {
      await this.repository.removeAttachment(this.memo.file, attachment.path);
      if (attachment.managed && !(await this.options.attachmentService.isAttachmentReferenced(attachment.path, this.memo.file.path))) {
        await this.options.attachmentService.deleteManagedAttachment(attachment);
      }
      new Notice(attachment.managed ? "附件已移到系统废纸篓" : "已移除附件链接；原文件保留");
      await this.options.onChanged();
    } catch (error) {
      new Notice(`移除附件失败：${errorMessage(error)}`);
    }
  }

  private async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      new Notice("已复制");
    } catch (error) {
      new Notice(`复制失败：${errorMessage(error)}`);
    }
  }

  private async handleDeleteClick(): Promise<void> {
    if (!this.deleteArmed) {
      this.deleteArmed = true;
      this.deleteButton.addClass("is-delete-armed");
      this.deleteButton.setAttr("aria-label", "再次点击移入回收站");
      this.deleteButton.setAttr("title", "再次点击移入回收站");
      return;
    }
    if (this.options.isMobileLayout?.()) {
      await this.trashImmediately();
      return;
    }
    await this.deleteImmediately();
  }

  private clearDeleteArmed(): void {
    if (!this.deleteArmed) return;
    this.deleteArmed = false;
    this.deleteButton.removeClass("is-delete-armed");
    this.deleteButton.setAttr("aria-label", "删除 Memo");
    this.deleteButton.setAttr("title", "删除");
  }

  private async deleteMemo(): Promise<void> {
    await this.trashImmediately();
  }

  private async trashImmediately(): Promise<void> {
    try {
      await this.repository.trashMemo(this.memo.file);
      await this.options.onChanged();
    } catch (error) {
      console.error(`[Markdown Memos] 移入回收站失败：${this.memo.file.path}`, error);
      new Notice(`移入回收站失败：${errorMessage(error)}`);
    }
  }

  private async deleteImmediately(): Promise<void> {
    try {
      await this.repository.deleteMemo(this.memo.file);
      await this.options.onChanged();
    } catch (error) {
      console.error(`[Markdown Memos] 删除失败：${this.memo.file.path}`, error);
      new Notice(`删除失败：${errorMessage(error)}`);
    }
  }

  private async runAction(label: string, action: () => Promise<MemoRecord>): Promise<void> {
    try {
      await action();
      await this.options.onChanged();
    } catch (error) {
      console.error(`[Markdown Memos] ${label}`, error);
      new Notice(`${label}：${errorMessage(error)}`);
    }
  }

  private unloadMarkdownChild(): void {
    if (!this.markdownChild) return;
    this.owner.removeChild(this.markdownChild);
    this.markdownChild = undefined;
  }
}

function createIconButton(container: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = container.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": label, title: label } });
  setIcon(button, icon);
  return button;
}

function formatMemoTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
