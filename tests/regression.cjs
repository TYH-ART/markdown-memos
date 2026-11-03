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
      obsidian: { Platform: { isDesktop: true }, Notice: class {} },
      electron: { remote: { dialog: { showSaveDialog: async () => ({ filePath: dest }) } } },
    });
    await exportBinaryFile({}, bytes.buffer, '中文附件.zip', 'application/zip');
    assert.deepEqual(await readFile(dest), Buffer.from(bytes));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Configured desktop download folder saves without overwriting or loading Electron', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'memos-default-download-'));
  try {
    const { exportBinaryFile } = load('src/services/FileExport.ts', {
      obsidian: { Platform: { isDesktop: true }, Notice: class {} },
    });
    const app = { loadLocalStorage: () => dir };
    await exportBinaryFile(app, new Uint8Array([1]).buffer, 'report.pdf', '');
    await exportBinaryFile(app, new Uint8Array([2]).buffer, 'report.pdf', '');
    assert.deepEqual(await readFile(path.join(dir, 'report.pdf')), Buffer.from([1]));
    assert.deepEqual(await readFile(path.join(dir, 'report (1).pdf')), Buffer.from([2]));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Canceling export never writes a file', async () => {
  let written = false;
  const { exportBinaryFile } = load('src/services/FileExport.ts', {
    obsidian: { Platform: { isDesktop: true }, Notice: class {} },
    electron: { remote: { dialog: { showSaveDialog: async () => ({ canceled: true }) } } },
    'fs/promises': { writeFile: () => { written = true; } },
  });
  await exportBinaryFile({}, new ArrayBuffer(0), 'file.zip', 'application/zip');
  assert.equal(written, false);
});
test('Mobile default download folder saves into the vault without a share dialog', async () => {
  const files = new Set(['Downloads', 'Downloads/photo.png']);
  const written = [];
  const app = { loadLocalStorage: () => 'Downloads', vault: {
    getAbstractFileByPath: name => files.has(name),
    createBinary: (name, data) => written.push([name, Array.from(new Uint8Array(data))]),
  } };
  const { exportBinaryFile } = load('src/services/FileExport.ts', {
    obsidian: { Platform: { isDesktop: false }, normalizePath: path => path, Notice: class {} },
  });
  await exportBinaryFile(app, Uint8Array.from([0, 255]).buffer, 'photo.png', 'image/png');
  assert.deepEqual(written, [['Downloads/photo (1).png', [0, 255]]]);
});
test('Mobile native export passes base64 binary and shares the resulting file URI', async () => {
  const bytes = Uint8Array.from([80, 75, 3, 4, 0, 128, 255]);
  let options, shared;
  const { exportBinaryFile } = load('src/services/FileExport.ts', {
    obsidian: { Platform: { isDesktop: false }, FuzzySuggestModal: class { setPlaceholder() {} open() { this.onChooseItem(this.getItems()[0]); } }, arrayBufferToBase64: data => Buffer.from(data).toString('base64') },
    window: { Capacitor: { Plugins: {
      Filesystem: { writeFile: async o => { options = o; return { uri: 'file:///cache/file.zip' }; } },
      Share: { share: async o => { shared = o; } },
    } } },
  });
  await exportBinaryFile({ vault: { getAllFolders: () => [] } }, bytes.buffer, 'file.zip', 'application/zip');
  assert.deepEqual(Buffer.from(options.data, 'base64'), Buffer.from(bytes));
  assert.equal(options.encoding, undefined);
  assert.equal(options.directory, 'CACHE');
  assert.equal(shared.url, 'file:///cache/file.zip');
});
test('Display cards omit the plugin action menu and generated URL list', () => {
  const { MemoCard } = load('src/components/MemoCard.ts', { obsidian: {} });
  assert.equal(MemoCard.prototype.openMenu, undefined);
  assert.equal(MemoCard.prototype.renderDetectedLinks, undefined);
});

