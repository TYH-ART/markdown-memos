import { App, Modal } from "obsidian";
import type { MemoRecord } from "../types";

class MemoDeleteModal extends Modal {
  private resolved = false;

  public constructor(
    app: App,
    private readonly memo: MemoRecord,
    private readonly resolve: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.setTitle("删除这条 Memo？");
    this.contentEl.createEl("p", { text: `“${previewContent(this.memo.content)}”` });
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "文件将通过 Obsidian 的回收站设置安全删除。",
    });

    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
    const confirm = actions.createEl("button", {
      cls: "mod-warning",
      text: "删除",
      attr: { type: "button" },
    });
    cancel.addEventListener("click", () => this.finish(false));
    confirm.addEventListener("click", () => this.finish(true));
    confirm.focus();
  }

  public override onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(false);
    }
  }

  private finish(confirmed: boolean): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.resolve(confirmed);
    this.close();
  }
}

export function confirmMemoDeletion(app: App, memo: MemoRecord): Promise<boolean> {
  return new Promise((resolve) => new MemoDeleteModal(app, memo, resolve).open());
}

function previewContent(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (!singleLine) {
    return memoFallback;
  }
  return singleLine.length > 80 ? `${singleLine.slice(0, 80)}…` : singleLine;
}

const memoFallback = "空 Memo";
