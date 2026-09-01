import { App, Component, MarkdownRenderChild, MarkdownRenderer, Menu, Notice, setIcon } from "obsidian";
import type { AttachmentService } from "../services/AttachmentService";
import type { MemoRepository } from "../services/MemoRepository";
import type { MemoAttachment, MemoRecord } from "../types";
import { errorMessage, extractExternalUrls, joinMemoContent, splitMemoContent } from "../utils";
import { MemoAttachmentList } from "./MemoAttachmentList";
import { confirmMemoDeletion } from "./MemoDeleteModal";
import { createTagSuggestionControl } from "./TagSuggestionControl";
import { openTextEditingMenu } from "./TextEditingMenu";

export interface MemoCardOptions {
  onChanged: () => Promise<void>;
  attachmentService: AttachmentService;
  onTagSelect?: (tag: string) => void;
  onEditingChange?: (editing: boolean) => void;
  getPopularTags?: () => string[];
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

  public constructor(
    private readonly app: App,
    private readonly owner: Component,
    container: HTMLElement,
    private readonly repository: MemoRepository,
    private readonly memo: MemoRecord,
    private readonly options: MemoCardOptions,
  ) {
    this.article = container.createEl("article", {
      cls: `obsidian-memos-card${memo.type === "task" ? " is-task" : ""}${memo.completed ? " is-completed" : ""}`,
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
    if (memo.pinned) {
      const pinned = metadata.createSpan({ cls: "obsidian-memos-card__pinned", attr: { "aria-label": "已置顶", title: "已置顶" } });
      setIcon(pinned, "pin");
    }

    const actions = header.createDiv({ cls: "obsidian-memos-card__toolbar" });
    const pinButton = createIconButton(actions, "pin", memo.pinned ? "取消置顶" : "置顶");
    createTagSuggestionControl(owner, actions, {
      className: "is-card",
      getSuggestions: () => this.options.getPopularTags?.() ?? [],
      onSelect: (tag) => void this.addTag(tag),
    });
    const deleteButton = createIconButton(actions, "trash-2", "删除 Memo");
    const readingCloseButton = createIconButton(actions, "x", "退出阅读模式");
    readingCloseButton.addClass("obsidian-memos-card__reading-close");
    owner.registerDomEvent(pinButton, "click", () => void this.togglePinned());
    owner.registerDomEvent(deleteButton, "click", () => void this.deleteMemo());
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
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("a, button, input, textarea, select")) return;
      if (event.detail === 2) {
        // Start immediately on the second click; waiting for a timeout made editing feel laggy.
        void this.startEditing();
      } else if (event.detail >= 3) {
        event.preventDefault();
        this.expand();
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
    menu.addItem((item) => item.setTitle(this.memo.pinned ? "取消置顶" : "置顶").setIcon("pin").onClick(() => void this.togglePinned()));
    menu.addItem((item) => item.setTitle("#").setIcon("hash").onClick(() => void this.addTag("#")));
    menu.addItem((item) => item.setTitle("删除").setIcon("trash-2").onClick(() => void this.deleteMemo()));
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

    if (this.memo.tags.length > 0) {
      const tags = this.display.createDiv({ cls: "obsidian-memos-card__tags", attr: { "aria-label": "标签" } });
      for (const tag of this.memo.tags) {
        const tagButton = tags.createEl("button", { cls: "tag obsidian-memos-tag", text: tag, attr: { type: "button" } });
        this.owner.registerDomEvent(tagButton, "click", () => this.options.onTagSelect?.(tag));
      }
    }

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
      attr: { rows: "8", "aria-label": "编辑 Memo 内容", placeholder: "" },
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
      titleInput.style.height = "auto";
      titleInput.style.height = `${titleInput.scrollHeight}px`;
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
    titleInput.style.height = "auto";
    titleInput.style.height = `${titleInput.scrollHeight}px`;
    const initialTarget = !tagToInsert && !parts.title && parts.body ? textarea : titleInput;
    initialTarget.focus();
    initialTarget.setSelectionRange(initialTarget.value.length, initialTarget.value.length);
  }

  private enterReadingMode(): void {
    this.article.addClass("is-reading-mode");
    this.article.focus({ preventScroll: true });
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
    if (!this.article.hasClass("is-editing")) return;
    this.editDraft = content;
    await this.flushAutoSave();
    this.options.onEditingChange?.(false);
    await this.options.onChanged();
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
      if (current instanceof Text && /#[\p{L}\p{N}_/-]+/u.test(current.data)) nodes.push(current);
    }
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || parent.closest("a, code, pre, .obsidian-memos-inline-tag")) continue;
      const replacement = document.createElement("span");
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

  private async deleteMemo(): Promise<void> {
    if (!(await confirmMemoDeletion(this.app, this.memo))) return;
    try {
      await this.repository.deleteMemo(this.memo.file);
      await this.options.onChanged();
    } catch (error) {
      console.error(`[Markdown Memos] 删除失败：${this.memo.file.path}`, error);
      new Notice(`删除 Memo 失败：${errorMessage(error)}`);
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
