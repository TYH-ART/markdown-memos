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
  const doc = display.ownerDocument;
  const win = doc.defaultView!;
  const bridge = (win as Window & { Capacitor?: MobileBridge }).Capacitor;
  const bound = new AbortController();
  let session: AbortController | undefined;
  let timer: number | undefined;
  let press: { x: number; y: number; id: number } | undefined;
  let layer: HTMLElement | undefined;
  let suppressClick = false;
  const cancelPress = () => { win.clearTimeout(timer); press = undefined; };
  const close = () => {
    cancelPress();
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
    if (!caret || !readingText(caret.startContainer) || caret.startContainer.nodeType !== 3) return;
    const range: Range = caret;
    const node = range.startContainer;
    const [start, end] = initialWord(node.textContent ?? "", range.startOffset);
    if (start === end) return;
    close();
    range.setStart(node, start);
    range.setEnd(node, end);
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
    button("全选", "scan", () => {
      const blocks = Array.from(display.querySelectorAll(textSelector)).filter(el => el.textContent);
      if (!blocks.length) return;
      range.setStart(blocks[0], 0);
      const last = blocks[blocks.length - 1];
      range.setEnd(last, last.childNodes.length);
      paint();
    });
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
      grip.addEventListener("pointermove", event => {
        if (!grip.hasPointerCapture(event.pointerId)) return;
        overlay.classList.add("is-hit-testing");
        const caret = caretAt(doc, event.clientX + deltaX, event.clientY + deltaY);
        overlay.classList.remove("is-hit-testing");
        if (!caret || !readingText(caret.startContainer)) return;
        const fixed = range.cloneRange();
        fixed.collapse(edge === "end");
        const order = caret.compareBoundaryPoints(Range.START_TO_START, fixed);
        if (edge === "start" && order < 0) range.setStart(caret.startContainer, caret.startOffset);
        if (edge === "end" && order > 0) range.setEnd(caret.startContainer, caret.startOffset);
        paint();
      }, options);
      grip.addEventListener("lostpointercapture", () => { toolbar.hidden = false; paint(); }, options);
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
      for (const rect of rects) {
        const mark = marks.createDiv({ cls: "memos-selection-mark" });
        Object.assign(mark.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
      }
      const first = rects[0], last = rects[rects.length - 1];
      Object.assign(grips[0].style, { left: first.left + "px", top: first.bottom + "px" });
      Object.assign(grips[1].style, { left: last.right + "px", top: last.bottom + "px" });
      open.hidden = !selectedWebUrl(selectedText());
      const width = toolbar.offsetWidth, height = toolbar.offsetHeight;
      const left = Math.max(6, Math.min(first.left + first.width / 2 - width / 2, win.innerWidth - width - 6));
      const top = first.top >= height + 12 ? first.top - height - 8 : Math.min(last.bottom + 22, win.innerHeight - height - 6);
      Object.assign(toolbar.style, { left: left + "px", top: Math.max(6, top) + "px" });
    }
    doc.addEventListener("pointerdown", event => { if (!overlay.contains(event.target as Node)) close(); }, { ...options, capture: true });
    doc.addEventListener("scroll", close, { ...options, capture: true });
    doc.addEventListener("keydown", event => { if (event.key === "Escape") close(); }, options);
    win.addEventListener("resize", close, options);
    paint();
  };
  const listeners = { signal: bound.signal };
  display.addEventListener("pointerdown", event => {
    cancelPress();
    suppressClick = false;
    if (!event.isPrimary || event.button !== 0 || !readingText(event.target as Node)) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timer = win.setTimeout(() => { if (press) begin(press.x, press.y); }, 450);
  }, listeners);
  display.addEventListener("pointermove", event => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) cancelPress();
  }, listeners);
  display.addEventListener("pointerup", cancelPress, listeners);
  display.addEventListener("pointercancel", cancelPress, listeners);
  display.addEventListener("contextmenu", event => {
    if (readingText(event.target as Node)) { event.preventDefault(); event.stopPropagation(); }
  }, listeners);
  display.addEventListener("click", event => {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
  }, { ...listeners, capture: true });
  display.addClass("uses-mobile-selection");
  return () => { close(); bound.abort(); display.removeClass("uses-mobile-selection"); };
}
