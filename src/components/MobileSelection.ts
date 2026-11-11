import { Notice, setIcon } from "obsidian";

const textSelector = ".obsidian-memos-card__title, .obsidian-memos-card__content";

export function selectedWebUrl(text: string): string | undefined {
  const value = text.trim();
  if (!/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\\]/.test(value)) return;
  try {
    const url = new URL(value);
    if (url.hostname && !url.username && !url.password) return url.href;
  } catch { /* A partial or malformed URL is ordinary selected text. */ }
  return undefined;
}

interface MobileBridge {
  isPluginAvailable(name: string): boolean;
  Plugins?: {
    AppLauncher?: { openUrl(options: { url: string }): Promise<{ completed: boolean }> };
    Clipboard?: { write(options: { string: string }): Promise<void> };
  };
}

async function copyText(doc: Document, value: string, bridge?: MobileBridge): Promise<void> {
  try {
    if (bridge?.isPluginAvailable?.("Clipboard") && bridge.Plugins?.Clipboard) {
      await bridge.Plugins.Clipboard.write({ string: value });
      return;
    }
  } catch { /* Continue with the WebView clipboard. */ }
  try {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (clipboard) { await clipboard.writeText(value); return; }
  } catch { /* Some WebViews deny the asynchronous clipboard API. */ }
  const field = doc.body.createEl("textarea");
  field.readOnly = true;
  field.value = value;
  Object.assign(field.style, { position: "fixed", top: "0", left: "-9999px" });
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, value.length);
    if (!doc.execCommand("copy")) throw new Error("clipboard unavailable");
  } finally { field.remove(); }
}

function caretAt(doc: Document, x: number, y: number): Range | undefined {
  const browser = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const range = browser.caretRangeFromPoint?.(x, y);
  if (range) return range;
  const position = browser.caretPositionFromPoint?.(x, y);
  if (!position) return;
  const caret = doc.createRange();
  caret.setStart(position.offsetNode, position.offset);
  caret.collapse(true);
  return caret;
}

export function initialWord(text: string, offset: number): [number, number] {
  const pos = Math.min(offset, Math.max(0, text.length - 1));
  const tokens = /https?:\/\/[^\s<>"，。；！？]+|[\p{Script=Han}]|[\p{L}\p{N}_]+|./gu;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(text))) {
    const end = match.index + match[0].length;
    if (pos < end) return [match.index, end];
  }
  return [pos, Math.min(pos + 1, text.length)];
}

