import { Menu, Notice } from "obsidian";
import type { Component, TFile } from "obsidian";
import type { AttachmentService } from "../services/AttachmentService";
import { inferMime } from "../services/AttachmentService";
import type { MemoRepository } from "../services/MemoRepository";
import type { MemoRecord, MemoType } from "../types";
import { errorMessage, joinMemoContent } from "../utils";
import { createTagSuggestionControl } from "./TagSuggestionControl";
import { openTextEditingMenu } from "./TextEditingMenu";

type PendingAttachment =
  | { kind: "external"; file: File; name: string; mime: string; size: number; previewUrl?: string }
  | { kind: "vault"; file: TFile; name: string; mime: string; size: number };

export class MemoComposer {
  private readonly container: HTMLElement;
  private readonly titleInput: HTMLInputElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly titleMirror: HTMLElement;
  private readonly bodyMirror: HTMLElement;
  private readonly pendingHost: HTMLElement;
  private readonly attachmentService?: AttachmentService;
  private pendingAttachments: PendingAttachment[] = [];
  private readonly submitButton: HTMLButtonElement;
  private tagTarget: HTMLInputElement | HTMLTextAreaElement;
  private submitting = false;
  private memoType: MemoType;
  private readonly taskButton: HTMLButtonElement;

  public constructor(
    owner: Component,
    container: HTMLElement,
    private readonly repository: MemoRepository,
    private readonly onCreated: (memo: MemoRecord) => Promise<void>,
    options: {
      defaultType?: MemoType;
      attachmentService?: AttachmentService;
      getPopularTags?: () => string[];
    } = {},
  ) {
    this.container = container;
    this.memoType = options.defaultType ?? "note";
    this.attachmentService = options.attachmentService;
    const composer = container.createDiv({ cls: "obsidian-memos-composer" });
    const titleField = composer.createDiv({ cls: "obsidian-memos-composer__field is-title" });
    this.titleMirror = titleField.createDiv({ cls: "obsidian-memos-composer__mirror" });
    this.titleInput = titleField.createEl("input", {
      cls: "obsidian-memos-composer__title",
      attr: { type: "text", placeholder: "", "aria-label": "Memo 标题" },
    });
    const bodyField = composer.createDiv({ cls: "obsidian-memos-composer__field is-body" });
    this.bodyMirror = bodyField.createDiv({ cls: "obsidian-memos-composer__mirror" });
    this.textarea = bodyField.createEl("textarea", {
      cls: "obsidian-memos-composer__input",
      attr: {
        placeholder: "",
        rows: "5",
        "aria-label": "Memo 内容",
      },
    });
    this.pendingHost = composer.createDiv({ cls: "obsidian-memos-composer__attachments is-empty" });
    this.tagTarget = this.titleInput;

    const footer = composer.createDiv({ cls: "obsidian-memos-composer__footer" });
    const tools = footer.createDiv({ cls: "obsidian-memos-composer__tools" });
    createTagSuggestionControl(owner, tools, {
      className: "is-composer",
      getSuggestions: () => options.getPopularTags?.() ?? [],
      onSelect: (tag) => this.insertTag(tag),
    });
    const attachmentButton = tools.createEl("button", {
      cls: "clickable-icon",
      text: "📎",
      attr: { type: "button", "aria-label": "给当前 Memo 添加附件" },
    });
    const linkButton = tools.createEl("button", {
      cls: "clickable-icon",
      text: "🔗",
      attr: { type: "button", "aria-label": "给当前 Memo 链接 Vault 文件" },
    });
    this.taskButton = tools.createEl("button", { cls: "obsidian-memos-composer__task", attr: { type: "button" } });
    this.submitButton = footer.createEl("button", {
      cls: "mod-cta obsidian-memos-composer__submit",
      text: "NOTE",
      attr: { type: "button" },
    });

    owner.registerDomEvent(this.titleInput, "input", () => {
      this.renderMirrors();
      this.updateButtonState();
    });
    owner.registerDomEvent(this.textarea, "input", () => {
      this.renderMirrors();
      this.updateButtonState();
    });
    owner.registerDomEvent(this.titleInput, "focus", () => { this.tagTarget = this.titleInput; });
    owner.registerDomEvent(this.textarea, "focus", () => { this.tagTarget = this.textarea; });
    owner.registerDomEvent(this.titleInput, "contextmenu", (event: MouseEvent) => openTextEditingMenu(this.titleInput, event));
    owner.registerDomEvent(this.textarea, "contextmenu", (event: MouseEvent) => openTextEditingMenu(this.textarea, event));
    owner.registerDomEvent(this.textarea, "scroll", () => {
      this.bodyMirror.scrollTop = this.textarea.scrollTop;
      this.bodyMirror.scrollLeft = this.textarea.scrollLeft;
    });
    owner.registerDomEvent(attachmentButton, "click", () => void this.queueExternalAttachments());
    owner.registerDomEvent(linkButton, "click", () => void this.queueVaultAttachment());
    owner.registerDomEvent(this.taskButton, "click", () => {
      this.memoType = this.memoType === "task" ? "note" : "task";
      this.updateTaskButton();
    });
    const submitFromKeyboard = (event: KeyboardEvent): void => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.submit();
      }
    };
    owner.registerDomEvent(this.titleInput, "keydown", (event: KeyboardEvent) => {
      submitFromKeyboard(event);
      if (event.defaultPrevented) return;
      if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        this.textarea.focus();
        this.textarea.setSelectionRange(0, 0);
      }
    });
    owner.registerDomEvent(this.textarea, "keydown", submitFromKeyboard);
    owner.registerDomEvent(this.textarea, "keydown", (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "ArrowUp") return;
      const caret = this.textarea.selectionStart ?? 0;
      if (caret > 0 && this.textarea.value.slice(0, caret).includes("\n")) return;
      event.preventDefault();
      this.titleInput.focus();
      this.titleInput.setSelectionRange(this.titleInput.value.length, this.titleInput.value.length);
    });
    owner.registerDomEvent(this.submitButton, "click", () => void this.submit());
    this.updateTaskButton();
    this.renderMirrors();
    this.updateButtonState();
  }

  public focus(): void {
    this.titleInput.focus();
  }

  private async submit(): Promise<void> {
    const title = this.titleInput.value;
    const content = joinMemoContent(title, this.textarea.value);
    if (!content.trim() || this.submitting) {
      return;
    }

    this.setSubmitting(true);
    try {
      let memo = await this.repository.createMemo(content, { type: this.memoType });
      await this.persistPendingAttachments(memo);
      memo = await this.repository.getMemo(memo.file);
      this.titleInput.value = "";
      this.textarea.value = "";
      this.clearPendingAttachments();
      this.renderMirrors();
      this.updateButtonState();
      await this.onCreated(memo);
      this.titleInput.focus();
    } catch (error) {
      console.error("[Markdown Memos] 创建 Memo 失败。", error);
      new Notice(`创建 Memo 失败：${errorMessage(error)}`);
    } finally {
      this.setSubmitting(false);
    }
  }

  private setSubmitting(submitting: boolean): void {
    this.submitting = submitting;
    this.titleInput.disabled = submitting;
    this.textarea.disabled = submitting;
    this.submitButton.setText(submitting ? "保存中…" : "NOTE");
    this.updateButtonState();
  }

  private updateButtonState(): void {
    this.submitButton.disabled = this.submitting || (!this.titleInput.value.trim() && !this.textarea.value.trim());
  }

  private updateTaskButton(): void {
    const isTask = this.memoType === "task";
    this.taskButton.toggleClass("is-active", isTask);
    this.taskButton.setText(isTask ? "✓ 任务" : "○ 任务");
    this.taskButton.setAttr("aria-pressed", String(isTask));
  }

  private insertTextAtCursor(text: string, target: HTMLInputElement | HTMLTextAreaElement): void {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input"));
    target.focus();
  }

  private insertTag(tag: string): void {
    const prefix = this.tagTarget.value && this.tagTarget.selectionStart === this.tagTarget.value.length && !/\s$/.test(this.tagTarget.value) ? " " : "";
    this.insertTextAtCursor(`${prefix}${tag}`, this.tagTarget);
  }

  private renderMirrors(): void {
    this.titleMirror.empty();
    this.bodyMirror.empty();
    renderTextWithTags(this.titleMirror, this.titleInput.value || " ");
    renderTextWithTags(this.bodyMirror, this.textarea.value || " ");
  }

  private async queueExternalAttachments(): Promise<void> {
    if (!this.attachmentService) return;
    const files = await this.attachmentService.pickExternalAttachments();
    for (const file of files) {
      this.pendingAttachments.push({
        kind: "external",
        file,
        name: file.name,
        mime: file.type || inferMime(file.name),
        size: file.size,
        previewUrl: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : undefined,
      });
    }
    this.renderPendingAttachments();
  }

  private async queueVaultAttachment(): Promise<void> {
    if (!this.attachmentService) return;
    const file = await this.attachmentService.pickVaultAttachment();
    if (!file || this.pendingAttachments.some((attachment) => attachment.kind === "vault" && attachment.file.path === file.path)) return;
    this.pendingAttachments.push({ kind: "vault", file, name: file.name, mime: inferMime(file.name), size: file.stat.size });
    this.renderPendingAttachments();
  }

  private renderPendingAttachments(): void {
    this.pendingHost.empty();
    this.pendingHost.toggleClass("is-empty", this.pendingAttachments.length === 0);
    for (const attachment of this.pendingAttachments) {
      const item = this.pendingHost.createDiv({ cls: "obsidian-memos-composer__attachment", attr: { title: attachment.name } });
      const url = attachment.kind === "external"
        ? attachment.previewUrl
        : this.attachmentService?.getResourceUrl({ path: attachment.file.path, name: attachment.name, mime: attachment.mime, size: attachment.size, managed: false });
      if (attachment.mime.startsWith("image/") && url) {
        item.createEl("img", { attr: { src: url, alt: attachment.name } });
      } else if (attachment.mime.startsWith("video/") && url) {
        item.createEl("video", { attr: { src: url, preload: "metadata" } });
      } else {
        item.createSpan({ cls: "obsidian-memos-composer__attachment-icon", text: attachment.mime.startsWith("audio/") ? "🎵" : "📄" });
      }
      item.createSpan({ cls: "obsidian-memos-composer__attachment-name", text: attachment.name });
      item.addEventListener("click", (event: MouseEvent) => {
        event.stopPropagation();
        void this.openPendingAttachment(attachment);
      });
      ownerContextMenu(
        item,
        () => void this.downloadPendingAttachment(attachment),
        () => this.removePendingAttachment(attachment),
      );
    }
  }

  private removePendingAttachment(attachment: PendingAttachment): void {
    if (attachment.kind === "external" && attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    this.pendingAttachments = this.pendingAttachments.filter((item) => item !== attachment);
    this.renderPendingAttachments();
  }

  private clearPendingAttachments(): void {
    for (const attachment of this.pendingAttachments) {
      if (attachment.kind === "external" && attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
    this.pendingAttachments = [];
    this.renderPendingAttachments();
  }

  private async openPendingAttachment(attachment: PendingAttachment): Promise<void> {
    if (attachment.kind === "vault") {
      await this.attachmentService?.openAttachment({
        path: attachment.file.path, name: attachment.name, mime: attachment.mime, size: attachment.size, managed: false,
      });
      return;
    }
    const url = attachment.previewUrl ?? URL.createObjectURL(attachment.file);
    window.open(url, "_blank");
    if (!attachment.previewUrl) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async downloadPendingAttachment(attachment: PendingAttachment): Promise<void> {
    if (attachment.kind === "vault") {
      await this.attachmentService?.downloadAttachment({
        path: attachment.file.path, name: attachment.name, mime: attachment.mime, size: attachment.size, managed: false,
      });
      return;
    }
    const url = URL.createObjectURL(attachment.file);
    const anchor = this.container.createEl("a");
    anchor.href = url;
    anchor.download = attachment.name;
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async persistPendingAttachments(memo: MemoRecord): Promise<void> {
    if (!this.attachmentService || this.pendingAttachments.length === 0) return;
    const externalFiles = this.pendingAttachments
      .filter((attachment): attachment is Extract<PendingAttachment, { kind: "external" }> => attachment.kind === "external")
      .map((attachment) => attachment.file);
    await this.attachmentService.addExternalFiles(memo.file, externalFiles);
    for (const attachment of this.pendingAttachments) {
      if (attachment.kind === "vault") await this.attachmentService.linkChosenVaultFile(memo.file, attachment.file);
    }
  }
}

function ownerContextMenu(item: HTMLElement, onDownload: () => void, onRemove: () => void): void {
  item.addEventListener("contextmenu", (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const menu = new Menu();
    menu.addItem((entry) => entry.setTitle("下载").setIcon("download").onClick(onDownload));
    menu.addItem((entry) => entry.setTitle("删除").setIcon("trash-2").onClick(onRemove));
    menu.showAtMouseEvent(event);
  });
}

function renderTextWithTags(container: HTMLElement, text: string): void {
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
