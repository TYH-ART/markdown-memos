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
const { bindTitleToBody } = load('src/components/TitleBodyInput.ts', { obsidian: { Notice: class {} } });

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

test('Sidebar copy and title paste omit storage blank lines while preserving indentation and paragraph breaks', () => {
  const { memoClipboardText } = load('src/utils.ts', { obsidian: {} });
  assert.equal(memoClipboardText('\r\n\r\n\r\n\t\r\n    正文\r\n\r\n下一段'), '    正文\n\n下一段');
  const text = memoClipboardText('标题\n\n\n正文\n\n下一段');
  assert.equal(text, '标题\n正文\n\n下一段');
  const title = new Control(''), body = new Control('');
  bindTitleToBody(title, body);
  send(title, 'paste', { clipboardData: { getData: () => text } });
  assert.equal(title.value, '标题');
  assert.equal(body.value, '正文\n\n下一段');
});

test('Upload, re-read the memo and download everyday file types without changing names or bytes', async () => {
  const fs = require('node:fs/promises');
  const dir = await mkdtemp(path.join(tmpdir(), 'memos-attachment-flow-'));
  try {
    const output = path.join(dir, 'exports');
    const longName = '设备'.repeat(40) + '.pdf';
    const names = ['报告.docx', '表格.XLSX', '演示.pptx', longName, '旧文档.doc', '数据.csv',
      '文本.txt', '笔记.md', '照片.jpg', '截屏.png', '手机.heic', '录像.mp4', '录音.m4a',
      '备份.zip', '素材.7z', '设置.json', '未知格式.abc', '空文件.txt'];
    const sources = names.map(name => path.join(dir, name));
    const bytes = names.map((name, i) => name === '空文件.txt' ? Buffer.alloc(0) : Buffer.from([0, i, 31, 127, 128, 254, 255]));
    await Promise.all(sources.map((name, i) => fs.writeFile(name, bytes[i])));

    class TFile { constructor(path) { this.path = path; this.name = path.split('/').pop(); this.stat = { ctime: 1, mtime: 1 }; } }
    class TFolder {}
    const nodes = new Map();
    const vault = {
      getAbstractFileByPath: path => nodes.get(path),
      createFolder: async path => nodes.set(path, new TFolder()),
      create: async (path, text) => { const file = Object.assign(new TFile(path), { text }); nodes.set(path, file); return file; },
      read: async file => file.text, cachedRead: async file => file.text,
      modify: async (file, text) => { file.text = text; },
      async createBinary(path, buffer) {
        assert.ok(Buffer.byteLength(path.split('/').pop()) <= 255);
        assert.ok(!nodes.has(path));
        const file = Object.assign(new TFile(path), { buffer: buffer.slice(0) });
        nodes.set(path, file);
        return file;
      },
      readBinary: async file => file.buffer.slice(0),
    };
    const environment = {
      obsidian: { normalizePath: path => path, TFile, TFolder, FuzzySuggestModal: class {},
        parseYaml: JSON.parse, stringifyYaml: JSON.stringify, Notice: class {},
        Platform: { isDesktop: true, isDesktopApp: true } },
      electron: { remote: { dialog: { showOpenDialog: async () => ({ filePaths: sources }) } } },
    };
    const app = { vault, metadataCache: { getFileCache: () => null }, loadLocalStorage: () => output, saveLocalStorage() {} };
    const settings = () => ({ memoFolder: 'Memos', attachmentFolder: '' });
    const { MemoRepository } = load('src/services/MemoRepository.ts', environment);
    const repo = new MemoRepository(app, settings);
    const { AttachmentService } = load('src/services/AttachmentService.ts', environment);
    const service = new AttachmentService(app, repo, settings);
    const memo = await repo.createMemo('', { allowEmpty: true });
    assert.equal(await service.addExternalAttachments(memo.file), names.length);
    const stored = await repo.getMemo(memo.file);
    assert.deepEqual(stored.attachments.map(a => a.name), names);
    for (const [i, attachment] of stored.attachments.entries()) {
      assert.equal(attachment.size, bytes[i].length);
      assert.equal(path.extname(attachment.path), path.extname(names[i]));
      if (names[i] !== '未知格式.abc') assert.notEqual(attachment.mime, 'application/octet-stream');
      await service.downloadAttachment(attachment);
      assert.deepEqual(await fs.readFile(path.join(output, names[i])), bytes[i]);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Queued and attachment-only records keep their submitted notebook in the written file', async () => {
  const { MemoRepository } = load('src/services/MemoRepository.ts', { obsidian: {
    normalizePath: value => value, stringifyYaml: value => JSON.stringify(value),
  } });
  const settings = { memoFolder: 'Memos', activeMemoNotebookId: 'travel' };
  const files = [];
  const repo = new MemoRepository({ vault: { create: async (name, markdown) => {
    files.push(markdown);
    return { path: name };
  } } }, () => settings);
  repo.ensureFolder = async () => {};
  repo.getUniqueMemoPath = () => 'new.md';
  repo.readMemo = async file => ({ file });
  const first = repo.createMemo('hello');
  settings.activeMemoNotebookId = 'other';
  const options = { notebookId: 'private', allowEmpty: true };
  const second = repo.createMemo('', options);
  options.notebookId = 'other';
  await Promise.all([first, second]);
  assert.deepEqual(files.map(markdown => JSON.parse(markdown.split('\n')[1]).notebookId), ['travel', 'private']);
});

test('Expanding a notebook selects it without closing the mobile sidebar', async () => {
  const { MemosView } = load('src/views/MemosView.ts', { obsidian: {
    ItemView: class {}, Modal: class {}, FuzzySuggestModal: class {}, PluginSettingTab: class {},
  } });
  const view = { plugin: { settings: { activeMemoNotebookId: 'default' }, saveSettings: async () => {} },
    renderMobileLibrary() {}, refresh: async () => {} };
  await MemosView.prototype.selectNotebook.call(view, { id: 'travel', private: false }, false);
  assert.equal(view.activeNotebookId, 'travel');
  assert.equal(view.expandedNotebookId, 'travel');
  assert.equal(view.plugin.settings.activeMemoNotebookId, 'travel');
  assert.equal(view.mobileDetail, false);
});

test('Mobile double tap enters editing exactly once and ignores a hold, selection, or pan', () => {
  const { bindMobileDoubleTap } = load('src/components/MobileDoubleTap.ts');
  const root = new EventTarget();
  let edits = 0, selectable = true;
  bindMobileDoubleTap(root, () => selectable, () => { edits++; });
  const pointer = (type, t, y = 0) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'timeStamp', { value: t });
    Object.assign(event, { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 0, clientY: y });
    root.dispatchEvent(event);
    return event;
  };
  const tap = t => { pointer('pointerdown', t); pointer('pointerup', t + 50); };
  tap(10); tap(150);
  assert.equal(edits, 1);
  assert.equal(pointer('click', 205).defaultPrevented, true);
  pointer('pointerdown', 500); pointer('pointerup', 1000); tap(1040);
  tap(1800); pointer('pointerdown', 1900); pointer('pointermove', 1910, 100); pointer('pointerup', 1940);
  selectable = false;
  tap(2200); tap(2300);
  assert.equal(edits, 1);
});

