/** Measure outside normal layout so resizing never temporarily collapses the feed. */
export function resizeEditor(textarea: HTMLTextAreaElement): void {
  const mirror = textarea.cloneNode(false) as HTMLTextAreaElement;
  mirror.value = textarea.value;
  mirror.removeAttribute("id");
  mirror.tabIndex = -1;
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "absolute", visibility: "hidden", pointerEvents: "none",
    height: "0px", minHeight: "0px", width: `${textarea.getBoundingClientRect().width}px`,
    top: "0", left: "0", overflow: "hidden",
  });
  textarea.parentElement?.appendChild(mirror);
  const style = textarea.ownerDocument.defaultView!.getComputedStyle(textarea);
  const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  const height = mirror.scrollHeight + border;
  mirror.remove();
  textarea.style.height = `${Math.ceil(height)}px`;
}