export function bindMobileSelection(display: HTMLElement): () => void {
  const surface = display.closest<HTMLElement>(".obsidian-memos-card") ?? display;
  const doc = display.ownerDocument;
  const win = doc.defaultView!;
  const bridge = (win as Window & { Capacitor?: MobileBridge }).Capacitor;
  const bound = new AbortController();
  let session: AbortController | undefined;
  let timer: number | undefined;
  let press: { x: number; y: number; id: number } | undefined;
  let layer: HTMLElement | undefined;
  let suppressClick = false;
  let scrollFrame = 0;
  const cancelPress = () => { win.clearTimeout(timer); press = undefined; };
  const close = () => {
    cancelPress();
    win.cancelAnimationFrame(scrollFrame);
    session?.abort();
    session = undefined;
    layer?.remove();
    layer = undefined;
    display.removeClass("has-mobile-selection");
  };
  const readingText = (node: Node | null) => {
    const el = node?.nodeType === 1 ? node as Element : node?.parentElement;
    return Boolean(el && display.contains(el) && el.closest(textSelector));
  };

  const begin = (x: number, y: number) => {
    const caret = caretAt(doc, x, y);
    const body = display.querySelector(".obsidian-memos-card__content");
    if (!body || body.querySelector(".obsidian-memos-card__empty-content")) return;
    const range = doc.createRange();
    let blank = true;
    if (caret && readingText(caret.startContainer) && caret.startContainer.nodeType === 3) {
      const node = caret.startContainer;
      const [start, end] = initialWord(node.textContent ?? "", caret.startOffset);
      range.setStart(node, start);
      range.setEnd(node, end);
      blank = !Array.from(range.getClientRects()).some(r => x >= r.left - 3 && x <= r.right + 3 && y >= r.top && y <= r.bottom);
    }
    close();
    if (blank) range.selectNodeContents(body);
    if (!range.toString().trim()) return;
    suppressClick = true;
    display.addClass("has-mobile-selection");
    session = new AbortController();
    const options = { signal: session.signal };
    const textNodes: Text[] = [];
    const walker = doc.createTreeWalker(display, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (readingText(walker.currentNode)) textNodes.push(walker.currentNode as Text);
    }
    const overlay = doc.body.createDiv({ cls: "memos-selection-overlay" });
    layer = overlay;
    const marks = overlay.createDiv();
    const toolbar = overlay.createDiv({ cls: "memos-selection-toolbar", attr: { role: "toolbar", "aria-label": "选中文字" } });
    const button = (label: string, icon: string, action: () => void) => {
      const el = toolbar.createEl("button", { attr: { type: "button" } });
      setIcon(el.createSpan({ attr: { "aria-hidden": "true" } }), icon);
      el.createSpan({ text: label });
      el.addEventListener("click", action, options);
      return el;
    };
    // Range.toString omits the boundaries between rendered Markdown paragraphs.
    const selectedText = () => {
      const fragment = range.cloneContents();
      fragment.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, br").forEach(el => el.after("\n"));
      return (fragment.textContent ?? "").replace(/\n$/, "");
    };
    button("复制", "copy", () => {
      void copyText(doc, selectedText(), bridge).then(close, () => new Notice("复制失败，请重试"));
    });
    const selectAll = button("全选", "scan", () => {
      range.selectNodeContents(body);
      paint();
    });
    selectAll.hidden = blank;
    const open = button("打开网址", "external-link", async () => {
      const url = selectedWebUrl(selectedText());
      if (!url) return;
      close();
      try {
        if (bridge?.isPluginAvailable?.("AppLauncher") && bridge.Plugins?.AppLauncher) {
          const result = await bridge.Plugins.AppLauncher.openUrl({ url });
          if (result.completed) return;
        }
      } catch { /* Use Obsidian’s external link handler when the native bridge declines. */ }
      win.open(url, "_blank", "noopener,noreferrer");
    });
    const grips = (["start", "end"] as const).map(edge => {
      const grip = overlay.createDiv({ cls: "memos-selection-grip is-" + edge });
      let deltaX = 0, deltaY = 0;
      grip.addEventListener("pointerdown", event => {
        if (!event.isPrimary) return;
        event.preventDefault();
        grip.setPointerCapture(event.pointerId);
        deltaX = parseFloat(grip.style.left) - event.clientX;
        deltaY = parseFloat(grip.style.top) - event.clientY - 2;
        toolbar.hidden = true;
      }, options);
      let pointerX = 0, pointerY = 0;
      const scroller = display.closest<HTMLElement>(".obsidian-memos-detail-card-host");
      const update = () => {
        overlay.classList.add("is-hit-testing");
        const caret = caretAt(doc, pointerX + deltaX, pointerY + deltaY);
        overlay.classList.remove("is-hit-testing");
        if (!caret || !readingText(caret.startContainer)) return;
        const fixed = range.cloneRange();
        fixed.collapse(edge === "end");
        const order = caret.compareBoundaryPoints(Range.START_TO_START, fixed);
        if (edge === "start" && order < 0) range.setStart(caret.startContainer, caret.startOffset);
        if (edge === "end" && order > 0) range.setEnd(caret.startContainer, caret.startOffset);
        paint();
      };
      grip.addEventListener("pointermove", event => {
        if (!grip.hasPointerCapture(event.pointerId)) return;
        pointerX = event.clientX;
        pointerY = event.clientY;
        update();
        win.cancelAnimationFrame(scrollFrame);
        const tick = () => {
          if (!scroller) return;
          const bounds = scroller.getBoundingClientRect();
          const top = Math.max(0, bounds.top), bottom = Math.min(win.innerHeight, bounds.bottom);
          const speed = pointerY < top + 40 ? -6 : pointerY > bottom - 40 ? 6 : 0;
          if (!speed) return;
          scroller.scrollTop += speed;
          update();
          scrollFrame = win.requestAnimationFrame(tick);
        };
        scrollFrame = win.requestAnimationFrame(tick);
      }, options);
      grip.addEventListener("lostpointercapture", () => {
        win.cancelAnimationFrame(scrollFrame);
        toolbar.hidden = false;
        paint();
      }, options);
      return grip;
    });
    function paint(): void {
      marks.empty();
      const rects: DOMRect[] = [];
      const segment = doc.createRange();
      for (const text of textNodes) {
        if (!range.intersectsNode(text)) continue;
        segment.selectNodeContents(text);
        if (text === range.startContainer) segment.setStart(text, range.startOffset);
        if (text === range.endContainer) segment.setEnd(text, range.endOffset);
        rects.push(...Array.from(segment.getClientRects()).filter(r => r.width && r.height));
      }
      if (!rects.length) { close(); return; }
      for (const rect of blank ? [] : rects) {
        const mark = marks.createDiv({ cls: "memos-selection-mark" });
        Object.assign(mark.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
      }
      grips.forEach(grip => { grip.hidden = blank; });
      const visible = rects.filter(rect => rect.bottom > 0 && rect.top < win.innerHeight);
      const first = visible[0] ?? rects[0], last = visible[visible.length - 1] ?? rects[rects.length - 1];
      Object.assign(grips[0].style, { left: rects[0].left + "px", top: rects[0].bottom + "px" });
      Object.assign(grips[1].style, { left: rects[rects.length - 1].right + "px", top: rects[rects.length - 1].bottom + "px" });
      open.hidden = blank || !selectedWebUrl(selectedText());
      const width = toolbar.offsetWidth, height = toolbar.offsetHeight;
      const left = Math.max(6, Math.min(first.left + first.width / 2 - width / 2, win.innerWidth - width - 6));
      const top = blank ? Math.min(y, win.innerHeight - height - 6) : first.top >= height + 12 ? first.top - height - 8 : Math.min(last.bottom + 22, win.innerHeight - height - 6);
      Object.assign(toolbar.style, { left: left + "px", top: Math.max(6, top) + "px" });
    }
    doc.addEventListener("pointerdown", event => { if (!overlay.contains(event.target as Node)) close(); }, { ...options, capture: true });
    doc.addEventListener("scroll", () => { if (display.isConnected) paint(); else close(); }, { ...options, capture: true });
    doc.addEventListener("keydown", event => { if (event.key === "Escape") close(); }, options);
    win.addEventListener("resize", close, options);
    paint();
  };
  const listeners = { signal: bound.signal };
  surface.addEventListener("pointerdown", event => {
    cancelPress();
    suppressClick = false;
    if (!event.isPrimary || event.button !== 0 ||
      (event.target as Element).closest("button, input, textarea, a, .obsidian-memos-attachments")) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timer = win.setTimeout(() => { if (press) begin(press.x, press.y); }, 450);
  }, listeners);
  surface.addEventListener("pointermove", event => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) cancelPress();
  }, listeners);
  surface.addEventListener("pointerup", cancelPress, listeners);
  surface.addEventListener("pointercancel", cancelPress, listeners);
  surface.addEventListener("contextmenu", event => {
    if (!(event.target as Element).closest(".obsidian-memos-attachments")) { event.preventDefault(); event.stopPropagation(); }
  }, listeners);
  surface.addEventListener("click", event => {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
  }, { ...listeners, capture: true });
  display.addClass("uses-mobile-selection");
  return () => { close(); bound.abort(); display.removeClass("uses-mobile-selection"); };
}
