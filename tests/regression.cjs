const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

function load(entry, overrides = {}) {
  const { text } = buildSync({ entryPoints: [path.join(__dirname, '..', entry)], bundle: true,
    platform: 'node', format: 'cjs', supported: { 'dynamic-import': false }, external: ['obsidian', 'electron'], write: false }).outputFiles[0];
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'navigator', text)(
    (id) => overrides[id] ?? require(id), module, module.exports, overrides.window ?? {}, overrides.navigator ?? {});
  return module.exports;
}

class Control extends EventTarget {
  constructor(value) { super(); this.value = value; this.selectionStart = this.selectionEnd = value.length; }
  focus() { this.focused = true; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
}
function send(control, type, properties) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  control.dispatchEvent(event);
  return event;
}
const { bindTitleToBody } = load('src/components/TitleBodyInput.ts');

test('Manual ordering preserves filtered-out memo positions', () => {
  const { mergeVisibleOrder } = load('src/components/MemoReorder.ts');
  assert.deepEqual(mergeVisibleOrder(['a', 'hidden', 'b', 'c'], ['c', 'a', 'b']), ['c', 'hidden', 'a', 'b']);
  assert.deepEqual(mergeVisibleOrder(['a', 'b'], ['a', 'b']), ['a', 'b']);
});
test('Touch drag saves the new order and Escape restores the original order', () => {
  const { armMemoReorder } = load('src/components/MemoReorder.ts');
  const doc = new EventTarget();
  let nextFrame;
  doc.defaultView = { requestAnimationFrame(fn) { nextFrame = fn; return 1; }, cancelAnimationFrame() {} };
  const host = { children: [], ownerDocument: doc, scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0, bottom: 500 }),
    insertBefore(item, next) { this.children = this.children.filter(n => n !== item); const i = next ? this.children.indexOf(next) : this.children.length; this.children.splice(i, 0, item); },
    appendChild(item) { this.insertBefore(item, null); } };
  for (const name of ['a', 'b', 'c']) {
    const item = new EventTarget();
    Object.assign(item, { dataset: { memoPath: name }, addClass() {}, removeClass() {}, removeAttribute() {}, focus() {},
      setPointerCapture(id) { this.pointer = id; }, hasPointerCapture(id) { return this.pointer === id; }, releasePointerCapture() { this.pointer = undefined; },
      getBoundingClientRect() { return { top: host.children.indexOf(this) * 100, height: 100 }; } });
    host.children.push(item);
  }
  let saved;
  const a = host.children[0];
  armMemoReorder(host, a, paths => { saved = paths; });
  send(a, 'pointerdown', { button: 0, pointerId: 7, clientY: 50 });
  send(doc, 'pointermove', { pointerId: 7, clientY: 350 });
  nextFrame();
  send(doc, 'pointerup', { pointerId: 7 });
  assert.deepEqual(saved, ['b', 'c', 'a']);
  armMemoReorder(host, a, () => assert.fail('Canceled drag must not save'));
  host.insertBefore(a, host.children[0]);
  send(doc, 'keydown', { key: 'Escape' });
  assert.deepEqual(host.children.map(n => n.dataset.memoPath), ['b', 'c', 'a']);
});
test('Resizing measures a hidden clone without collapsing the live editor', () => {
  const { resizeEditor } = load('src/components/EditorSizing.ts');
  const writes = [];
  const style = new Proxy({}, { set(target, key, value) { writes.push([key, value]); target[key] = value; return true; } });
  let removed = false;
  const clone = { style: {}, scrollHeight: 240, removeAttribute() {}, setAttribute() {}, remove() { removed = true; } };
  const textarea = { value: 'first\nsecond', style, cloneNode: () => clone, getBoundingClientRect: () => ({ width: 500 }),
    parentElement: { appendChild() {} }, ownerDocument: { defaultView: { getComputedStyle: () => ({ borderTopWidth: '1', borderBottomWidth: '1' }) } } };
  resizeEditor(textarea);
  assert.deepEqual(writes, [['height', '242px']]);
  assert.equal(clone.value, textarea.value);
  assert.equal(removed, true);
});