test('New memo shortcut focuses the body on desktop and mobile without a delayed title focus', () => {
  const { MemosView } = load('src/views/MemosView.ts', { obsidian: {
    ItemView: class {}, Modal: class {}, FuzzySuggestModal: class {}, PluginSettingTab: class {},
  } });
  for (const mobile of [false, true]) {
    const body = new Control('');
    MemosView.prototype.composerFocus.call({ isMobileLayout: () => mobile, detailContentEl: {
      querySelector: selector => selector === '.obsidian-memos-composer__input' ? body : null,
    } });
    assert.equal(body.focused, true);
  }
});

test('Body paste menu replaces only the selected body range even if the menu moves the caret', async () => {
  const actions = new Map();
  class Menu {
    addItem(build) {
      let label;
      build({ setTitle(value) { label = value; return this; }, setIcon() { return this; }, setDisabled() { return this; },
        onClick(fn) { actions.set(label, fn); return this; } });
    }
    onHide() {}
    showAtMouseEvent() {}
  }
  const { openTextEditingMenu } = load('src/components/TextEditingMenu.ts', {
    obsidian: { Menu }, navigator: { clipboard: { readText: async () => '第一行\nhttps://example.com' } },
  });
  const title = new Control('原标题'), body = new Control('前abc后');
  body.classList = { add() {}, remove() {} };
  body.setRangeText = function(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); };
  bindTitleToBody(title, body);
  body.setSelectionRange(1, 4);
  openTextEditingMenu(body, { preventDefault() {}, stopPropagation() {} });
  body.setSelectionRange(0, 0);
  actions.get('粘贴')();
  await Promise.resolve();
  assert.equal(title.value, '原标题');
  assert.equal(body.value, '前第一行\nhttps://example.com后');
  assert.equal(body.focused, true);
});

