import type { Component } from "obsidian";

export interface TagSuggestionControlOptions {
  className?: string;
  getSuggestions: () => string[];
  onSelect: (tag: string) => void;
}

export function createTagSuggestionControl(
  owner: Component,
  container: HTMLElement,
  options: TagSuggestionControlOptions,
): HTMLButtonElement {
  const wrapper = container.createSpan({ cls: `obsidian-memos-tag-control${options.className ? ` ${options.className}` : ""}` });
  const button = wrapper.createEl("button", {
    cls: "clickable-icon obsidian-memos-tag-control__button",
    text: "#",
    attr: { type: "button", "aria-label": "添加标签", title: "添加标签" },
  });
  const popup = wrapper.createDiv({ cls: "obsidian-memos-tag-control__popup" });
  let hideTimer: number | undefined;

  const cancelHide = (): void => {
    if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    hideTimer = undefined;
  };
  const hide = (): void => {
    cancelHide();
    popup.removeClass("is-open");
  };
  const scheduleHide = (): void => {
    cancelHide();
    hideTimer = window.setTimeout(hide, 140);
  };
  const show = (): void => {
    cancelHide();
    popup.empty();
    const suggestions = options.getSuggestions().slice(0, 3);
    if (suggestions.length === 0) return;
    popup.createDiv({ cls: "obsidian-memos-tag-control__label", text: "常用标签" });
    for (const tag of suggestions) {
      const item = popup.createEl("button", { text: tag, attr: { type: "button" } });
      owner.registerDomEvent(item, "mousedown", (event: MouseEvent) => event.preventDefault());
      owner.registerDomEvent(item, "click", (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        hide();
        options.onSelect(tag);
      });
    }
    popup.addClass("is-open");
  };

  owner.registerDomEvent(button, "click", (event: MouseEvent) => {
    event.stopPropagation();
    options.onSelect("#");
  });
  // Keep the active editor selection when the toolbar button is clicked.
  owner.registerDomEvent(button, "mousedown", (event: MouseEvent) => event.preventDefault());
  owner.registerDomEvent(wrapper, "mouseenter", show);
  owner.registerDomEvent(wrapper, "mouseleave", scheduleHide);
  owner.registerDomEvent(popup, "mouseenter", cancelHide);
  owner.registerDomEvent(popup, "mouseleave", scheduleHide);
  return button;
}
