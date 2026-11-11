import { pasteMultilineTitle } from "./TitleBodyInput";
import { Menu, Notice } from "obsidian";
import { errorMessage, memoClipboardText, splitMemoContent } from "../utils";

export type TextEditingControl = HTMLInputElement | HTMLTextAreaElement;

export function openReadingCopyMenu(container: HTMLElement, event: MouseEvent, content?: string): boolean {
  if (content !== undefined) {
    event.preventDefault();
    event.stopPropagation();
    const menu = new Menu();
    addCopyItem(menu, splitMemoContent(content).body);
    addCopyItem(menu, memoClipboardText(content), "复制所有");
    menu.showAtMouseEvent(event);
    return true;
  }
  const selection = container.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || !container.contains(selection.anchorNode)
      || !container.contains(selection.focusNode)) return false;
  const text = selection.toString();
  event.preventDefault();
  event.stopPropagation();
  const menu = new Menu();
  addCopyItem(menu, text);
  menu.showAtMouseEvent(event);
  return true;
}

function addCopyItem(menu: Menu, text: string, label = "复制"): void {
  menu.addItem((item) => item.setTitle(label).setIcon("copy").setDisabled(!text.length).onClick(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      new Notice(`复制失败：${errorMessage(error)}`);
    }
  }));
}

export function openTextEditingMenu(control: TextEditingControl, event: MouseEvent, bodyForTitle?: HTMLTextAreaElement): void {
  event.preventDefault();
  event.stopPropagation();
  const start = control.selectionStart ?? 0;
  const end = control.selectionEnd ?? start;
  const hasSelection = end > start;
  const menu = new Menu();
  control.classList.add("has-memo-edit-menu");
  menu.onHide(() => {
    control.classList.remove("has-memo-edit-menu");
    if (control.isConnected) control.focus({ preventScroll: true });
  });
  addCopyItem(menu, control.value.slice(start, end));
  menu.addItem((item) => item.setTitle("粘贴").setIcon("clipboard-paste").onClick(() => void pasteSelection(control, start, end, bodyForTitle)));
  menu.addItem((item) => item.setTitle("剪切").setIcon("scissors").setDisabled(!hasSelection).onClick(() => void cutSelection(control)));
  menu.showAtMouseEvent(event);
}

async function pasteSelection(control: TextEditingControl, start: number, end: number, bodyForTitle?: HTMLTextAreaElement): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    control.setSelectionRange(start, end);
    if (bodyForTitle && pasteMultilineTitle(control, bodyForTitle, text)) return;
    control.setRangeText(text, start, end, "end");
    control.dispatchEvent(new Event("input"));
    control.focus();
  } catch (error) {
    new Notice(`粘贴失败：${errorMessage(error)}`);
  }
}

async function cutSelection(control: TextEditingControl): Promise<void> {
  const start = control.selectionStart ?? 0;
  const end = control.selectionEnd ?? start;
  if (end <= start) return;
  try {
    await navigator.clipboard.writeText(control.value.slice(start, end));
    control.setRangeText("", start, end, "end");
    control.dispatchEvent(new Event("input"));
    control.focus();
  } catch (error) {
    new Notice(`剪切失败：${errorMessage(error)}`);
  }
}