test('Mobile text selection picks the touched URL or Han character and only opens a complete HTTP(S) selection', () => {
  const { initialWord, selectedWebUrl } = load('src/components/MobileSelection.ts', { obsidian: {} });
  const text = '请到https://example.org/a?q=7，继续';
  const [a, b] = initialWord(text, text.indexOf('org'));
  assert.equal(text.slice(a, b), 'https://example.org/a?q=7');
  assert.deepEqual(initialWord(text, 1), [1, 2]);
  assert.equal(selectedWebUrl('  HTTP://example.org:8080/a  '), 'http://example.org:8080/a');
  for (const invalid of ['javascript:alert(1)', 'file:///etc/test', 'https://', 'https://a.example and text',
      'https://user:pass@example.org', 'https://example.org\nother']) {
    assert.equal(selectedWebUrl(invalid), undefined);
  }
});

test('New pins precede saved ranks, unpin removes their rank, repin returns to the front', async () => {
  const { MemoRepository } = load('src/services/MemoRepository.ts', { obsidian: {} });
  const settings = { pinnedMemoOrder: ['old'] };
  const file = { path: 'new' };
  let pinned = false, saves = 0;
  const repo = new MemoRepository({}, () => settings, async () => { saves++; });
  repo.requireFile = () => file;
  repo.updateFrontmatter = async (f, change) => { const meta = { pinned }; change(meta); pinned = meta.pinned; };
  repo.readMemo = async () => ({ pinned });
  await repo.togglePinned(file);
  assert.deepEqual(settings.pinnedMemoOrder, ['new', 'old']);
  await repo.togglePinned(file);
  assert.deepEqual(settings.pinnedMemoOrder, ['old']);
  await repo.togglePinned(file);
  assert.deepEqual(settings.pinnedMemoOrder, ['new', 'old']);
  assert.equal(saves, 3);
});
test('Title overflow preserves Unicode and moves into the body', () => {
  const title = new Control('中'.repeat(85) + '😀'), body = new Control('正文');
  bindTitleToBody(title, body);
  send(title, 'input', {});
  assert.equal(Buffer.byteLength(title.value), 252);
  assert.equal(body.value, '中😀\n正文');
});
test('Desktop whole-card menu distinguishes body-only from title and body', async () => {
  const entries = [], copied = [];
  class Menu {
    addItem(fn) {
      const item = { setTitle(t) { this.title=t; return this; }, setIcon() { return this; }, setDisabled() { return this; }, onClick(fn) { this.click=fn; } };
      fn(item); entries.push(item);
    }
    showAtMouseEvent() {}
  }
  const { openReadingCopyMenu } = load('src/components/TextEditingMenu.ts', { obsidian: { Menu }, navigator: { clipboard: { writeText: async t => copied.push(t) } } });
  openReadingCopyMenu({}, new Event('contextmenu', { cancelable: true }), '标题\n\n正文');
  assert.deepEqual(entries.map(e => e.title), ['复制', '复制所有']);
  for(const entry of entries) await entry.click();
  assert.deepEqual(copied, ['正文', '标题\n正文']);
});
