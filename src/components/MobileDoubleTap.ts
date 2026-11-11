/** Recognize two short taps, including mouse input in Obsidian's mobile emulator. */
export function bindMobileDoubleTap(
  root: HTMLElement,
  canEdit: (target: EventTarget | null) => boolean,
  edit: () => void,
): void {
  let down: PointerEvent | undefined;
  let last: PointerEvent | undefined;
  let ignoreClickUntil = -1;
  function reset(): void {
    down = undefined;
    last = undefined;
  }
  root.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary || !canEdit(event.target)) {
      reset();
      return;
    }
    down = event;
  });
  root.addEventListener("pointermove", event => {
    if (down?.pointerId === event.pointerId && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 12) reset();
  });
  root.addEventListener("pointercancel", reset);
  root.addEventListener("contextmenu", reset);
  root.addEventListener("pointerup", event => {
    if (!down || down.pointerId !== event.pointerId || event.timeStamp - down.timeStamp > 280 ||
        Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 12 || !canEdit(event.target)) {
      reset();
      return;
    }
    down = undefined;
    if (last && event.timeStamp - last.timeStamp <= 350 &&
        Math.hypot(event.clientX - last.clientX, event.clientY - last.clientY) <= 24) {
      last = undefined;
      ignoreClickUntil = event.timeStamp + 450;
      edit();
    } else {
      last = event;
    }
  });
  root.addEventListener("click", event => {
    if (event.timeStamp <= ignoreClickUntil) {
      ignoreClickUntil = -1;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  root.addEventListener("dblclick", event => {
    if (event.timeStamp <= ignoreClickUntil || !canEdit(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
    edit();
  });
}