test('Sidebar drop commits once on release; touch scrolling and canceled gestures do not reorder', () => {
  const { bindSidebarDrag } = load('src/components/MemoReorder.ts');
  const doc = new EventTarget();
  const win = new EventTarget();
  let hold;
  Object.assign(win, { setTimeout(fn) { hold = fn; return 1; }, clearTimeout() { hold = undefined; },
    requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} });
  doc.defaultView = win;
  const classes = () => { const values = new Set(); return { addClass: n => values.add(n),
    removeClass: (...names) => names.forEach(n => values.delete(n)), hasClass: n => values.has(n) }; };
  const host = { ...classes(), children: [], parentElement: null, contains: n => host.children.includes(n) };
  for (const [i, key] of ['a', 'b', 'c'].entries()) {
    const row = Object.assign(new EventTarget(), classes(), { dataset: { sortKey: key, sortGroup: 'memo' },
      ownerDocument: doc, isConnected: true, parentElement: host, closest() { return this; },
      setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {},
      getBoundingClientRect: () => ({ top: i * 40, bottom: (i + 1) * 40, height: 40 }) });
    host.children.push(row);
  }
  const [first, , last] = host.children;
  doc.elementFromPoint = () => last;
  const saved = [];
  bindSidebarDrag(first, first, 'memo', keys => saved.push(keys));
  const down = { button: 0, pointerId: 7, isPrimary: true, clientX: 15, clientY: 10 };
  const moved = { ...down, clientY: 115, pointerType: 'touch' };
  send(first, 'pointerdown', down);
  send(doc, 'pointermove', moved);
  send(doc, 'pointerup', moved);
  assert.equal(hold, undefined);
  assert.equal(saved.length, 0);
  send(first, 'pointerdown', down);
  hold();
  send(doc, 'pointercancel', moved);
  assert.equal(saved.length, 0);
  for (const pointerType of ['mouse', 'touch']) {
    send(first, 'pointerdown', down);
    if (pointerType === 'touch') hold();
    send(doc, 'pointermove', { ...moved, pointerType });
    send(doc, 'pointerup', moved);
    assert.deepEqual(saved.at(-1), ['b', 'c', 'a']);
    assert.equal(host.hasClass('is-arranging'), false);
  }
  assert.equal(saved.length, 2);
});

test('Desktop upload remembers the source directory across picks and preserves native file paths', async () => {
  const source = path.join(path.resolve('photos'), 'image.png');
  let seed, lastOptions, cancel = false;
  const app = {
    loadLocalStorage() { return seed; },
    saveLocalStorage(key, value) { seed = value; },
  };
  const { pickUploadFiles, getDesktopUploadPath } = load('src/services/UploadPicker.ts', {
    obsidian: { Platform: { isDesktopApp: true } },
    electron: { remote: { dialog: { showOpenDialog(options) {
      lastOptions = options;
      return { canceled: cancel, filePaths: cancel ? [] : [source] };
    } } } },
    'fs/promises': { readFile: async () => Uint8Array.from([0, 255, 1]) },
  });
  const [file] = await pickUploadFiles(app, '*/*', () => 'image/png');
  assert.equal(getDesktopUploadPath(file), source);
  assert.equal(file.type, 'image/png');
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [0, 255, 1]);
  cancel = true;
  assert.deepEqual(await pickUploadFiles(app, '*/*', () => ''), []);
  assert.equal(lastOptions.defaultPath, path.dirname(source));
  assert.equal(seed, path.dirname(source));
});

test('Reading Copy uses the editor label and copies exactly the text selected before the menu opened', async () => {
  let copy, title, icon, copied;
  class Menu {
    addItem(configure) {
      configure({ setTitle(value) { title = value; return this; }, setIcon(value) { icon = value; return this; },
        setDisabled() { return this; }, onClick(callback) { copy = callback; } });
    }
    showAtMouseEvent() {}
  }
  const api = load('src/components/TextEditingMenu.ts', {
    obsidian: { Menu }, navigator: { clipboard: { async writeText(text) { copied = text; } } },
  });
  let text = '  选择\n部分 ';
  const node = {};
  const selected = { isCollapsed: false, anchorNode: node, focusNode: node, toString: () => text };
  const container = { ownerDocument: { getSelection: () => selected }, contains: n => n === node };
  const event = new Event('contextmenu', { cancelable: true });
  assert.equal(api.openReadingCopyMenu(container, event), true);
  assert.ok(event.defaultPrevented);
  assert.equal(title, '复制');
  assert.equal(icon, 'copy');
  text = '';
  await copy();
  assert.equal(copied, '  选择\n部分 ');
  selected.focusNode = {};
  assert.equal(api.openReadingCopyMenu(container, event), false);
});

test('Image and Word attachments open without creating an Obsidian leaf', async () => {
  class TFile {}
  class Modal {
    constructor() {
      this.modalEl = { addClass() {} };
      this.contentEl = { createEl(tag, options) { assert.equal(tag, 'img'); assert.equal(options.attr.src, 'image-preview'); } };
    }
    setTitle() {}
    open() { previewed = true; }
  }
  let previewed = false, opened;
  const file = Object.assign(new TFile(), { path: 'files/照片.png', name: '照片.png' });
  const app = { vault: { getAbstractFileByPath: () => file, getResourcePath: () => 'image-preview' },
    openWithDefaultApp: async path => { opened = path; } };
  const { AttachmentService } = load('src/services/AttachmentService.ts', { obsidian: { TFile, Modal, FuzzySuggestModal: class {} } });
  const service = new AttachmentService(app, {}, () => ({}));
  await service.openAttachment({ path: file.path, name: file.name, mime: 'image/png' });
  assert.ok(previewed);
  file.path = 'files/report.DOCX';
  file.name = 'report.DOCX';
  await service.openAttachment({ path: file.path, name: file.name, mime: 'application/octet-stream' });
  assert.equal(opened, file.path);
});
