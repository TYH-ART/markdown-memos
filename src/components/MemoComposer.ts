import { Menu, Notice, Platform, setIcon } from "obsidian";
import type { Component, TFile } from "obsidian";
import type { AttachmentService } from "../services/AttachmentService";
import { inferMime } from "../services/AttachmentService";
import { type MobileUploadSource, getDesktopUploadPath } from "../services/UploadPicker";
import type { MemoRepository } from "../services/MemoRepository";
import type { MemoRecord, MemoType } from "../types";
import { errorMessage, joinMemoContent } from "../utils";
import { prepareVideoThumbnail } from "./MemoAttachmentList";
import { createTagSuggestionControl } from "./TagSuggestionControl";
import { openTextEditingMenu } from "./TextEditingMenu";
import { bindTitleToBody } from "./TitleBodyInput";

type PendingAttachment =
  | { kind: "external"; file: File; name: string; mime: string; size: number; previewUrl?: string }
  | { kind: "vault"; file: TFile; name: string; mime: string; size: number };

export class MemoComposer {
  private readonly container: HTMLElement;
  private readonly composerEl: HTMLElement;
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
  private readonly isMobileLayout: () => boolean;
  private readonly getNotebookId: () => string | undefined;

  public constructor(
    owner: Component,
    container: HTMLElement,
    private readonly repository: MemoRepository,
    private readonly onCreated: (memo: MemoRecord) => Promise<void>,
    options: {
      defaultType?: MemoType;
      attachmentService?: AttachmentService;
      getPopularTags?: () => string[];
      isMobileLayout?: () => boolean;
      getNotebookId?: () => string | undefined;
    } = {},
  ) {
    this.container = container;
    this.memoType = options.defaultType ?? "note";
    this.attachmentService = options.attachmentService;
    this.isMobileLayout = options.isMobileLayout ?? (() => false);
    this.getNotebookId = options.getNotebookId ?? (() => undefined);
    const composer = container.createDiv({ cls: "obsidian-memos-composer" });
    this.composerEl = composer;
    const titleField = composer.createDiv({ cls: "obsidian-memos-composer__field is-title" });
    this.titleMirror = titleField.createDiv({ cls: "obsidian-memos-composer__mirror" });
    this.titleInput = titleField.createEl("input", {
      cls: "obsidian-memos-composer__title",
      attr: { type: "text", placeholder: "标题", "aria-label": "Memo 标题", enterkeyhint: "next" },
    });
    const bodyField = composer.createDiv({ cls: "obsidian-memos-composer__field is-body" });
    this.bodyMirror = bodyField.createDiv({ cls: "obsidian-memos-composer__mirror" });
    this.textarea = bodyField.createEl("textarea", {
      cls: "obsidian-memos-composer__input",
      attr: {
        placeholder: "你现在在想什么？",
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
      onButtonClick: () => this.focus(),
    });
    const attachmentButton = tools.createEl("button", {
      cls: "clickable-icon obsidian-memos-composer__attachment-button",
      attr: { type: "button", "aria-label": "给当前 Memo 添加附件" },
    });
    setIcon(attachmentButton, "plus");
    attachmentButton.title = "上传附件";
    this.taskButton = tools.createEl("button", { cls: "clickable-icon obsidian-memos-composer__task", attr: { type: "button" } });
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
    owner.registerDomEvent(this.titleInput, "focus", () => {
      this.tagTarget = this.titleInput;
      this.expandMobileComposer();
    });
    owner.registerDomEvent(this.textarea, "focus", () => {
      this.tagTarget = this.textarea;
      this.expandMobileComposer();
    });
    owner.registerDomEvent(composer, "focusout", (event: FocusEvent) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !composer.contains(nextTarget)) {
        // Keep the composer expanded once it contains text. This avoids the
        // editor collapsing while moving between controls or after an iOS
        // virtual-keyboard focus transition.
        if (!this.titleInput.value.trim() && !this.textarea.value.trim() && this.pendingAttachments.length === 0) {
          composer.removeClass("is-mobile-expanded");
        }
      }
    });
    owner.registerDomEvent(composer, "paste", (event: ClipboardEvent) => {
      if (this.isMobileLayout()) return;
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length === 0) return;
      event.preventDefault();
      this.addPendingExternalFiles(files);
    });
    // Focusing a collapsed body reveals the title above the pointer. A subsequent
    // contextmenu event can land on that newly visible title instead of the pressed body.
    let pressedField: HTMLInputElement | HTMLTextAreaElement | undefined;
    owner.registerDomEvent(composer, "pointerdown", (event: PointerEvent) => {
      pressedField = event.target === this.textarea ? this.textarea : event.target === this.titleInput ? this.titleInput : undefined;
    });
    owner.registerDomEvent(composer, "keydown", () => { pressedField = undefined; });
    owner.registerDomEvent(composer, "contextmenu", (event: MouseEvent) => {
      if (event.target !== this.titleInput && event.target !== this.textarea) return;
      const field = pressedField ?? (event.target === this.titleInput ? this.titleInput : this.textarea);
      pressedField = undefined;
      openTextEditingMenu(field, event, field === this.titleInput ? this.textarea : undefined);
    });
    owner.registerDomEvent(this.textarea, "scroll", () => {
      this.bodyMirror.scrollTop = this.textarea.scrollTop;
      this.bodyMirror.scrollLeft = this.textarea.scrollLeft;
    });
    const uploadChoices = composer.createDiv({ cls: "obsidian-memos-mobile-upload-choices" });
    uploadChoices.hidden = true;
    const closeUploadChoices = () => {
      uploadChoices.hidden = true;
      attachmentButton.setAttribute("aria-expanded", "false");
    };
    if (this.isMobileLayout()) {
      attachmentButton.setAttribute("aria-expanded", "false");
      const choices: { source: MobileUploadSource; icon: string; label: string }[] = [
        { source: "album", icon: "image", label: "相册" },
        { source: "camera", icon: "camera", label: "拍摄" },
        { source: "files", icon: "folder", label: "文件" },
      ];
      for (const choice of choices) {
        const button = uploadChoices.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": choice.label } });
        setIcon(button, choice.icon);
        owner.registerDomEvent(button, "click", () => {
          closeUploadChoices();
          void this.queueExternalAttachments(choice.source);
        });
      }
      owner.registerDomEvent(container.ownerDocument, "pointerdown", (event: PointerEvent) => {
        if (!uploadChoices.contains(event.target as Node) && !attachmentButton.contains(event.target as Node)) closeUploadChoices();
      });
      owner.registerDomEvent(container.ownerDocument, "keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape") closeUploadChoices();
      });
    }
    owner.registerDomEvent(attachmentButton, "click", () => {
      if (!this.isMobileLayout()) { void this.queueExternalAttachments(); return; }
      uploadChoices.hidden = !uploadChoices.hidden;
      attachmentButton.setAttribute("aria-expanded", String(!uploadChoices.hidden));
    });
    owner.registerDomEvent(attachmentButton, "contextmenu", (event: MouseEvent) => {
      event.preventDefault();
      const menu = new Menu();
      menu.addItem(item => item.setTitle("链接库内文件").setIcon("link").onClick(() => void this.queueVaultAttachment()));
      menu.showAtMouseEvent(event);
    });
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
      // Let IME composition finish in the title field before moving focus.
      if (event.isComposing) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        this.textarea.focus();
        this.textarea.setSelectionRange(0, 0);
      }
    });
    bindTitleToBody(this.titleInput, this.textarea);
    owner.registerDomEvent(this.textarea, "keydown", submitFromKeyboard);
    owner.registerDomEvent(this.textarea, "keydown", (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "ArrowUp") return;
      const caret = this.textarea.selectionStart ?? 0;
      if (caret > 0 && this.textarea.value.slice(0, caret).includes("\n")) return;
      event.preventDefault();
      event.stopPropagation();
      this.titleInput.focus();
      this.titleInput.setSelectionRange(this.titleInput.value.length, this.titleInput.value.length);
    });
    owner.registerDomEvent(this.submitButton, "click", () => void this.submit());
    this.updateTaskButton();
    this.renderMirrors();
    this.updateButtonState();
  }

  public focus(): void {
    this.expandMobileComposer();
    this.textarea.focus();
  }

  private async submit(): Promise<void> {
    const title = this.titleInput.value;
    const content = joinMemoContent(title, this.textarea.value);
    if ((!content.trim() && this.pendingAttachments.length === 0) || this.submitting) {
      return;
    }

    this.setSubmitting(true);
    try {
      let memo = await this.repository.createMemo(content, {
        type: this.memoType,
        notebookId: this.getNotebookId(),
        allowEmpty: this.pendingAttachments.length > 0,
      });
      await this.persistPendingAttachments(memo);
      memo = await this.repository.getMemo(memo.file);
      this.titleInput.value = "";
      this.textarea.value = "";
      this.clearPendingAttachments();
      this.renderMirrors();
      this.updateButtonState();
      await this.onCreated(memo);
      if (this.isMobileLayout()) {
        this.composerEl.removeClass("is-mobile-expanded");
        const activeElement = this.container.ownerDocument.activeElement;
        if (activeElement instanceof HTMLElement && this.container.contains(activeElement)) activeElement.blur();
      }
    } catch (error) {
      console.error("[Markdown Memos] 创建 Memo 失败。", error);
      new Notice(`创建 Memo 失败：${errorMessage(error)}`);
    } finally {
      this.setSubmitting(false);
      if (!this.isMobileLayout() && !this.textarea.value && !this.titleInput.value) this.textarea.focus();
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
    this.submitButton.disabled = this.submitting || (!this.titleInput.value.trim() && !this.textarea.value.trim() && this.pendingAttachments.length === 0);
  }

  private expandMobileComposer(): void {
    this.composerEl.addClass("is-mobile-expanded");
  }

  private updateTaskButton(): void {
    const isTask = this.memoType === "task";
    this.taskButton.toggleClass("is-active", isTask);
    setIcon(this.taskButton, isTask ? "list-checks" : "list-todo");
    this.taskButton.setAttr("aria-pressed", String(isTask));
    this.taskButton.setAttr("aria-label", isTask ? "切换为普通 Memo" : "切换为任务");
    this.taskButton.setAttr("title", isTask ? "切换为普通 Memo" : "切换为任务");
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

  private async queueExternalAttachments(mobileSource?: MobileUploadSource): Promise<void> {
    if (!this.attachmentService) return;
    try {
      this.addPendingExternalFiles(await this.attachmentService.pickExternalAttachments("*/*", mobileSource));
    } catch (error) {
      new Notice(`选择附件失败：${errorMessage(error)}`);
    }
  }

  private addPendingExternalFiles(files: File[]): void {
    for (const file of files) {
      const mime = file.type || inferMime(file.name);
      this.pendingAttachments.push({
        kind: "external",
        file,
        name: file.name,
        mime,
        size: file.size,
        previewUrl: mime.startsWith("image/") || mime.startsWith("video/") ? URL.createObjectURL(file) : undefined,
      });
    }
    this.renderPendingAttachments();
    this.updateButtonState();
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
        const video = item.createEl("video", { attr: { src: url, preload: "auto", muted: "true", playsinline: "true" } });
        if (this.isMobileLayout()) prepareVideoThumbnail(video);
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
    if (attachment.mime.startsWith("image/") && attachment.previewUrl) {
      this.attachmentService?.previewImage(attachment.previewUrl, attachment.name);
      return;
    }
    try {
      if (Platform.isDesktopApp) {
        const path = getDesktopUploadPath(attachment.file);
        if (!path) throw new Error("请先保存这条备忘录，再用系统应用打开附件");
        const message = await (require("electron") as { shell: { openPath(path: string): Promise<string> } }).shell.openPath(path);
        if (message) throw new Error(message);
      } else if (navigator.canShare?.({ files: [attachment.file] })) {
        await navigator.share({ files: [attachment.file], title: attachment.name });
      } else {
        throw new Error("请先保存这条备忘录，再用系统应用打开附件");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) new Notice(errorMessage(error));
    }
  }

  private async downloadPendingAttachment(attachment: PendingAttachment): Promise<void> {
    if (attachment.kind === "vault") {
      await this.attachmentService?.downloadAttachment({
        path: attachment.file.path, name: attachment.name, mime: attachment.mime, size: attachment.size, managed: false,
      });
      return;
    }
    await this.attachmentService?.downloadExternalFile(attachment.file);
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
