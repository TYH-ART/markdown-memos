/** Share the same single-line title behavior with hardware and mobile keyboards. */
export function bindTitleToBody(title: HTMLInputElement | HTMLTextAreaElement, body: HTMLTextAreaElement): void {
  const moveToBody = (): void => {
    const start = title.selectionStart ?? title.value.length;
    const end = title.selectionEnd ?? start;
    const remainder = title.value.slice(end);
    title.value = title.value.slice(0, start);
    if (remainder) body.value = remainder + (body.value ? `\n${body.value}` : "");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    body.dispatchEvent(new Event("input", { bubbles: true }));
    body.focus();
    body.setSelectionRange(0, 0);
  };
  title.addEventListener("keydown", (rawEvent) => {
    const event = rawEvent as KeyboardEvent;
    if (event.key !== "Enter" || event.isComposing || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    moveToBody();
  });
  title.addEventListener("beforeinput", (rawEvent) => {
    const event = rawEvent as InputEvent;
    if (event.isComposing || !["insertLineBreak", "insertParagraph"].includes(event.inputType)) return;
    event.preventDefault();
    moveToBody();
  });
  title.addEventListener("paste", (rawEvent) => {
    const event = rawEvent as ClipboardEvent;
    const text = event.clipboardData?.getData("text/plain").replace(/\r\n?/g, "\n");
    if (!text?.includes("\n")) return;
    event.preventDefault();
    const start = title.selectionStart ?? title.value.length;
    const end = title.selectionEnd ?? start;
    const lines = text.split("\n");
    const first = lines.shift() ?? "";
    const remainder = lines.join("\n") + title.value.slice(end);
    title.value = title.value.slice(0, start) + first;
    body.value = remainder + (body.value ? `\n${body.value}` : "");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    body.dispatchEvent(new Event("input", { bubbles: true }));
    body.focus();
    body.setSelectionRange(remainder.length, remainder.length);
  });
}
