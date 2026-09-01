import { Menu, Notice } from "obsidian";
import { errorMessage } from "../utils";

export type TextEditingControl = HTMLInputElement | HTMLTextAreaElement;

export function openTextEditingMenu(control: TextEditingControl, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const start = control.selectionStart ?? 0;
  const end = control.selectionEnd ?? start;
  const hasSelection = end > start;
  const menu = new Menu();
  menu.addItem((item) => item.setTitle("复制").setIcon("copy").setDisabled(!hasSelection).onClick(() => void copySelection(control)));
  menu.addItem((item) => item.setTitle("粘贴").setIcon("clipboard-paste").onClick(() => void pasteSelection(control)));
  menu.addItem((item) => item.setTitle("剪切").setIcon("scissors").setDisabled(!hasSelection).onClick(() => void cutSelection(control)));
  menu.showAtMouseEvent(event);
}

async function copySelection(control: TextEditingControl): Promise<void> {
  const start = control.selectionStart ?? 0;
  const end = control.selectionEnd ?? start;
  if (end <= start) return;
  try {
    await navigator.clipboard.writeText(control.value.slice(start, end));
  } catch (error) {
    new Notice(`复制失败：${errorMessage(error)}`);
  }
}

async function pasteSelection(control: TextEditingControl): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    const start = control.selectionStart ?? control.value.length;
    const end = control.selectionEnd ?? start;
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
