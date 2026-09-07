/** Replace only visible slots; filtered-out memos keep their relative positions. */
export function mergeVisibleOrder(all: string[], visible: string[]): string[] {
  const selected = new Set(visible);
  let index = 0;
  return all.map(path => selected.has(path) ? visible[index++] : path);
}

/** Armed from the context menu; the next mouse/touch gesture moves the card. */
export function armMemoReorder(host: HTMLElement, item: HTMLElement, commit: (paths: string[]) => void): () => void {
  const original = Array.from(host.children);
  const doc = host.ownerDocument;
  const win = doc.defaultView!;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let pointer: number | undefined;
  let y = 0;
  let frame = 0;
  let finished = false;
  item.addClass("is-reorder-armed");
  item.tabIndex = 0;
  item.focus({ preventScroll: true });
  const finish = (save: boolean): void => {
    if (finished) return;
    finished = true;
    win.cancelAnimationFrame(frame);
    if (pointer !== undefined && item.hasPointerCapture(pointer)) item.releasePointerCapture(pointer);
    controller.abort();
    item.removeClass("is-reorder-armed");
    item.removeAttribute("tabindex");
    if (!save) original.forEach(child => host.appendChild(child));
    else commit(Array.from(host.children).map(child => (child as HTMLElement).dataset.memoPath).filter((path): path is string => Boolean(path)));
  };
  const reposition = (): void => {
    const others = Array.from(host.children).filter(child => child !== item) as HTMLElement[];
    const next = others.find(child => {
      const bounds = child.getBoundingClientRect();
      return y < bounds.top + bounds.height / 2;
    });
    host.insertBefore(item, next ?? null);
  };
  const tick = (): void => {
    const bounds = host.getBoundingClientRect();
    if (y < bounds.top + 48) host.scrollTop -= 10;
    else if (y > bounds.bottom - 48) host.scrollTop += 10;
    reposition();
    frame = win.requestAnimationFrame(tick);
  };
  item.addEventListener("pointerdown", event => {
    if (pointer !== undefined || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    pointer = event.pointerId;
    y = event.clientY;
    item.setPointerCapture(pointer);
    frame = win.requestAnimationFrame(tick);
  }, { ...options, capture: true });
  doc.addEventListener("pointermove", event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    y = event.clientY;
  }, { ...options, passive: false });
  doc.addEventListener("pointerup", event => {
    if (event.pointerId === pointer) finish(true);
  }, options);
  doc.addEventListener("pointercancel", () => finish(false), options);
  doc.addEventListener("keydown", event => {
    if (event.key === "Escape") finish(false);
    else if (event.key === "Enter") finish(true);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const sibling = event.key === "ArrowUp" ? item.previousElementSibling : item.nextElementSibling;
      if (sibling) host.insertBefore(item, event.key === "ArrowUp" ? sibling : sibling.nextElementSibling);
      item.scrollIntoView({ block: "nearest" });
    }
  }, options);
  return () => finish(false);
}