test('Enter splits the title at the caret and preserves existing body', () => {
  const title = new Control('标题后半段'), body = new Control('已有正文');
  title.setSelectionRange(2, 2);
  bindTitleToBody(title, body);
  assert.equal(send(title, 'keydown', { key: 'Enter' }).defaultPrevented, true);
  assert.equal(title.value, '标题');
  assert.equal(body.value, '后半段\n已有正文');
  assert.equal(body.focused, true);
  assert.equal(body.selectionStart, 0);
});
test('Mobile beforeinput moves focus and IME confirmation does not split title', () => {
  const title = new Control('标题'), body = new Control('');
  bindTitleToBody(title, body);
  assert.equal(send(title, 'keydown', { key: 'Enter', isComposing: true }).defaultPrevented, false);
  assert.equal(body.focused, undefined);
  assert.equal(send(title, 'beforeinput', { inputType: 'insertParagraph' }).defaultPrevented, true);
  assert.equal(body.focused, true);
  assert.equal(title.value, '标题');
});
test('Pasting multiple lines keeps one title line and places remaining lines in body', () => {
  const title = new Control(''), body = new Control('旧正文');
  bindTitleToBody(title, body);
  send(title, 'paste', { clipboardData: { getData: () => '标题\r\n内容1\r\n内容2' } });
  assert.equal(title.value, '标题');
  assert.equal(body.value, '内容1\n内容2\n旧正文');
});

test('Desktop export preserves every binary byte including nulls and high bytes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'memos-export-test-'));
  try {
    const dest = path.join(dir, '中文附件.zip');
    const bytes = Uint8Array.from({ length: 65537 }, (_, i) => i % 256);
    const { exportBinaryFile } = load('src/services/FileExport.ts', {
      obsidian: { Platform: { isDesktop: true } },
      electron: { remote: { dialog: { showSaveDialog: async () => ({ filePath: dest }) } } },
    });
    await exportBinaryFile({}, bytes.buffer, '中文附件.zip', 'application/zip');
    assert.deepEqual(await readFile(dest), Buffer.from(bytes));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Canceling export never writes a file', async () => {
  let written = false;
  const { exportBinaryFile } = load('src/services/FileExport.ts', {
    obsidian: { Platform: { isDesktop: true } },
    electron: { remote: { dialog: { showSaveDialog: async () => ({ canceled: true }) } } },
    'fs/promises': { writeFile: () => { written = true; } },
  });
  await exportBinaryFile({}, new ArrayBuffer(0), 'file.zip', 'application/zip');
  assert.equal(written, false);
});
test('Mobile native export passes base64 binary and shares the resulting file URI', async () => {
  const bytes = Uint8Array.from([80, 75, 3, 4, 0, 128, 255]);
  let options, shared;
  const { exportBinaryFile } = load('src/services/FileExport.ts', {
    obsidian: { Platform: { isDesktop: false }, arrayBufferToBase64: data => Buffer.from(data).toString('base64') },
    window: { Capacitor: { Plugins: {
      Filesystem: { writeFile: async o => { options = o; return { uri: 'file:///cache/file.zip' }; } },
      Share: { share: async o => { shared = o; } },
    } } },
  });
  await exportBinaryFile({}, bytes.buffer, 'file.zip', 'application/zip');
  assert.deepEqual(Buffer.from(options.data, 'base64'), Buffer.from(bytes));
  assert.equal(options.encoding, undefined);
  assert.equal(options.directory, 'CACHE');
  assert.equal(shared.url, 'file:///cache/file.zip');
});
test('Card copy menu keeps selection whitespace and has no tag action', async () => {
  let menu, copied;
  class Menu {
    constructor() { this.items = []; menu = this; }
    addItem(fn) {
      const entry = { setTitle(v) { this.title = v; return this; }, setIcon() { return this; }, onClick(fn) { this.action = fn; return this; } };
      fn(entry); this.items.push(entry);
    }
    showAtMouseEvent() {}
  }
  const { MemoCard } = load('src/components/MemoCard.ts', { obsidian: { Menu } });
  MemoCard.prototype.openMenu.call({
    article: { ownerDocument: { getSelection: () => ({ anchorNode: {}, focusNode: {}, toString: () => '  selected\n' }) }, contains: () => true },
    memo: { content: 'title\n\nbody', pinned: false }, options: { isMobileLayout: () => false },
    copyText: async text => { copied = text; },
  }, {});
  assert.deepEqual(menu.items.map(i => i.title), ['复制', '移动', '置顶', '删除']);
  await menu.items[0].action();
  assert.equal(copied, '  selected\n');
});
