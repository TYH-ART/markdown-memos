import { Menu } from "obsidian";
import type { Component } from "obsidian";
import type { AttachmentService } from "../services/AttachmentService";
import type { MemoAttachment } from "../types";

export class MemoAttachmentList {
  public constructor(
    private readonly owner: Component,
    private readonly attachmentService: AttachmentService,
    private readonly onRemove: (attachment: MemoAttachment) => Promise<void>,
  ) {}

  public render(container: HTMLElement, attachments: MemoAttachment[]): void {
    if (attachments.length === 0) {
      return;
    }
    const section = container.createDiv({ cls: "obsidian-memos-attachments" });
    const grid = section.createDiv({ cls: "obsidian-memos-attachments__grid" });
    for (const attachment of attachments) {
      this.renderAttachment(grid, attachment);
    }
  }

  private renderAttachment(container: HTMLElement, attachment: MemoAttachment): void {
    const isMedia = attachment.mime.startsWith("image/") || attachment.mime.startsWith("video/");
    const item = container.createDiv({
      cls: `obsidian-memos-attachment${isMedia ? " is-media" : ""}`,
      attr: { role: "button", tabindex: "0", title: attachment.name },
    });
    const url = this.attachmentService.getResourceUrl(attachment);
    if (attachment.mime.startsWith("image/") && url) {
      item.createEl("img", { cls: "obsidian-memos-attachment__image", attr: { src: url, alt: attachment.name } });
    } else if (attachment.mime.startsWith("video/") && url) {
      item.createEl("video", { cls: "obsidian-memos-attachment__media", attr: { src: url, preload: "metadata" } });
    } else {
      const fileCard = item.createDiv({ cls: "obsidian-memos-attachment__file" });
      fileCard.createSpan({ cls: "obsidian-memos-attachment__file-icon", text: attachment.mime.startsWith("audio/") ? "🎵" : "📄" });
      const text = fileCard.createSpan({ cls: "obsidian-memos-attachment__file-text" });
      text.createSpan({ cls: "obsidian-memos-attachment__name", text: attachment.name });
      text.createSpan({ cls: "obsidian-memos-attachment__size", text: formatFileSize(attachment.size) });
    }
    if (isMedia) {
      item.createDiv({ cls: "obsidian-memos-attachment__caption", text: attachment.name });
    }
    this.owner.registerDomEvent(item, "click", (event: MouseEvent) => {
      event.stopPropagation();
      void this.attachmentService.openAttachment(attachment);
    });
    this.owner.registerDomEvent(item, "contextmenu", (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem((entry) => entry.setTitle("下载").setIcon("download").onClick(() => void this.attachmentService.downloadAttachment(attachment)));
      menu.addItem((entry) => entry.setTitle("删除").setIcon("trash-2").onClick(() => void this.onRemove(attachment)));
      menu.showAtMouseEvent(event);
    });
  }
}

function formatFileSize(size: number | undefined): string {
  if (size === undefined) return "文件";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
