import { setIcon } from "obsidian";
import type { Component } from "obsidian";
import type { MemoRecord } from "../types";
import { splitMemoContent } from "../utils";


export interface MemoListPaneCallbacks {
  onSelect: (memo: MemoRecord) => void;
  onToggleTask: (memo: MemoRecord) => void;
  onDelete: (memo: MemoRecord) => void | Promise<void>;
  onContextMenu: (memo: MemoRecord, event: MouseEvent) => void;
}

/** Renders compact Apple Notes-style summaries without rendering full Markdown. */
export class MemoList {
  private readonly listEl: HTMLElement;
  private memos: MemoRecord[] = [];
  private selectedPath?: string;

  public constructor(
    owner: Component,
    container: HTMLElement,
    private readonly callbacks: MemoListPaneCallbacks,
  ) {
    this.listEl = container.createDiv({ cls: "obsidian-memos-list-pane__items" });
    owner.registerDomEvent(this.listEl, "click", (event: MouseEvent) => {
      const eventTarget = event.target instanceof Element ? event.target : null;
      const deleteButton = eventTarget?.closest<HTMLElement>("[data-swipe-delete]") ?? null;
      if (deleteButton) {
        // The button owns deletion. Never let the row-level click handler
        // interpret a delete tap as selecting/opening the memo.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = eventTarget?.closest<HTMLElement>("[data-memo-path]") ?? null;
      const path = target?.dataset.memoPath;
      if (!path) {
        return;
      }
      const memo = this.memos.find((item) => item.file.path === path);
      if (memo) {
        const taskToggle = eventTarget?.closest("[data-task-toggle]") ?? null;
        if (taskToggle) {
          this.callbacks.onToggleTask(memo);
        } else {
          this.callbacks.onSelect(memo);
        }
      }
    });
    owner.registerDomEvent(this.listEl, "contextmenu", (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-memo-path]") : null;
      const path = target?.dataset.memoPath;
      const memo = path ? this.memos.find((item) => item.file.path === path) : undefined;
      if (!memo) return;
      event.preventDefault();
      this.callbacks.onContextMenu(memo, event);
    });
  }

  public setMemos(memos: MemoRecord[], selectedPath?: string): void {
    this.memos = memos;
    this.selectedPath = selectedPath;
    this.render();
  }

  public destroy(): void {
    this.listEl.empty();
    this.memos = [];
  }

  private activateDelete(memo: MemoRecord, button: HTMLElement): void {
    button.addClass("is-activated");
    void Promise.resolve(this.callbacks.onDelete(memo)).finally(() => {
      if (button.isConnected) button.removeClass("is-activated");
    });
  }

  private render(): void {
    this.listEl.empty();
    if (this.memos.length === 0) {
      this.listEl.createDiv({ cls: "obsidian-memos-list-pane__empty", text: "暂无 Memo" });
      return;
    }

    let previousGroup = "";
    for (const memo of this.memos) {
      const group = getDateGroup(memo);
      if (group !== previousGroup) {
        this.listEl.createDiv({ cls: "obsidian-memos-list-group", text: group });
        previousGroup = group;
      }
      const row = this.listEl.createDiv({
        cls: "obsidian-memos-list-row",
        attr: { "data-memo-path": memo.file.path },
      });
      const deleteButton = row.createEl("button", {
        cls: "obsidian-memos-list-row__delete",
        attr: { type: "button", "data-swipe-delete": "true", "aria-label": "删除 Memo", title: "删除" },
      });
      setIcon(deleteButton, "trash-2");
      deleteButton.addEventListener("pointerdown", (event) => event.stopPropagation());
      deleteButton.addEventListener("pointerup", (event) => event.stopPropagation());
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.activateDelete(memo, deleteButton);
      });
      const item = row.createDiv({
        cls: `obsidian-memos-list-item${memo.file.path === this.selectedPath ? " is-selected" : ""}`,
        attr: { role: "button", tabindex: "0" },
      });
      const titleRow = item.createDiv({ cls: "obsidian-memos-list-item__title-row" });
      if (memo.pinned) {
        const pin = titleRow.createSpan({ cls: "obsidian-memos-list-item__pin", attr: { "aria-label": "已置顶", title: "已置顶" } });
        setIcon(pin, "pin");
      }
      if (isTaskMemo(memo)) {
        titleRow.createEl("button", {
          cls: `obsidian-memos-list-item__task-mark${isCompletedTask(memo) ? " is-completed" : ""}`,
          text: isCompletedTask(memo) ? "✓" : "○",
          attr: { type: "button", "data-task-toggle": "true", "aria-label": isCompletedTask(memo) ? "恢复为未完成" : "标记为已完成" },
        });
      }
      titleRow.createDiv({ cls: "obsidian-memos-list-item__title", text: getMemoListTitle(memo.content) });

      const summary = getSummary(memo.content);
      const preview = [formatListDate(memo.modified), summary].filter(Boolean).join("  ");
      item.createDiv({ cls: "obsidian-memos-list-item__summary", text: preview });
    }
  }
}

export function isTaskMemo(memo: MemoRecord): boolean {
  return memo.type === "task";
}

export function isCompletedTask(memo: MemoRecord): boolean {
  return memo.completed;
}

export function getMemoListTitle(content: string): string {
  const parts = splitMemoContent(content);
  const line = parts.title.trim();
  if (line) {
    return line.replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").slice(0, 80);
  }
  const firstBodyLine = parts.body.split("\n").map((item) => item.trim()).find(Boolean);
  return firstBodyLine ? firstBodyLine.replace(/^[-*+]\s+/, "").slice(0, 80) : "无标题 Memo";
}

export function getSummary(content: string): string {
  const parts = splitMemoContent(content);
  const lines = parts.body
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.title.trim() && lines.length > 0) {
    lines.shift();
  }
  return lines.slice(0, 2).join(" ").replace(/[*_`]/g, "").slice(0, 120);
}

export function formatListDate(date: Date): string {
  const now = new Date();
  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (isToday) {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function getDateGroup(memo: MemoRecord): string {
  if (memo.pinned) {
    return "置顶";
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const memoDay = new Date(memo.modified.getFullYear(), memo.modified.getMonth(), memo.modified.getDate()).getTime();
  if (memoDay === today) {
    return "今天";
  }
  if (memoDay === yesterdayDate.getTime()) {
    return "昨天";
  }
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(memo.modified);
}
