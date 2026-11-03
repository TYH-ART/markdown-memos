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

/** Keep the pressed DOM node in place until release so touch capture survives the drag. */
export function bindSidebarDrag(handle: HTMLElement, row: HTMLElement, group: string, save: (keys: string[]) => void): void {
  const host = row.parentElement!;
  const doc = row.ownerDocument;
  const win = doc.defaultView!;
  row.dataset.sortGroup = group;
  let dragging = false;
  let suppressClick = false;
  handle.addEventListener("touchmove", event => {
    if (dragging && event.cancelable) event.preventDefault();
  }, { passive: false });
  handle.addEventListener("click", event => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
  handle.addEventListener("pointerdown", down => {
    if (!down.isPrimary || down.button !== 0) return;
    suppressClick = false;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const armed = host.hasClass("is-arranging");
    let timer = 0;
    let frame = 0;
    let y = down.clientY;
    let x = down.clientX;
    let target: HTMLElement | undefined;
    let after = false;
    const peers = Array.from(host.children).filter((el): el is HTMLElement =>
      (el as HTMLElement).dataset.sortGroup === group);
    let scroller: HTMLElement | null = host;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight &&
      /auto|scroll/.test(win.getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const mark = () => {
      target?.removeClass("is-drop-before", "is-drop-after");
      target = undefined;
      const hit = doc.elementFromPoint(x, y);
      if (!hit || !host.contains(hit)) return;
      const hovered = (hit as HTMLElement).closest<HTMLElement>("[data-sort-key]");
      if (hovered?.parentElement === host && hovered.dataset.sortGroup !== group) return;
      const candidate = peers.find(peer => y < peer.getBoundingClientRect().bottom) ?? peers[peers.length - 1];
      if (!candidate || candidate === row) return;
      const bounds = candidate.getBoundingClientRect();
      target = candidate;
      after = y >= bounds.top + bounds.height / 2;
      target.addClass(after ? "is-drop-after" : "is-drop-before");
    };
    const tick = () => {
      if (!row.isConnected) { finish(false); return; }
      if (scroller) {
        const bounds = scroller.getBoundingClientRect();
        if (y < bounds.top + 30) scroller.scrollTop -= 7;
        else if (y > bounds.bottom - 30) scroller.scrollTop += 7;
      }
      mark();
      frame = win.requestAnimationFrame(tick);
    };
    const begin = () => {
      if (dragging) return;
      if (!row.isConnected) { finish(false); return; }
      dragging = true;
      suppressClick = true;
      host.addClass("is-arranging");
      row.addClass("is-drag-source");
      handle.setPointerCapture(down.pointerId);
      frame = win.requestAnimationFrame(tick);
    };
    const finish = (drop: boolean) => {
      win.clearTimeout(timer);
      win.cancelAnimationFrame(frame);
      controller.abort();
      if (!dragging) return;
      dragging = false;
      host.removeClass("is-arranging");
      row.removeClass("is-drag-source");
      target?.removeClass("is-drop-before", "is-drop-after");
      if (handle.hasPointerCapture(down.pointerId)) handle.releasePointerCapture(down.pointerId);
      if (drop && target && row.isConnected) {
        const sorted = peers.filter(peer => peer !== row);
        sorted.splice(sorted.indexOf(target) + Number(after), 0, row);
        if (sorted.some((peer, index) => peer !== peers[index])) save(sorted.map(peer => peer.dataset.sortKey!));
      }
    };
    if (armed) begin();
    else timer = win.setTimeout(begin, 420);
    doc.addEventListener("pointermove", event => {
      if (event.pointerId !== down.pointerId) return;
      x = event.clientX;
      y = event.clientY;
      if (!dragging && Math.hypot(x - down.clientX, y - down.clientY) > 6) {
        if (event.pointerType === "mouse") begin();
        else finish(false);
      }
      if (dragging) event.preventDefault();
    }, { ...options, passive: false });
    doc.addEventListener("pointerup", event => {
      if (event.pointerId !== down.pointerId) return;
      if (dragging) { x = event.clientX; y = event.clientY; mark(); }
      finish(true);
    }, options);
    doc.addEventListener("pointercancel", event => {
      if (event.pointerId === down.pointerId) finish(false);
    }, options);
    doc.addEventListener("keydown", event => { if (event.key === "Escape") finish(false); }, options);
    win.addEventListener("blur", () => finish(false), options);
  });
}
