/* Markdown Memos - MIT License */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianMemosPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian16 = require("obsidian");

// src/services/MemoRepository.ts
var import_obsidian2 = require("obsidian");

// src/utils.ts
var import_obsidian = require("obsidian");
var DEFAULT_MEMO_FOLDER = "Memos";
function normalizeMemoFolder(input) {
  const segments = input.trim().replace(/\\/g, "/").split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  return (0, import_obsidian.normalizePath)(segments.join("/") || DEFAULT_MEMO_FOLDER);
}
function isPathInsideFolder(path, folder) {
  const normalizedPath = (0, import_obsidian.normalizePath)(path);
  const normalizedFolder = normalizeMemoFolder(folder);
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
}
function pad(value) {
  return String(value).padStart(2, "0");
}
function formatMemoBasename(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(
    date.getSeconds()
  )}`;
}
function formatLocalIso(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffset / 60));
  const offsetRemainder = pad(absoluteOffset % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}${sign}${offsetHours}:${offsetRemainder}`;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function splitMemoContent(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  const lineBreak = normalized.indexOf("\n");
  if (lineBreak === -1) {
    return { title: normalized, body: "" };
  }
  const title = normalized.slice(0, lineBreak);
  const remainder = normalized.slice(lineBreak + 1);
  return { title, body: remainder.startsWith("\n") ? remainder.slice(1) : remainder };
}
function joinMemoContent(title, body) {
  const normalizedTitle = title.replace(/[\r\n]+/g, " ");
  return body ? `${normalizedTitle}

${body}` : normalizedTitle;
}
function memoClipboardText(content) {
  const { title, body } = splitMemoContent(content);
  const firstParagraph = body.replace(/^(?:[^\S\n]*\n)+/, "");
  return [title.trim() ? title : "", firstParagraph].filter(Boolean).join("\n");
}
function extractMemoTagOccurrences(content) {
  const tags = [];
  const pattern = /#([\p{L}\p{N}_/-]+)/gu;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const name = match[1];
    if (name) tags.push(`#${name}`);
  }
  return tags;
}
function extractMemoTags(content) {
  return Array.from(new Set(extractMemoTagOccurrences(content)));
}

// src/services/MemoRepository.ts
var FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)^(?:---|\.\.\.)\r?$\r?\n?/m;
var MemoRepository = class {
  constructor(app, getSettings, saveSettings = async () => {
  }) {
    this.app = app;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
    this.createQueue = Promise.resolve();
  }
  get folder() {
    return normalizeMemoFolder(this.getSettings().memoFolder);
  }
  createMemo(rawContent, options = {}) {
    var _a;
    const destination = (_a = options.notebookId) != null ? _a : this.getSettings().activeMemoNotebookId;
    const submitted = { ...options, notebookId: destination };
    const operation = this.createQueue.then(() => this.createMemoInternal(rawContent, submitted));
    this.createQueue = operation.then(
      () => void 0,
      () => void 0
    );
    return operation;
  }
  async createMemoInternal(rawContent, options) {
    var _a;
    if (!rawContent.trim() && !options.allowEmpty) {
      throw new Error("Memo \u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
    }
    const content = rawContent;
    await this.ensureFolder(this.folder);
    const now = /* @__PURE__ */ new Date();
    const path = this.getUniqueMemoPath(now);
    const timestamp = formatLocalIso(now);
    const markdown = this.serializeDocument(
      {
        created: timestamp,
        modified: timestamp,
        pinned: false,
        source: "markdown-memos",
        type: (_a = options.type) != null ? _a : "note",
        completed: false,
        completedAt: null,
        attachments: [],
        notebookId: options.notebookId,
        trashedAt: null
      },
      content,
      false
    );
    const file = await this.app.vault.create(path, markdown);
    return this.readMemo(file);
  }
  async updateMemo(file, rawContent) {
    if (!rawContent.trim()) {
      throw new Error("Memo \u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
    }
    const content = rawContent;
    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
    if (!(currentFile instanceof import_obsidian2.TFile)) {
      throw new Error("Memo \u6587\u4EF6\u5DF2\u4E0D\u5B58\u5728");
    }
    const original = await this.app.vault.read(currentFile);
    const parsed = this.parseDocument(original);
    const updatedFrontmatter = {
      ...parsed.frontmatter,
      modified: formatLocalIso(/* @__PURE__ */ new Date())
    };
    await this.app.vault.modify(currentFile, this.serializeDocument(updatedFrontmatter, content, false));
    return this.readMemo(currentFile);
  }
  async deleteMemo(file) {
    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
    if (!(currentFile instanceof import_obsidian2.TFile)) {
      return;
    }
    await this.app.fileManager.trashFile(currentFile);
  }
  async trashMemo(file) {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.trashedAt = formatLocalIso(/* @__PURE__ */ new Date());
    }, false);
    return this.readMemo(currentFile);
  }
  async restoreMemo(file) {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.trashedAt = null;
    }, false);
    return this.readMemo(currentFile);
  }
  async emptyTrash(notebookId) {
    const memos = await this.getMemos();
    const trashed = memos.filter((memo) => memo.trashedAt && (!notebookId || memo.notebookId === notebookId));
    for (const memo of trashed) await this.deleteMemo(memo.file);
  }
  async moveMemosToNotebook(fromNotebookId, toNotebookId) {
    const memos = await this.getMemos();
    for (const memo of memos) {
      if (memo.notebookId !== fromNotebookId) continue;
      await this.moveMemoToNotebook(memo.file, toNotebookId);
    }
  }
  async moveMemoToNotebook(file, notebookId) {
    var _a;
    const currentFile = this.requireFile(file);
    const memos = await this.getMemos();
    if (((_a = memos.find((memo) => memo.file.path === currentFile.path)) == null ? void 0 : _a.notebookId) === notebookId) return this.readMemo(currentFile);
    const moveOrder = Math.max(Date.now(), ...memos.map((memo) => Number(memo.frontmatter.notebookMoveOrder) || 0)) + 1;
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.notebookMoveOrder = moveOrder;
      frontmatter.notebookId = notebookId;
    });
    return this.readMemo(currentFile);
  }
  async togglePinned(file) {
    var _a;
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.pinned = frontmatter.pinned !== true;
    }, false);
    const memo = await this.readMemo(currentFile);
    const settings = this.getSettings();
    const order = ((_a = settings.pinnedMemoOrder) != null ? _a : []).filter((path) => path !== currentFile.path);
    settings.pinnedMemoOrder = memo.pinned ? [currentFile.path, ...order] : order;
    await this.saveSettings();
    return memo;
  }
  async setMemoType(file, type) {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.type = type;
      if (type === "note") {
        frontmatter.completed = false;
        frontmatter.completedAt = null;
      }
    });
    return this.readMemo(currentFile);
  }
  async toggleTaskCompleted(file) {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      const completed = frontmatter.completed !== true;
      frontmatter.type = "task";
      frontmatter.completed = completed;
      frontmatter.completedAt = completed ? formatLocalIso(/* @__PURE__ */ new Date()) : null;
    });
    return this.readMemo(currentFile);
  }
  async setArchived(file, archived) {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.archived = archived;
    });
    return this.readMemo(currentFile);
  }
  async addAttachment(file, attachment) {
    const currentFile = this.requireFile(file);
    const original = await this.app.vault.read(currentFile);
    const parsed = this.parseDocument(original);
    const attachments = this.parseAttachments(parsed.frontmatter.attachments);
    if (!attachments.some((item) => item.path === attachment.path)) {
      attachments.push(attachment);
    }
    const content = this.normalizeStoredContent(parsed.content);
    const frontmatter = {
      ...parsed.frontmatter,
      modified: formatLocalIso(/* @__PURE__ */ new Date()),
      attachments
    };
    await this.app.vault.modify(currentFile, this.serializeDocument(frontmatter, content, false));
    return this.readMemo(currentFile);
  }
  async removeAttachment(file, attachmentPath) {
    const currentFile = this.requireFile(file);
    const original = await this.app.vault.read(currentFile);
    const parsed = this.parseDocument(original);
    const attachments = this.parseAttachments(parsed.frontmatter.attachments).filter((item) => item.path !== attachmentPath);
    const escapedPath = attachmentPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const referencePattern = new RegExp(`^!?\\[\\[${escapedPath}(?:\\|[^\\]]*)?\\]\\]\\s*$`, "gm");
    const content = this.normalizeStoredContent(parsed.content).replace(referencePattern, "").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "");
    const frontmatter = {
      ...parsed.frontmatter,
      modified: formatLocalIso(/* @__PURE__ */ new Date()),
      attachments
    };
    await this.app.vault.modify(currentFile, this.serializeDocument(frontmatter, content, false));
    return this.readMemo(currentFile);
  }
  async getMemo(file) {
    return this.readMemo(file);
  }
  async getMemos() {
    const folder = this.app.vault.getAbstractFileByPath(this.folder);
    if (!folder) {
      return [];
    }
    if (!(folder instanceof import_obsidian2.TFolder)) {
      throw new Error(`Memo \u4FDD\u5B58\u8DEF\u5F84\u4E0D\u662F\u6587\u4EF6\u5939\uFF1A${this.folder}`);
    }
    const files = folder.children.filter((child) => child instanceof import_obsidian2.TFile && child.extension.toLowerCase() === "md");
    const settled = await Promise.allSettled(files.map((file) => this.readMemo(file)));
    const memos = [];
    settled.forEach((result, index) => {
      var _a, _b;
      if (result.status === "fulfilled") {
        memos.push(result.value);
        return;
      }
      console.warn(`[Markdown Memos] \u65E0\u6CD5\u8BFB\u53D6 ${(_b = (_a = files[index]) == null ? void 0 : _a.path) != null ? _b : "\u672A\u77E5\u6587\u4EF6"}\uFF0C\u5DF2\u8DF3\u8FC7\u3002`, result.reason);
    });
    return memos.sort((left, right) => {
      const createdDifference = right.created.getTime() - left.created.getTime();
      return createdDifference || right.file.stat.ctime - left.file.stat.ctime || right.file.path.localeCompare(left.file.path);
    });
  }
  async readMemo(file) {
    var _a, _b, _c;
    const markdown = await this.app.vault.cachedRead(file);
    const parsed = this.parseDocument(markdown);
    const created = (_a = this.parseDate(parsed.frontmatter.created)) != null ? _a : new Date(file.stat.ctime);
    const modified = (_b = this.parseDate(parsed.frontmatter.modified)) != null ? _b : new Date(file.stat.mtime);
    const type = parsed.frontmatter.type === "task" ? "task" : "note";
    const cache = this.app.metadataCache.getFileCache(file);
    const content = this.normalizeStoredContent(parsed.content);
    const cachedTags = cache ? (_c = (0, import_obsidian2.getAllTags)(cache)) != null ? _c : [] : [];
    const tags = Array.from(/* @__PURE__ */ new Set([...cachedTags, ...extractMemoTags(content)])).sort((left, right) => left.localeCompare(right));
    return {
      file,
      content,
      created,
      modified,
      pinned: parsed.frontmatter.pinned === true,
      source: typeof parsed.frontmatter.source === "string" ? parsed.frontmatter.source : void 0,
      tags,
      type,
      completed: type === "task" && parsed.frontmatter.completed === true,
      completedAt: this.parseDate(parsed.frontmatter.completedAt),
      archived: parsed.frontmatter.archived === true,
      notebookId: typeof parsed.frontmatter.notebookId === "string" && parsed.frontmatter.notebookId ? parsed.frontmatter.notebookId : "default",
      trashedAt: this.parseDate(parsed.frontmatter.trashedAt),
      attachments: this.parseAttachments(parsed.frontmatter.attachments),
      frontmatter: parsed.frontmatter
    };
  }
  parseDocument(markdown) {
    var _a, _b;
    const match = markdown.match(FRONTMATTER_PATTERN);
    if (!match) {
      return { frontmatter: {}, content: markdown };
    }
    const yamlSource = (_b = (_a = match[1]) == null ? void 0 : _a.trim()) != null ? _b : "";
    let frontmatter = {};
    if (yamlSource) {
      const parsed = (0, import_obsidian2.parseYaml)(yamlSource);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("YAML Frontmatter \u5FC5\u987B\u662F\u5BF9\u8C61");
      }
      frontmatter = parsed;
    }
    return {
      frontmatter,
      content: markdown.slice(match[0].length)
    };
  }
  serializeDocument(frontmatter, content, trimContent = true) {
    const body = trimContent ? content.trim() : content;
    return `---
${(0, import_obsidian2.stringifyYaml)(frontmatter).trimEnd()}
---

${body}${body.endsWith("\n") ? "" : "\n"}`;
  }
  normalizeStoredContent(content) {
    const normalized = content.replace(/\r\n/g, "\n");
    const withoutSeparator = normalized.startsWith("\n") ? normalized.slice(1) : normalized;
    return withoutSeparator.endsWith("\n") ? withoutSeparator.slice(0, -1) : withoutSeparator;
  }
  parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value !== "string" && typeof value !== "number") {
      return void 0;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? void 0 : date;
  }
  parseAttachments(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item;
      if (typeof candidate.path !== "string" || typeof candidate.name !== "string") {
        return [];
      }
      return [{
        path: (0, import_obsidian2.normalizePath)(candidate.path),
        name: candidate.name,
        mime: typeof candidate.mime === "string" ? candidate.mime : "application/octet-stream",
        size: typeof candidate.size === "number" ? candidate.size : void 0,
        managed: candidate.managed !== false
      }];
    });
  }
  requireFile(file) {
    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
    if (!(currentFile instanceof import_obsidian2.TFile)) {
      throw new Error("Memo \u6587\u4EF6\u5DF2\u4E0D\u5B58\u5728");
    }
    return currentFile;
  }
  async updateFrontmatter(file, update, updateModified = true) {
    await this.app.fileManager.processFrontMatter(file, (rawFrontmatter) => {
      const frontmatter = rawFrontmatter && typeof rawFrontmatter === "object" && !Array.isArray(rawFrontmatter) ? rawFrontmatter : {};
      update(frontmatter);
      if (updateModified) frontmatter.modified = formatLocalIso(/* @__PURE__ */ new Date());
    });
  }
  getUniqueMemoPath(date) {
    const basename = formatMemoBasename(date);
    let suffix = 0;
    while (true) {
      const filename = `${basename}${suffix === 0 ? "" : `-${suffix}`}.md`;
      const path = (0, import_obsidian2.normalizePath)(`${this.folder}/${filename}`);
      if (!this.app.vault.getAbstractFileByPath(path)) {
        return path;
      }
      suffix += 1;
    }
  }
  async ensureFolder(folderPath) {
    const segments = normalizeMemoFolder(folderPath).split("/");
    let currentPath = "";
    for (const segment of segments) {
      currentPath = (0, import_obsidian2.normalizePath)(currentPath ? `${currentPath}/${segment}` : segment);
      const existing = this.app.vault.getAbstractFileByPath(currentPath);
      if (existing instanceof import_obsidian2.TFolder) {
        continue;
      }
      if (existing) {
        throw new Error(`\u65E0\u6CD5\u521B\u5EFA Memo \u6587\u4EF6\u5939\uFF1A${currentPath} \u5DF2\u88AB\u6587\u4EF6\u5360\u7528`);
      }
      await this.app.vault.createFolder(currentPath);
    }
  }
};

// src/services/AttachmentService.ts
var import_obsidian5 = require("obsidian");

// src/services/UploadPicker.ts
var import_obsidian3 = require("obsidian");

// src/services/DesktopDialog.ts
function getDesktopDialog() {
  var _a;
  try {
    const remote = (_a = require("electron").remote) != null ? _a : require("@electron/remote");
    return remote.dialog;
  } catch (e) {
    return void 0;
  }
}

// src/services/UploadPicker.ts
var selectedPaths = /* @__PURE__ */ new WeakMap();
var lastFolderKey = "markdown-memos:last-upload-folder";
function getDesktopUploadPath(file) {
  var _a, _b;
  if (!import_obsidian3.Platform.isDesktopApp) return "";
  const known = selectedPaths.get(file) || file.path;
  if (known) return known;
  try {
    return (_b = (_a = require("electron").webUtils) == null ? void 0 : _a.getPathForFile(file)) != null ? _b : "";
  } catch (e) {
    return "";
  }
}
async function pickUploadFiles(app, accept, mimeFor, mobileSource) {
  if (mobileSource) {
    const filter = mobileSource === "album" ? "image/*,video/*" : mobileSource === "camera" ? "image/*" : "*/*";
    return pickBrowserFiles(app, filter, mobileSource === "camera");
  }
  if (accept === "*/*") {
    const dialog = import_obsidian3.Platform.isDesktopApp ? getDesktopDialog() : void 0;
    if (dialog) {
      const saved = app.loadLocalStorage ? app.loadLocalStorage(lastFolderKey) : window.localStorage.getItem(lastFolderKey);
      const result = await dialog.showOpenDialog({
        title: "\u4E0A\u4F20\u9644\u4EF6",
        properties: ["openFile", "multiSelections"],
        defaultPath: typeof saved === "string" ? saved : void 0
      });
      if (result.canceled || !result.filePaths.length) return [];
      const fs = require("fs/promises");
      const path = require("path");
      const dir = path.dirname(result.filePaths[0]);
      if (app.saveLocalStorage) app.saveLocalStorage(lastFolderKey, dir);
      else window.localStorage.setItem(lastFolderKey, dir);
      const files = [];
      for (const source of result.filePaths) {
        const name = path.basename(source);
        const bytes = await fs.readFile(source);
        const file = new File([new Uint8Array(bytes)], name, { type: mimeFor(name) });
        selectedPaths.set(file, source);
        files.push(file);
      }
      return files;
    }
    const win = app.workspace.containerEl.ownerDocument.defaultView;
    if (win == null ? void 0 : win.showOpenFilePicker) {
      try {
        const handles = await win.showOpenFilePicker({ id: "markdown-memos-upload", multiple: true });
        return await Promise.all(handles.map((handle) => handle.getFile()));
      } catch (error) {
        const name = error.name;
        if (name === "AbortError") return [];
        if (name !== "SecurityError" && name !== "NotAllowedError") throw error;
      }
    }
  }
  return pickBrowserFiles(app, accept);
}
function pickBrowserFiles(app, accept, camera = false) {
  return new Promise((resolve) => {
    const input = app.workspace.containerEl.createEl("input", { type: "file" });
    input.multiple = !camera;
    if (camera) input.setAttribute("capture", "environment");
    input.accept = accept;
    input.hidden = true;
    const finish = (files) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => {
      var _a;
      return finish(Array.from((_a = input.files) != null ? _a : []));
    }, { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });
    input.click();
  });
}

// src/services/FileExport.ts
var import_obsidian4 = require("obsidian");
var downloadKey = "markdown-memos-download-folder";
function getDownloadFolder(app) {
  var _a;
  const value = app.loadLocalStorage ? app.loadLocalStorage(downloadKey) : (_a = window.localStorage) == null ? void 0 : _a.getItem(downloadKey + ":" + app.vault.getName());
  return typeof value === "string" ? value.trim() : "";
}
function setDownloadFolder(app, folder) {
  if (app.saveLocalStorage) app.saveLocalStorage(downloadKey, folder.trim());
  else window.localStorage.setItem(downloadKey + ":" + app.vault.getName(), folder.trim());
}
function askDesktopPath(app, suggested) {
  return new Promise((resolve) => {
    const modal = new import_obsidian4.Modal(app);
    modal.setTitle("\u9009\u62E9\u4E0B\u8F7D\u4F4D\u7F6E");
    const input = modal.contentEl.createEl("input", { value: suggested, placeholder: "\u8F93\u5165\u5B8C\u6574\u4FDD\u5B58\u8DEF\u5F84\uFF08\u5305\u542B\u6587\u4EF6\u540D\uFF09" });
    const button = modal.contentEl.createEl("button", { text: "\u4FDD\u5B58", cls: "mod-cta" });
    button.onclick = () => {
      const path = require("path");
      if (!path.isAbsolute(input.value)) {
        new import_obsidian4.Notice("\u8BF7\u8F93\u5165\u5305\u542B\u6587\u4EF6\u540D\u7684\u7EDD\u5BF9\u8DEF\u5F84");
        return;
      }
      resolve(input.value);
      modal.close();
    };
    modal.onClose = () => resolve(void 0);
    modal.open();
  });
}
async function writeDesktopFile(app, folder, name, bytes) {
  var _a;
  const fs = require("fs/promises");
  const path = require("path");
  if (folder) {
    if (!path.isAbsolute(folder)) throw new Error("\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u586B\u5199\u7EDD\u5BF9\u4E0B\u8F7D\u8DEF\u5F84");
    await fs.mkdir(folder, { recursive: true });
    const { name: stem, ext } = path.parse(name);
    for (let index = 0; ; index++) {
      const dest2 = path.join(folder, index ? `${stem} (${index})${ext}` : name);
      try {
        await fs.writeFile(dest2, bytes, { flag: "wx" });
        return dest2;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
  }
  const dialog = getDesktopDialog();
  let dest;
  if (dialog) {
    const result = await dialog.showSaveDialog({ defaultPath: name, properties: ["showOverwriteConfirmation"] });
    if (!result.canceled) dest = result.filePath;
  } else {
    const win = (_a = app.workspace) == null ? void 0 : _a.containerEl.ownerDocument.defaultView;
    if (win == null ? void 0 : win.showSaveFilePicker) {
      const handle = await win.showSaveFilePicker({ suggestedName: name });
      const writer = await handle.createWritable();
      await writer.write(new Blob([new Uint8Array(bytes)]));
      await writer.close();
      new import_obsidian4.Notice(`\u5DF2\u4E0B\u8F7D\uFF1A${handle.name}`);
      return;
    }
    const os = require("os");
    dest = await askDesktopPath(app, path.join(os.homedir(), name));
  }
  if (dest) await fs.writeFile(dest, bytes, { flag: dialog ? "w" : "wx" });
  return dest;
}
async function saveInVault(app, folder, name, data) {
  if (folder !== "/" && (folder.startsWith("/") || folder.includes("\\") || folder.split("/").some((part) => part === ".." || part === ".") || folder.includes(":"))) {
    throw new Error("\u8BF7\u586B\u5199\u5E93\u5185\u6587\u4EF6\u5939\u540D\u79F0\uFF0C\u4F8B\u5982 Downloads");
  }
  const dir = folder === "/" ? "" : (0, import_obsidian4.normalizePath)(folder);
  if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 0; ; i++) {
    const file = i ? `${stem} (${i})${ext}` : name;
    const dest = (0, import_obsidian4.normalizePath)(dir ? `${dir}/${file}` : file);
    if (app.vault.getAbstractFileByPath(dest)) continue;
    await app.vault.createBinary(dest, data);
    new import_obsidian4.Notice(`\u5DF2\u4E0B\u8F7D\u5230\u5E93\u5185\uFF1A${dest}`);
    return;
  }
}
var systemPicker = Symbol("system-picker");
function chooseMobileFolder(app, allowSystem) {
  return new Promise((resolve) => {
    class FolderPicker extends import_obsidian4.FuzzySuggestModal {
      getItems() {
        const folders = app.vault.getAllFolders(true);
        return allowSystem ? [systemPicker, ...folders] : folders;
      }
      getItemText(folder) {
        return folder === systemPicker ? "\u6253\u5F00\u7CFB\u7EDF\u4FDD\u5B58\u6216\u5206\u4EAB\u83DC\u5355\u2026" : "\u5E93\u5185\uFF1A" + folder.path;
      }
      onChooseItem(folder) {
        resolve(folder === systemPicker ? folder : folder.path);
      }
      onClose() {
        super.onClose();
        window.setTimeout(() => resolve(void 0), 0);
      }
    }
    const picker = new FolderPicker(app);
    picker.setPlaceholder("\u9009\u62E9\u9644\u4EF6\u4E0B\u8F7D\u4F4D\u7F6E");
    picker.open();
  });
}
async function exportBinaryFile(app, data, name, mime) {
  var _a, _b;
  const folder = getDownloadFolder(app);
  name = name.replace(/[\\/:*?"<>|]/g, "-").replace(/^[.]+$|[. ]+$/g, "") || "attachment";
  if (import_obsidian4.Platform.isDesktop) {
    const bytes = new Uint8Array(data);
    const dest = await writeDesktopFile(app, folder, name, bytes);
    if (!dest) return;
    const fs = require("fs/promises");
    const saved = await fs.readFile(dest);
    if (saved.length !== bytes.length || !saved.every((byte, index) => byte === bytes[index])) {
      throw new Error("\u5BFC\u51FA\u6587\u4EF6\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u8F7D");
    }
    new import_obsidian4.Notice(`\u5DF2\u4E0B\u8F7D\u5230\uFF1A${dest}`);
    return;
  }
  if (folder) return saveInVault(app, folder, name, data);
  const plugins = (_a = window.Capacitor) == null ? void 0 : _a.Plugins;
  const nativeShare = Boolean((plugins == null ? void 0 : plugins.Filesystem) && plugins.Share);
  const file = nativeShare ? void 0 : new File([data], name, { type: mime || "application/octet-stream" });
  const selected = await chooseMobileFolder(app, nativeShare || Boolean(file && ((_b = navigator.canShare) == null ? void 0 : _b.call(navigator, { files: [file] }))));
  if (selected === void 0) return;
  if (selected !== systemPicker) return saveInVault(app, selected, name, data);
  if ((plugins == null ? void 0 : plugins.Filesystem) && plugins.Share) {
    const { uri } = await plugins.Filesystem.writeFile({
      path: `markdown-memos-exports/${Date.now()}-${Math.random().toString(36).slice(2)}/${name}`,
      directory: "CACHE",
      // Capacitor requires base64 with no text encoding for binary writes.
      data: (0, import_obsidian4.arrayBufferToBase64)(data),
      recursive: true
    });
    await plugins.Share.share({ title: name, url: uri, dialogTitle: "\u4FDD\u5B58\u9644\u4EF6" });
    return;
  }
  if (file) {
    await new Promise((resolve, reject) => {
      const modal = new import_obsidian4.Modal(app);
      modal.setTitle("\u4FDD\u5B58\u9644\u4EF6");
      modal.contentEl.createEl("p", { text: name });
      const button = modal.contentEl.createEl("button", { text: "\u9009\u62E9\u4FDD\u5B58\u4F4D\u7F6E", cls: "mod-cta" });
      modal.onClose = () => resolve();
      button.addEventListener("click", () => {
        void navigator.share({ files: [file] }).then(() => modal.close(), (error) => {
          if (error instanceof Error && error.name === "AbortError") return;
          reject(error instanceof Error ? error : new Error(String(error)));
          modal.close();
        });
      });
      modal.open();
    });
    return;
  }
}

// src/services/AttachmentService.ts
var AttachmentService = class {
  constructor(app, repository, getSettings) {
    this.app = app;
    this.repository = repository;
    this.getSettings = getSettings;
  }
  get folder() {
    const configured = this.getSettings().attachmentFolder.trim();
    return configured ? normalizeMemoFolder(configured) : (0, import_obsidian5.normalizePath)(`${this.repository.folder}/_attachments`);
  }
  async addExternalAttachments(memoFile) {
    const files = await this.pickExternalAttachments();
    return this.addExternalFiles(memoFile, files);
  }
  pickExternalAttachments(accept = "*/*", mobileSource) {
    return pickUploadFiles(this.app, accept, inferMime, mobileSource);
  }
  async addExternalFiles(memoFile, files) {
    if (files.length === 0) {
      return 0;
    }
    await this.ensureFolder(this.folder);
    let added = 0;
    for (const file of files) {
      const path = this.uniqueAttachmentPath(file.name);
      const data = await file.arrayBuffer();
      if (data.byteLength !== file.size) throw new Error(`\u9644\u4EF6\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF1A${file.name}`);
      const savedFile = await this.app.vault.createBinary(path, data);
      const savedData = new Uint8Array(await this.app.vault.readBinary(savedFile));
      const sourceData = new Uint8Array(data);
      if (savedData.length !== sourceData.length || !savedData.every((byte, index) => byte === sourceData[index])) {
        throw new Error(`\u9644\u4EF6\u4FDD\u5B58\u6821\u9A8C\u5931\u8D25\uFF1A${file.name}\uFF0C\u8BF7\u91CD\u65B0\u4E0A\u4F20`);
      }
      await this.repository.addAttachment(memoFile, {
        path,
        name: file.name,
        mime: file.type || inferMime(file.name),
        size: file.size,
        managed: true
      });
      added += 1;
    }
    return added;
  }
  async linkVaultFile(memoFile) {
    const linkedFile = await this.pickVaultAttachment(memoFile.path);
    if (!linkedFile) {
      return false;
    }
    await this.linkChosenVaultFile(memoFile, linkedFile);
    return true;
  }
  pickVaultAttachment(excludingPath) {
    return this.chooseVaultFile("\u94FE\u63A5 Vault \u6587\u4EF6", (file) => file.path !== excludingPath);
  }
  async linkChosenVaultFile(memoFile, linkedFile) {
    await this.repository.addAttachment(memoFile, {
      path: linkedFile.path,
      name: linkedFile.name,
      mime: inferMime(linkedFile.name),
      size: linkedFile.stat.size,
      managed: false
    });
  }
  async chooseMarkdownFile(title) {
    return this.chooseVaultFile(title, (file) => file.extension.toLowerCase() === "md");
  }
  async openAttachment(attachment) {
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    if (!(file instanceof import_obsidian5.TFile)) {
      new import_obsidian5.Notice(`\u9644\u4EF6\u4E0D\u5B58\u5728\uFF1A${attachment.name}`);
      return;
    }
    if (attachment.mime.startsWith("image/") || inferMime(file.name).startsWith("image/")) {
      this.previewImage(this.app.vault.getResourcePath(file), attachment.name);
      return;
    }
    try {
      const app = this.app;
      if (!app.openWithDefaultApp) throw new Error("\u5F53\u524D Obsidian \u7248\u672C\u65E0\u6CD5\u8C03\u7528\u7CFB\u7EDF\u5E94\u7528");
      await app.openWithDefaultApp(file.path);
    } catch (error) {
      new import_obsidian5.Notice(`\u6253\u5F00\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  previewImage(url, name) {
    const modal = new import_obsidian5.Modal(this.app);
    modal.setTitle(name);
    modal.modalEl.addClass("obsidian-memos-image-preview");
    modal.contentEl.createEl("img", { attr: { src: url, alt: name } });
    modal.open();
  }
  getResourceUrl(attachment) {
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    return file instanceof import_obsidian5.TFile ? this.app.vault.getResourcePath(file) : void 0;
  }
  async downloadAttachment(attachment) {
    try {
      const file = this.app.vault.getAbstractFileByPath(attachment.path);
      if (!(file instanceof import_obsidian5.TFile)) {
        new import_obsidian5.Notice(`\u9644\u4EF6\u4E0D\u5B58\u5728\uFF1A${attachment.name}`);
        return;
      }
      const data = await this.app.vault.readBinary(file);
      if (attachment.managed && attachment.size !== void 0 && data.byteLength !== attachment.size) {
        throw new Error("\u9644\u4EF6\u5927\u5C0F\u4E0E\u4E0A\u4F20\u8BB0\u5F55\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u7B49\u5F85\u540C\u6B65\u5B8C\u6210\u6216\u91CD\u65B0\u4E0A\u4F20\u539F\u6587\u4EF6");
      }
      await exportBinaryFile(this.app, data, attachment.name, attachment.mime);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      new import_obsidian5.Notice(`\u4E0B\u8F7D\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  async downloadExternalFile(file) {
    try {
      const data = await file.arrayBuffer();
      if (data.byteLength !== file.size) throw new Error("\u9644\u4EF6\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u539F\u6587\u4EF6");
      await exportBinaryFile(this.app, data, file.name, file.type || inferMime(file.name));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      new import_obsidian5.Notice(`\u4E0B\u8F7D\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  async deleteManagedAttachment(attachment) {
    if (!attachment.managed) return;
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    if (file instanceof import_obsidian5.TFile) {
      await this.app.fileManager.trashFile(file);
    }
  }
  async isAttachmentReferenced(path, excludingMemoPath) {
    const memos = await this.repository.getMemos();
    return memos.some((memo) => memo.file.path !== excludingMemoPath && memo.attachments.some((attachment) => attachment.path === path));
  }
  chooseVaultFile(title, predicate) {
    return new Promise((resolve) => {
      new VaultFileSuggestModal(this.app, title, this.app.vault.getFiles().filter(predicate), resolve).open();
    });
  }
  uniqueAttachmentPath(originalName) {
    const safeName = sanitizeFilename(originalName);
    const prefix = formatMemoBasename(/* @__PURE__ */ new Date());
    const extensionIndex = safeName.lastIndexOf(".");
    const stem = extensionIndex > 0 ? safeName.slice(0, extensionIndex) : safeName;
    const extension = extensionIndex > 0 ? safeName.slice(extensionIndex) : "";
    let suffix = 0;
    while (true) {
      const candidate = (0, import_obsidian5.normalizePath)(`${this.folder}/${prefix}-${stem}${suffix === 0 ? "" : `-${suffix}`}${extension}`);
      if (!this.app.vault.getAbstractFileByPath(candidate)) {
        return candidate;
      }
      suffix += 1;
    }
  }
  async ensureFolder(folderPath) {
    const segments = normalizeMemoFolder(folderPath).split("/");
    let current = "";
    for (const segment of segments) {
      current = (0, import_obsidian5.normalizePath)(current ? `${current}/${segment}` : segment);
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof import_obsidian5.TFolder) continue;
      if (existing) throw new Error(`\u9644\u4EF6\u76EE\u5F55\u88AB\u6587\u4EF6\u5360\u7528\uFF1A${current}`);
      await this.app.vault.createFolder(current);
    }
  }
};
var VaultFileSuggestModal = class extends import_obsidian5.FuzzySuggestModal {
  constructor(app, title, files, resolve) {
    super(app);
    this.files = files;
    this.resolve = resolve;
    this.selected = false;
    this.setPlaceholder(title);
  }
  getItems() {
    return this.files;
  }
  getItemText(item) {
    return item.path;
  }
  onChooseItem(item) {
    this.selected = true;
    this.resolve(item);
  }
  onClose() {
    super.onClose();
    if (!this.selected) {
      this.resolve(void 0);
    }
  }
};
function sanitizeFilename(name) {
  var _a, _b;
  const sanitized = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").replace(/[. ]+$/, "") || "attachment";
  const encoder = new TextEncoder();
  const ext = (_b = (_a = sanitized.match(/\.[a-zA-Z0-9]{1,16}$/)) == null ? void 0 : _a[0]) != null ? _b : "";
  const stem = ext ? sanitized.slice(0, -ext.length) : sanitized;
  let bytes = ext.length;
  let result = "";
  for (const character of stem) {
    bytes += encoder.encode(character).length;
    if (bytes > 220) break;
    result += character;
  }
  return (result || "attachment") + ext;
}
function inferMime(filename) {
  var _a, _b, _c;
  const extension = (_b = (_a = filename.split(".").pop()) == null ? void 0 : _a.toLowerCase()) != null ? _b : "";
  const mimeByExtension = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    bmp: "image/bmp",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    tif: "image/tiff",
    tiff: "image/tiff",
    m4v: "video/mp4",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    flac: "audio/flac",
    aac: "audio/aac",
    zip: "application/zip",
    "7z": "application/x-7z-compressed",
    rar: "application/vnd.rar",
    gz: "application/gzip",
    tar: "application/x-tar",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    json: "application/json",
    rtf: "application/rtf"
  };
  return (_c = mimeByExtension[extension]) != null ? _c : "application/octet-stream";
}

// src/settings.ts
var import_obsidian6 = require("obsidian");
var downloadDescription = import_obsidian6.Platform.isDesktop ? "\u586B\u5199\u6B64\u8BBE\u5907\u4E0A\u7684\u7EDD\u5BF9\u6587\u4EF6\u5939\u8DEF\u5F84\u3002\u7559\u7A7A\u5219\u6BCF\u6B21\u9009\u62E9\u4FDD\u5B58\u4F4D\u7F6E\u3002" : "\u586B\u5199\u5F53\u524D\u5E93\u5185\u7684\u6587\u4EF6\u5939\uFF0C\u4F8B\u5982 Downloads\u3002\u7559\u7A7A\u5219\u6BCF\u6B21\u9009\u62E9\u4FDD\u5B58\u4F4D\u7F6E\u3002";
function downloadFolderControl(setting, app) {
  setting.addText((text) => text.setPlaceholder("\u6BCF\u6B21\u9009\u62E9").setValue(getDownloadFolder(app)).onChange((value) => setDownloadFolder(app, value)));
}
var ObsidianMemosSettingTab = class extends import_obsidian6.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  getSettingDefinitions() {
    return [
      {
        name: "Memo \u4FDD\u5B58\u6587\u4EF6\u5939",
        desc: "\u65B0 Memo \u5C06\u5199\u5165\u6B64\u76EE\u5F55\u3002\u4FEE\u6539\u8DEF\u5F84\u4E0D\u4F1A\u79FB\u52A8\u6216\u5220\u9664\u65E7\u76EE\u5F55\u4E2D\u7684\u6587\u4EF6\u3002",
        render: (setting) => {
          setting.addText((text) => {
            text.setPlaceholder("Memos").setValue(this.plugin.settings.memoFolder);
            text.onChange(async (value) => {
              this.plugin.settings.memoFolder = normalizeMemoFolder(value);
              await this.plugin.saveSettings();
              this.plugin.scheduleViewRefresh();
            });
          });
        }
      },
      {
        name: "\u9644\u4EF6\u4FDD\u5B58\u4F4D\u7F6E",
        desc: "\u7559\u7A7A\u65F6\u4F7F\u7528 <Memo \u4FDD\u5B58\u6587\u4EF6\u5939>/_attachments\u3002\u8BE5\u76EE\u5F55\u4F4D\u4E8E Vault \u5185\uFF0C\u53EF\u540C\u6B65\u5E76\u652F\u6301\u6807\u51C6 Obsidian \u94FE\u63A5\u3002",
        render: (setting) => {
          setting.addText((text) => {
            text.setPlaceholder("Memos/_attachments").setValue(this.plugin.settings.attachmentFolder);
            text.onChange(async (value) => {
              this.plugin.settings.attachmentFolder = value.trim();
              await this.plugin.saveSettings();
            });
          });
        }
      },
      {
        name: "\u9644\u4EF6\u9ED8\u8BA4\u4E0B\u8F7D\u8DEF\u5F84",
        desc: downloadDescription,
        render: (setting) => downloadFolderControl(setting, this.app)
      },
      {
        name: "\u65B0\u5EFA Memo \u9ED8\u8BA4\u7C7B\u578B",
        desc: "Composer \u6253\u5F00\u65F6\u9ED8\u8BA4\u521B\u5EFA\u666E\u901A Memo \u6216\u4EFB\u52A1\u3002",
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOption("note", "\u666E\u901A Memo").addOption("task", "\u4EFB\u52A1").setValue(this.plugin.settings.defaultMemoType).onChange(async (value) => {
              this.plugin.settings.defaultMemoType = value === "task" ? "task" : "note";
              await this.plugin.saveSettings();
              this.plugin.scheduleViewRefresh();
            });
          });
        }
      },
      {
        name: "\u7F29\u7565\u5217\u8868\u4F4D\u7F6E",
        desc: "Apple Notes \u98CE\u683C\u7684 Memo \u5217\u8868\u663E\u793A\u5728\u8BE6\u60C5\u533A\u5DE6\u4FA7\u6216\u53F3\u4FA7\u3002",
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOption("right", "\u53F3\u4FA7\uFF08\u9ED8\u8BA4\uFF09").addOption("left", "\u5DE6\u4FA7").setValue(this.plugin.settings.listPanePosition).onChange(async (value) => {
              this.plugin.settings.listPanePosition = value === "left" ? "left" : "right";
              await this.plugin.saveSettings();
              this.plugin.scheduleViewRefresh();
            });
          });
        }
      },
      {
        name: "\u5217\u8868\u9ED8\u8BA4\u5C55\u5F00",
        desc: "\u63A7\u5236 Memos View \u9996\u6B21\u6253\u5F00\u65F6\u662F\u5426\u663E\u793A\u7F29\u7565\u5217\u8868\u3002",
        render: (setting) => {
          setting.addToggle((toggle) => {
            toggle.setValue(!this.plugin.settings.listPaneCollapsed).onChange(async (expanded) => {
              this.plugin.settings.listPaneCollapsed = !expanded;
              await this.plugin.saveSettings();
              this.plugin.scheduleViewRefresh();
            });
          });
        }
      },
      {
        name: "\u7F29\u7565\u5217\u8868\u5BBD\u5EA6",
        desc: "\u684C\u9762\u7AEF\u5217\u8868\u680F\u5BBD\u5EA6\uFF0C\u8303\u56F4 240\u2013420 px\u3002",
        render: (setting) => {
          setting.addSlider((slider) => {
            slider.setLimits(240, 420, 10).setValue(this.plugin.settings.listPaneWidth).onChange(async (value) => {
              this.plugin.settings.listPaneWidth = Math.round(value);
              await this.plugin.saveSettings();
              this.plugin.scheduleViewRefresh();
            });
          });
        }
      },
      {
        name: "\u8F93\u5165\u533A\u6807\u7B7E",
        desc: "\u8BBE\u7F6E\u8F93\u5165\u533A\u6807\u7B7E\u680F\u7684\u4E09\u4E2A\u6807\u7B7E\u53CA\u5176\u987A\u5E8F\u3002\u7559\u7A7A\u65F6\u7EE7\u7EED\u4F7F\u7528 Memo \u4E2D\u5DF2\u6709\u7684\u5E38\u7528\u6807\u7B7E\u3002",
        render: (setting) => renderComposerTagControls(setting.controlEl, this.plugin)
      }
    ];
  }
  display() {
    this.containerEl.empty();
    new import_obsidian6.Setting(this.containerEl).setName("Memo \u4FDD\u5B58\u6587\u4EF6\u5939").setDesc("\u65B0 Memo \u5C06\u5199\u5165\u6B64\u76EE\u5F55\u3002\u4FEE\u6539\u8DEF\u5F84\u4E0D\u4F1A\u79FB\u52A8\u6216\u5220\u9664\u65E7\u76EE\u5F55\u4E2D\u7684\u6587\u4EF6\u3002").addText((text) => {
      text.setPlaceholder("Memos").setValue(this.plugin.settings.memoFolder);
      text.onChange(async (value) => {
        this.plugin.settings.memoFolder = normalizeMemoFolder(value);
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    new import_obsidian6.Setting(this.containerEl).setName("\u9644\u4EF6\u4FDD\u5B58\u4F4D\u7F6E").setDesc("\u7559\u7A7A\u65F6\u4F7F\u7528 <Memo \u4FDD\u5B58\u6587\u4EF6\u5939>/_attachments\u3002\u8BE5\u76EE\u5F55\u4F4D\u4E8E Vault \u5185\uFF0C\u53EF\u540C\u6B65\u5E76\u652F\u6301\u6807\u51C6 Obsidian \u94FE\u63A5\u3002").addText((text) => {
      text.setPlaceholder("Memos/_attachments").setValue(this.plugin.settings.attachmentFolder);
      text.onChange(async (value) => {
        this.plugin.settings.attachmentFolder = value.trim();
        await this.plugin.saveSettings();
      });
    });
    downloadFolderControl(new import_obsidian6.Setting(this.containerEl).setName("\u9644\u4EF6\u9ED8\u8BA4\u4E0B\u8F7D\u8DEF\u5F84").setDesc(downloadDescription), this.app);
    new import_obsidian6.Setting(this.containerEl).setName("\u65B0\u5EFA Memo \u9ED8\u8BA4\u7C7B\u578B").setDesc("Composer \u6253\u5F00\u65F6\u9ED8\u8BA4\u521B\u5EFA\u666E\u901A Memo \u6216\u4EFB\u52A1\u3002").addDropdown((dropdown) => {
      dropdown.addOption("note", "\u666E\u901A Memo").addOption("task", "\u4EFB\u52A1").setValue(this.plugin.settings.defaultMemoType).onChange(async (value) => {
        this.plugin.settings.defaultMemoType = value === "task" ? "task" : "note";
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    new import_obsidian6.Setting(this.containerEl).setName("\u7F29\u7565\u5217\u8868\u4F4D\u7F6E").setDesc("Apple Notes \u98CE\u683C\u7684 Memo \u5217\u8868\u663E\u793A\u5728\u8BE6\u60C5\u533A\u5DE6\u4FA7\u6216\u53F3\u4FA7\u3002").addDropdown((dropdown) => {
      dropdown.addOption("right", "\u53F3\u4FA7\uFF08\u9ED8\u8BA4\uFF09").addOption("left", "\u5DE6\u4FA7").setValue(this.plugin.settings.listPanePosition).onChange(async (value) => {
        this.plugin.settings.listPanePosition = value === "left" ? "left" : "right";
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    new import_obsidian6.Setting(this.containerEl).setName("\u5217\u8868\u9ED8\u8BA4\u5C55\u5F00").setDesc("\u63A7\u5236 Memos View \u9996\u6B21\u6253\u5F00\u65F6\u662F\u5426\u663E\u793A\u7F29\u7565\u5217\u8868\u3002").addToggle((toggle) => {
      toggle.setValue(!this.plugin.settings.listPaneCollapsed).onChange(async (expanded) => {
        this.plugin.settings.listPaneCollapsed = !expanded;
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    new import_obsidian6.Setting(this.containerEl).setName("\u7F29\u7565\u5217\u8868\u5BBD\u5EA6").setDesc("\u684C\u9762\u7AEF\u5217\u8868\u680F\u5BBD\u5EA6\uFF0C\u8303\u56F4 240\u2013420 px\u3002").addSlider((slider) => {
      slider.setLimits(240, 420, 10).setValue(this.plugin.settings.listPaneWidth).onChange(async (value) => {
        this.plugin.settings.listPaneWidth = Math.round(value);
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    new import_obsidian6.Setting(this.containerEl).setName("\u8F93\u5165\u533A\u6807\u7B7E").setDesc("\u8BBE\u7F6E\u8F93\u5165\u533A\u6807\u7B7E\u680F\u7684\u4E09\u4E2A\u6807\u7B7E\u53CA\u5176\u987A\u5E8F\u3002\u7559\u7A7A\u65F6\u7EE7\u7EED\u4F7F\u7528 Memo \u4E2D\u5DF2\u6709\u7684\u5E38\u7528\u6807\u7B7E\u3002");
    renderComposerTagControls(this.containerEl, this.plugin);
    this.containerEl.createEl("p", {
      cls: "setting-item-description",
      text: `\u5F53\u524D\u8BFB\u53D6\u76EE\u5F55\uFF1A${this.plugin.repository.folder}`
    });
  }
};
function renderComposerTagControls(container, plugin) {
  const host = container.createDiv({ cls: "obsidian-memos-composer-tag-settings" });
  const values = Array.from({ length: 3 }, (_, index) => {
    var _a;
    return (_a = plugin.settings.composerTags[index]) != null ? _a : "";
  });
  const save = async () => {
    plugin.settings.composerTags = values.map(normalizeComposerTag).filter(Boolean);
    await plugin.saveSettings();
    plugin.scheduleViewRefresh();
  };
  const render = () => {
    host.empty();
    values.forEach((value, index) => {
      const row = host.createDiv({ cls: "obsidian-memos-composer-tag-settings__row" });
      const input = row.createEl("input", {
        attr: { type: "text", value, placeholder: `\u6807\u7B7E ${index + 1}\uFF08\u4F8B\u5982 #\u5DE5\u4F5C\uFF09`, "aria-label": `\u8F93\u5165\u533A\u6807\u7B7E ${index + 1}` }
      });
      input.addEventListener("change", () => {
        values[index] = normalizeComposerTag(input.value);
        void save();
      });
      const up = row.createEl("button", { text: "\u2191", attr: { type: "button", "aria-label": "\u4E0A\u79FB" } });
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        if (index === 0) return;
        [values[index - 1], values[index]] = [values[index], values[index - 1]];
        void save().then(render);
      });
      const down = row.createEl("button", { text: "\u2193", attr: { type: "button", "aria-label": "\u4E0B\u79FB" } });
      down.disabled = index === values.length - 1;
      down.addEventListener("click", () => {
        if (index === values.length - 1) return;
        [values[index], values[index + 1]] = [values[index + 1], values[index]];
        void save().then(render);
      });
    });
  };
  render();
}
function normalizeComposerTag(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

// src/views/MemosView.ts
var import_obsidian15 = require("obsidian");

// src/components/MemoReorder.ts
function mergeVisibleOrder(all, visible) {
  const selected = new Set(visible);
  let index = 0;
  return all.map((path) => selected.has(path) ? visible[index++] : path);
}
function bindSidebarDrag(handle, row, group, save) {
  const host = row.parentElement;
  const doc = row.ownerDocument;
  const win = doc.defaultView;
  row.dataset.sortGroup = group;
  let dragging = false;
  let suppressClick = false;
  handle.addEventListener("touchmove", (event) => {
    if (dragging && event.cancelable) event.preventDefault();
  }, { passive: false });
  handle.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
  handle.addEventListener("pointerdown", (down) => {
    if (!down.isPrimary || down.button !== 0) return;
    suppressClick = false;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    let timer = 0;
    let frame = 0;
    let y = down.clientY;
    let x = down.clientX;
    let target;
    let after = false;
    const peers = Array.from(host.children).filter((el) => el.dataset.sortGroup === group);
    let scroller = host;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(win.getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const mark = () => {
      var _a;
      target == null ? void 0 : target.removeClass("is-drop-before", "is-drop-after");
      target = void 0;
      const hit = doc.elementFromPoint(x, y);
      if (!hit || !host.contains(hit)) return;
      const hovered = hit.closest("[data-sort-key]");
      if ((hovered == null ? void 0 : hovered.parentElement) === host && hovered.dataset.sortGroup !== group) return;
      const candidate = (_a = peers.find((peer) => y < peer.getBoundingClientRect().bottom)) != null ? _a : peers[peers.length - 1];
      if (!candidate || candidate === row) return;
      const bounds = candidate.getBoundingClientRect();
      target = candidate;
      after = y >= bounds.top + bounds.height / 2;
      target.addClass(after ? "is-drop-after" : "is-drop-before");
    };
    const tick = () => {
      if (!row.isConnected) {
        finish(false);
        return;
      }
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
      if (!row.isConnected) {
        finish(false);
        return;
      }
      dragging = true;
      suppressClick = true;
      host.addClass("is-arranging");
      row.addClass("is-drag-source");
      handle.setPointerCapture(down.pointerId);
      frame = win.requestAnimationFrame(tick);
    };
    const finish = (drop) => {
      win.clearTimeout(timer);
      win.cancelAnimationFrame(frame);
      controller.abort();
      if (!dragging) return;
      dragging = false;
      host.removeClass("is-arranging");
      row.removeClass("is-drag-source");
      target == null ? void 0 : target.removeClass("is-drop-before", "is-drop-after");
      if (handle.hasPointerCapture(down.pointerId)) handle.releasePointerCapture(down.pointerId);
      if (drop && target && row.isConnected) {
        const sorted = peers.filter((peer) => peer !== row);
        sorted.splice(sorted.indexOf(target) + Number(after), 0, row);
        if (sorted.some((peer, index) => peer !== peers[index])) save(sorted.map((peer) => peer.dataset.sortKey));
      }
    };
    timer = win.setTimeout(begin, 420);
    doc.addEventListener("pointermove", (event) => {
      if (event.pointerId !== down.pointerId) return;
      x = event.clientX;
      y = event.clientY;
      if (!dragging && Math.hypot(x - down.clientX, y - down.clientY) > 6) {
        if (event.pointerType === "mouse") begin();
        else finish(false);
      }
      if (dragging) event.preventDefault();
    }, { ...options, passive: false });
    doc.addEventListener("pointerup", (event) => {
      if (event.pointerId !== down.pointerId) return;
      if (dragging) {
        x = event.clientX;
        y = event.clientY;
        mark();
      }
      finish(true);
    }, options);
    doc.addEventListener("pointercancel", (event) => {
      if (event.pointerId === down.pointerId) finish(false);
    }, options);
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(false);
    }, options);
    win.addEventListener("blur", () => finish(false), options);
  });
}

// src/components/MemoCard.ts
var import_obsidian11 = require("obsidian");

// src/components/MobileSelection.ts
var import_obsidian7 = require("obsidian");
var textSelector = ".obsidian-memos-card__title, .obsidian-memos-card__content";
function selectedWebUrl(text) {
  const value = text.trim();
  if (!/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\\]/.test(value)) return;
  try {
    const url = new URL(value);
    if (url.hostname && !url.username && !url.password) return url.href;
  } catch (e) {
  }
  return void 0;
}
async function copyText(doc, value, bridge) {
  var _a, _b, _c;
  try {
    if (((_a = bridge == null ? void 0 : bridge.isPluginAvailable) == null ? void 0 : _a.call(bridge, "Clipboard")) && ((_b = bridge.Plugins) == null ? void 0 : _b.Clipboard)) {
      await bridge.Plugins.Clipboard.write({ string: value });
      return;
    }
  } catch (e) {
  }
  try {
    const clipboard = (_c = doc.defaultView) == null ? void 0 : _c.navigator.clipboard;
    if (clipboard) {
      await clipboard.writeText(value);
      return;
    }
  } catch (e) {
  }
  const field = doc.body.createEl("textarea");
  field.readOnly = true;
  field.value = value;
  Object.assign(field.style, { position: "fixed", top: "0", left: "-9999px" });
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, value.length);
    if (!doc.execCommand("copy")) throw new Error("clipboard unavailable");
  } finally {
    field.remove();
  }
}
function caretAt(doc, x, y) {
  var _a, _b;
  const browser = doc;
  const range = (_a = browser.caretRangeFromPoint) == null ? void 0 : _a.call(browser, x, y);
  if (range) return range;
  const position = (_b = browser.caretPositionFromPoint) == null ? void 0 : _b.call(browser, x, y);
  if (!position) return;
  const caret = doc.createRange();
  caret.setStart(position.offsetNode, position.offset);
  caret.collapse(true);
  return caret;
}
function nearestTextPoint(rects, x, y) {
  let best;
  let distance = Infinity;
  for (const rect of rects) {
    if (!rect.width || !rect.height) continue;
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    if (dx > 10 || dy > Math.max(14, rect.height * 0.7)) continue;
    const score = dx * dx + dy * dy;
    if (score < distance) {
      best = rect;
      distance = score;
    }
  }
  return best ? { x: Math.max(best.left + 1, Math.min(x, best.right - 1)), y: best.top + best.height / 2 } : void 0;
}
function initialWord(text, offset) {
  const pos = Math.min(offset, Math.max(0, text.length - 1));
  const tokens = /https?:\/\/[^\s<>"，。；！？]+|[\p{Script=Han}]|[\p{L}\p{N}_]+|./gu;
  let match;
  while (match = tokens.exec(text)) {
    const end = match.index + match[0].length;
    if (pos < end) return [match.index, end];
  }
  return [pos, Math.min(pos + 1, text.length)];
}
function bindMobileSelection(display) {
  var _a;
  const surface = (_a = display.closest(".obsidian-memos-card")) != null ? _a : display;
  const doc = display.ownerDocument;
  const win = doc.defaultView;
  const bridge = win.Capacitor;
  const bound = new AbortController();
  let session;
  let timer;
  let press;
  let layer;
  let suppressClick = false;
  let scrollFrame = 0;
  const cancelPress = () => {
    win.clearTimeout(timer);
    press = void 0;
  };
  const close = () => {
    cancelPress();
    win.cancelAnimationFrame(scrollFrame);
    session == null ? void 0 : session.abort();
    session = void 0;
    layer == null ? void 0 : layer.remove();
    layer = void 0;
    display.removeClass("has-mobile-selection");
  };
  const readingText = (node) => {
    const el = (node == null ? void 0 : node.nodeType) === 1 ? node : node == null ? void 0 : node.parentElement;
    return Boolean(el && display.contains(el) && el.closest(textSelector));
  };
  const nearbyCaret = (x, y) => {
    const walker = doc.createTreeWalker(display, NodeFilter.SHOW_TEXT);
    const probe = doc.createRange();
    const rects = [];
    while (walker.nextNode()) {
      if (!readingText(walker.currentNode)) continue;
      probe.selectNodeContents(walker.currentNode);
      rects.push(...Array.from(probe.getClientRects()));
    }
    const point = nearestTextPoint(rects, x, y);
    return point ? caretAt(doc, point.x, point.y) : void 0;
  };
  const begin = (x, y) => {
    var _a2;
    const caret = nearbyCaret(x, y);
    const body = display.querySelector(".obsidian-memos-card__content");
    if (!body || body.querySelector(".obsidian-memos-card__empty-content")) return;
    const range = doc.createRange();
    let blank = true;
    if (caret && readingText(caret.startContainer) && caret.startContainer.nodeType === 3) {
      const node = caret.startContainer;
      const [start, end] = initialWord((_a2 = node.textContent) != null ? _a2 : "", caret.startOffset);
      range.setStart(node, start);
      range.setEnd(node, end);
      blank = false;
    }
    close();
    if (blank) range.selectNodeContents(body);
    if (!range.toString().trim()) return;
    suppressClick = true;
    display.addClass("has-mobile-selection");
    session = new AbortController();
    const options = { signal: session.signal };
    const textNodes = [];
    const walker = doc.createTreeWalker(display, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (readingText(walker.currentNode)) textNodes.push(walker.currentNode);
    }
    const overlay = doc.body.createDiv({ cls: "memos-selection-overlay" });
    layer = overlay;
    const marks = overlay.createDiv();
    const toolbar = overlay.createDiv({ cls: "memos-selection-toolbar", attr: { role: "toolbar" } });
    const button = (label, icon, action) => {
      const el = toolbar.createEl("button", { attr: { type: "button" } });
      (0, import_obsidian7.setIcon)(el.createSpan({ attr: { "aria-hidden": "true" } }), icon);
      el.createSpan({ text: label });
      el.addEventListener("click", action, options);
      return el;
    };
    const selectedText = () => {
      var _a3;
      const fragment = range.cloneContents();
      fragment.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, br").forEach((el) => el.after("\n"));
      return ((_a3 = fragment.textContent) != null ? _a3 : "").replace(/\n$/, "");
    };
    button("\u590D\u5236", "copy", () => {
      void copyText(doc, selectedText(), bridge).then(close, () => new import_obsidian7.Notice("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5"));
    });
    const selectAll = button("\u5168\u9009", "scan", () => {
      range.selectNodeContents(body);
      paint();
    });
    selectAll.hidden = blank;
    const open = button("\u6253\u5F00\u7F51\u5740", "external-link", async () => {
      var _a3, _b;
      const url = selectedWebUrl(selectedText());
      if (!url) return;
      close();
      try {
        if (((_a3 = bridge == null ? void 0 : bridge.isPluginAvailable) == null ? void 0 : _a3.call(bridge, "AppLauncher")) && ((_b = bridge.Plugins) == null ? void 0 : _b.AppLauncher)) {
          const result = await bridge.Plugins.AppLauncher.openUrl({ url });
          if (result.completed) return;
        }
      } catch (e) {
      }
      win.open(url, "_blank", "noopener,noreferrer");
    });
    const grips = ["start", "end"].map((initialEdge) => {
      let edge = initialEdge;
      const grip = overlay.createDiv({ cls: "memos-selection-grip is-" + edge });
      let deltaX = 0, deltaY = 0;
      grip.addEventListener("pointerdown", (event) => {
        if (!event.isPrimary) return;
        event.preventDefault();
        edge = grip.hasClass("is-start") ? "start" : "end";
        grip.setPointerCapture(event.pointerId);
        deltaX = parseFloat(grip.style.left) - event.clientX;
        deltaY = parseFloat(grip.style.top) - event.clientY - 2;
        toolbar.hidden = true;
      }, options);
      let pointerX = 0, pointerY = 0;
      const scroller = display.closest(".obsidian-memos-detail-card-host");
      const update = () => {
        overlay.classList.add("is-hit-testing");
        const caret2 = nearbyCaret(pointerX + deltaX, pointerY + deltaY);
        overlay.classList.remove("is-hit-testing");
        if (!caret2 || !readingText(caret2.startContainer)) return;
        const fixed = range.cloneRange();
        fixed.collapse(edge === "end");
        const order = caret2.compareBoundaryPoints(Range.START_TO_START, fixed);
        if (order === 0) return;
        range.setStart(order < 0 ? caret2.startContainer : fixed.startContainer, order < 0 ? caret2.startOffset : fixed.startOffset);
        range.setEnd(order < 0 ? fixed.startContainer : caret2.startContainer, order < 0 ? fixed.startOffset : caret2.startOffset);
        const nextEdge = order < 0 ? "start" : "end";
        if (edge !== nextEdge) {
          const other = grips.find((item) => item !== grip);
          other.classList.toggle("is-start", nextEdge === "end");
          other.classList.toggle("is-end", nextEdge === "start");
          edge = nextEdge;
          grip.classList.toggle("is-start", edge === "start");
          grip.classList.toggle("is-end", edge === "end");
        }
        paint();
      };
      grip.addEventListener("pointermove", (event) => {
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
    function paint() {
      var _a3, _b;
      marks.empty();
      const rects = [];
      const segment = doc.createRange();
      for (const text of textNodes) {
        if (!range.intersectsNode(text)) continue;
        segment.selectNodeContents(text);
        if (text === range.startContainer) segment.setStart(text, range.startOffset);
        if (text === range.endContainer) segment.setEnd(text, range.endOffset);
        rects.push(...Array.from(segment.getClientRects()).filter((r) => r.width && r.height));
      }
      if (!rects.length) {
        close();
        return;
      }
      for (const rect of blank ? [] : rects) {
        const mark = marks.createDiv({ cls: "memos-selection-mark" });
        Object.assign(mark.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
      }
      grips.forEach((grip) => {
        grip.hidden = blank;
      });
      const visible = rects.filter((rect) => rect.bottom > 0 && rect.top < win.innerHeight);
      const first = (_a3 = visible[0]) != null ? _a3 : rects[0], last = (_b = visible[visible.length - 1]) != null ? _b : rects[rects.length - 1];
      Object.assign(grips.find((grip) => grip.hasClass("is-start")).style, { left: rects[0].left + "px", top: rects[0].bottom + "px" });
      Object.assign(grips.find((grip) => grip.hasClass("is-end")).style, { left: rects[rects.length - 1].right + "px", top: rects[rects.length - 1].bottom + "px" });
      open.hidden = blank || !selectedWebUrl(selectedText());
      const width = toolbar.offsetWidth, height = toolbar.offsetHeight;
      const left = Math.max(6, Math.min((blank ? x : first.left + first.width / 2) - width / 2, win.innerWidth - width - 6));
      const top = blank ? Math.min(y, win.innerHeight - height - 6) : first.top >= height + 12 ? first.top - height - 8 : Math.min(last.bottom + 22, win.innerHeight - height - 6);
      Object.assign(toolbar.style, { left: left + "px", top: Math.max(6, top) + "px" });
    }
    doc.addEventListener("pointerdown", (event) => {
      if (!overlay.contains(event.target)) close();
    }, { ...options, capture: true });
    doc.addEventListener("scroll", () => {
      if (display.isConnected && !blank) paint();
      else close();
    }, { ...options, capture: true });
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    }, options);
    win.addEventListener("resize", close, options);
    paint();
  };
  const listeners = { signal: bound.signal };
  surface.addEventListener("pointerdown", (event) => {
    cancelPress();
    suppressClick = false;
    if (!event.isPrimary || event.button !== 0 || event.target.closest("button, input, textarea, a, .obsidian-memos-attachments")) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timer = win.setTimeout(() => {
      if (press) begin(press.x, press.y);
    }, 450);
  }, listeners);
  surface.addEventListener("pointermove", (event) => {
    if ((press == null ? void 0 : press.id) === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) cancelPress();
  }, listeners);
  surface.addEventListener("pointerup", cancelPress, listeners);
  surface.addEventListener("pointercancel", cancelPress, listeners);
  surface.addEventListener("contextmenu", (event) => {
    if (!event.target.closest(".obsidian-memos-attachments")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, listeners);
  surface.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  }, { ...listeners, capture: true });
  display.addClass("uses-mobile-selection");
  return () => {
    close();
    bound.abort();
    display.removeClass("uses-mobile-selection");
  };
}

// src/components/MemoAttachmentList.ts
var import_obsidian8 = require("obsidian");
var MemoAttachmentList = class {
  constructor(owner, attachmentService, onRemove, enableVideoThumbnails = false) {
    this.owner = owner;
    this.attachmentService = attachmentService;
    this.onRemove = onRemove;
    this.enableVideoThumbnails = enableVideoThumbnails;
  }
  render(container, attachments) {
    if (attachments.length === 0) {
      return;
    }
    const section = container.createDiv({ cls: "obsidian-memos-attachments" });
    const grid = section.createDiv({ cls: "obsidian-memos-attachments__grid" });
    for (const attachment of attachments) {
      this.renderAttachment(grid, attachment);
    }
  }
  renderAttachment(container, attachment) {
    const isMedia = attachment.mime.startsWith("image/") || attachment.mime.startsWith("video/");
    const item = container.createDiv({
      cls: `obsidian-memos-attachment${isMedia ? " is-media" : ""}`,
      attr: { role: "button", tabindex: "0", title: attachment.name }
    });
    const url = this.attachmentService.getResourceUrl(attachment);
    if (attachment.mime.startsWith("image/") && url) {
      item.createEl("img", { cls: "obsidian-memos-attachment__image", attr: { src: url, alt: attachment.name } });
    } else if (attachment.mime.startsWith("video/") && url) {
      const video = item.createEl("video", {
        cls: "obsidian-memos-attachment__media",
        attr: { src: url, preload: "auto", muted: "true", playsinline: "true" }
      });
      if (this.enableVideoThumbnails) prepareVideoThumbnail(video);
    } else {
      const fileCard = item.createDiv({ cls: "obsidian-memos-attachment__file" });
      fileCard.createSpan({ cls: "obsidian-memos-attachment__file-icon", text: attachment.mime.startsWith("audio/") ? "\u{1F3B5}" : "\u{1F4C4}" });
      const text = fileCard.createSpan({ cls: "obsidian-memos-attachment__file-text" });
      text.createSpan({ cls: "obsidian-memos-attachment__name", text: attachment.name });
      text.createSpan({ cls: "obsidian-memos-attachment__size", text: formatFileSize(attachment.size) });
    }
    if (isMedia) {
      item.createDiv({ cls: "obsidian-memos-attachment__caption", text: attachment.name });
    }
    this.owner.registerDomEvent(item, "click", (event) => {
      event.stopPropagation();
      void this.attachmentService.openAttachment(attachment);
    });
    this.owner.registerDomEvent(item, "contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new import_obsidian8.Menu();
      menu.addItem((entry) => entry.setTitle("\u4E0B\u8F7D").setIcon("download").onClick(() => void this.attachmentService.downloadAttachment(attachment)));
      menu.addItem((entry) => entry.setTitle("\u5220\u9664").setIcon("trash-2").onClick(() => void this.onRemove(attachment)));
      menu.showAtMouseEvent(event);
    });
  }
};
function prepareVideoThumbnail(video) {
  const capture = () => {
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
    const canvas = createEl("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      video.poster = canvas.toDataURL("image/jpeg", 0.82);
    } catch (e) {
    }
  };
  video.addEventListener("loadeddata", () => {
    if (video.duration > 0) {
      video.currentTime = Math.min(0.1, video.duration / 2);
    } else {
      capture();
    }
  }, { once: true });
  video.addEventListener("seeked", capture, { once: true });
}
function formatFileSize(size) {
  if (size === void 0) return "\u6587\u4EF6";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

// src/components/TitleBodyInput.ts
var import_obsidian9 = require("obsidian");
function boundedTitle(value) {
  const encoder = new TextEncoder();
  let bytes = 0, length = 0;
  for (const character of value) {
    bytes += encoder.encode(character).length;
    if (bytes > 252) break;
    length += character.length;
  }
  return [value.slice(0, length), value.slice(length)];
}
function bindTitleToBody(title, body) {
  const enforceLimit = () => {
    const [kept, overflow] = boundedTitle(title.value);
    if (!overflow) return;
    title.value = kept;
    body.value = overflow + (body.value ? "\n" + body.value : "");
    body.dispatchEvent(new Event("input", { bubbles: true }));
    new import_obsidian9.Notice("\u6807\u9898\u8D85\u51FA\u957F\u5EA6\u7684\u90E8\u5206\u5DF2\u8F6C\u5165\u6B63\u6587");
  };
  title.addEventListener("input", (event) => {
    if (!event.isComposing) enforceLimit();
  }, true);
  title.addEventListener("compositionend", () => {
    enforceLimit();
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const moveToBody = () => {
    var _a, _b;
    const start = (_a = title.selectionStart) != null ? _a : title.value.length;
    const end = (_b = title.selectionEnd) != null ? _b : start;
    const remainder = title.value.slice(end);
    title.value = title.value.slice(0, start);
    if (remainder) body.value = remainder + (body.value ? `
${body.value}` : "");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    body.dispatchEvent(new Event("input", { bubbles: true }));
    body.focus();
    body.setSelectionRange(0, 0);
  };
  title.addEventListener("keydown", (rawEvent) => {
    const event = rawEvent;
    if (event.key !== "Enter" || event.isComposing || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    moveToBody();
  });
  title.addEventListener("beforeinput", (rawEvent) => {
    const event = rawEvent;
    if (event.isComposing || !["insertLineBreak", "insertParagraph"].includes(event.inputType)) return;
    event.preventDefault();
    moveToBody();
  });
  title.addEventListener("paste", (rawEvent) => {
    var _a, _b;
    const event = rawEvent;
    if (pasteMultilineTitle(title, body, (_b = (_a = event.clipboardData) == null ? void 0 : _a.getData("text/plain")) != null ? _b : "")) event.preventDefault();
  });
}
function pasteMultilineTitle(title, body, clipboard) {
  var _a, _b, _c;
  const text = clipboard.replace(/\r\n?/g, "\n");
  if (!text.includes("\n")) return false;
  const start = (_a = title.selectionStart) != null ? _a : title.value.length;
  const end = (_b = title.selectionEnd) != null ? _b : start;
  const lines = text.split("\n");
  const first = (_c = lines.shift()) != null ? _c : "";
  const remainder = lines.join("\n") + title.value.slice(end);
  title.value = title.value.slice(0, start) + first;
  body.value = remainder + (body.value ? `
${body.value}` : "");
  title.dispatchEvent(new Event("input", { bubbles: true }));
  body.dispatchEvent(new Event("input", { bubbles: true }));
  body.focus();
  body.setSelectionRange(remainder.length, remainder.length);
  return true;
}

// src/components/TextEditingMenu.ts
var import_obsidian10 = require("obsidian");
function openReadingCopyMenu(container, event, content) {
  if (content !== void 0) {
    event.preventDefault();
    event.stopPropagation();
    const menu2 = new import_obsidian10.Menu();
    addCopyItem(menu2, splitMemoContent(content).body);
    addCopyItem(menu2, memoClipboardText(content), "\u590D\u5236\u6240\u6709");
    menu2.showAtMouseEvent(event);
    return true;
  }
  const selection = container.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || !container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) return false;
  const text = selection.toString();
  event.preventDefault();
  event.stopPropagation();
  const menu = new import_obsidian10.Menu();
  addCopyItem(menu, text);
  menu.showAtMouseEvent(event);
  return true;
}
function addCopyItem(menu, text, label = "\u590D\u5236") {
  menu.addItem((item) => item.setTitle(label).setIcon("copy").setDisabled(!text.length).onClick(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      new import_obsidian10.Notice(`\u590D\u5236\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }));
}
function openTextEditingMenu(control, event, bodyForTitle) {
  var _a, _b;
  event.preventDefault();
  event.stopPropagation();
  const start = (_a = control.selectionStart) != null ? _a : 0;
  const end = (_b = control.selectionEnd) != null ? _b : start;
  const hasSelection = end > start;
  const menu = new import_obsidian10.Menu();
  control.classList.add("has-memo-edit-menu");
  menu.onHide(() => {
    control.classList.remove("has-memo-edit-menu");
    if (control.isConnected) control.focus({ preventScroll: true });
  });
  addCopyItem(menu, control.value.slice(start, end));
  menu.addItem((item) => item.setTitle("\u7C98\u8D34").setIcon("clipboard-paste").onClick(() => void pasteSelection(control, start, end, bodyForTitle)));
  menu.addItem((item) => item.setTitle("\u526A\u5207").setIcon("scissors").setDisabled(!hasSelection).onClick(() => void cutSelection(control)));
  menu.showAtMouseEvent(event);
}
async function pasteSelection(control, start, end, bodyForTitle) {
  try {
    const text = await navigator.clipboard.readText();
    control.setSelectionRange(start, end);
    if (bodyForTitle && pasteMultilineTitle(control, bodyForTitle, text)) return;
    control.setRangeText(text, start, end, "end");
    control.dispatchEvent(new Event("input"));
    control.focus();
  } catch (error) {
    new import_obsidian10.Notice(`\u7C98\u8D34\u5931\u8D25\uFF1A${errorMessage(error)}`);
  }
}
async function cutSelection(control) {
  var _a, _b;
  const start = (_a = control.selectionStart) != null ? _a : 0;
  const end = (_b = control.selectionEnd) != null ? _b : start;
  if (end <= start) return;
  try {
    await navigator.clipboard.writeText(control.value.slice(start, end));
    control.setRangeText("", start, end, "end");
    control.dispatchEvent(new Event("input"));
    control.focus();
  } catch (error) {
    new import_obsidian10.Notice(`\u526A\u5207\u5931\u8D25\uFF1A${errorMessage(error)}`);
  }
}

// src/components/MobileDoubleTap.ts
function bindMobileDoubleTap(root, canEdit, edit) {
  let down;
  let last;
  let ignoreClickUntil = -1;
  function reset() {
    down = void 0;
    last = void 0;
  }
  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary || !canEdit(event.target)) {
      reset();
      return;
    }
    down = event;
  });
  root.addEventListener("pointermove", (event) => {
    if ((down == null ? void 0 : down.pointerId) === event.pointerId && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 12) reset();
  });
  root.addEventListener("pointercancel", reset);
  root.addEventListener("contextmenu", reset);
  root.addEventListener("pointerup", (event) => {
    if (!down || down.pointerId !== event.pointerId || event.timeStamp - down.timeStamp > 280 || Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 12 || !canEdit(event.target)) {
      reset();
      return;
    }
    down = void 0;
    if (last && event.timeStamp - last.timeStamp <= 350 && Math.hypot(event.clientX - last.clientX, event.clientY - last.clientY) <= 24) {
      last = void 0;
      ignoreClickUntil = event.timeStamp + 450;
      edit();
    } else {
      last = event;
    }
  });
  root.addEventListener("click", (event) => {
    if (event.timeStamp <= ignoreClickUntil) {
      ignoreClickUntil = -1;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  root.addEventListener("dblclick", (event) => {
    if (event.timeStamp <= ignoreClickUntil || !canEdit(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
    edit();
  });
}

// src/components/EditorSizing.ts
function resizeEditor(textarea) {
  var _a;
  const mirror = textarea.cloneNode(false);
  mirror.value = textarea.value;
  mirror.removeAttribute("id");
  mirror.tabIndex = -1;
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    height: "0px",
    minHeight: "0px",
    width: `${textarea.getBoundingClientRect().width}px`,
    top: "0",
    left: "0",
    overflow: "hidden"
  });
  (_a = textarea.parentElement) == null ? void 0 : _a.appendChild(mirror);
  const style = textarea.ownerDocument.defaultView.getComputedStyle(textarea);
  const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  const height = mirror.scrollHeight + border;
  mirror.remove();
  textarea.style.height = `${Math.ceil(height)}px`;
}

// src/components/MemoCard.ts
var MemoCard = class {
  constructor(app, owner, container, repository, memo, options) {
    this.app = app;
    this.owner = owner;
    this.repository = repository;
    this.memo = memo;
    this.options = options;
    this.editSaveQueue = Promise.resolve();
    this.finishingEdit = false;
    this.deleteArmed = false;
    var _a, _b;
    const isTitleless = !splitMemoContent(memo.content).title.trim();
    this.article = container.createEl("article", {
      cls: `obsidian-memos-card${memo.type === "task" ? " is-task" : ""}${memo.completed ? " is-completed" : ""}${isTitleless ? " is-titleless" : ""}`
    });
    const header = this.article.createDiv({ cls: "obsidian-memos-card__header" });
    const metadata = header.createDiv({ cls: "obsidian-memos-card__metadata" });
    if (memo.type === "task") {
      const taskButton = metadata.createEl("button", {
        cls: `obsidian-memos-task-toggle${memo.completed ? " is-completed" : ""}`,
        text: memo.completed ? "\u2713" : "\u25CB",
        attr: { type: "button", "aria-label": memo.completed ? "\u6062\u590D\u4E3A\u672A\u5B8C\u6210" : "\u6807\u8BB0\u4E3A\u5DF2\u5B8C\u6210" }
      });
      owner.registerDomEvent(taskButton, "click", () => void this.toggleCompleted());
    }
    const time = metadata.createEl("time", {
      cls: "obsidian-memos-card__time",
      text: formatMemoTime(memo.created),
      attr: { datetime: memo.created.toISOString() }
    });
    time.setAttr("title", `\u521B\u5EFA\uFF1A${memo.created.toLocaleString()}
\u4FEE\u6539\uFF1A${memo.modified.toLocaleString()}`);
    const actions = header.createDiv({ cls: "obsidian-memos-card__toolbar" });
    const moveButton = createIconButton(actions, "folder-input", "\u79FB\u52A8\u5230\u5176\u4ED6\u5907\u5FD8\u5F55");
    moveButton.toggleClass("is-hidden", options.trashMode === true || !options.onMove);
    owner.registerDomEvent(moveButton, "click", (event) => {
      event.stopPropagation();
      void this.openMoveMenu(event);
    });
    const pinButton = actions.createEl("button", { cls: "clickable-icon", attr: { type: "button" } });
    (0, import_obsidian11.setIcon)(pinButton, "pin");
    pinButton.toggleClass("is-pinned", memo.pinned);
    pinButton.setAttr("aria-pressed", String(memo.pinned));
    const deleteButton = createIconButton(actions, "trash-2", "\u5220\u9664 Memo");
    this.deleteButton = deleteButton;
    deleteButton.toggleClass("is-hidden", options.trashMode === true);
    const readingCloseButton = createIconButton(actions, "x", "\u9000\u51FA\u9605\u8BFB\u6A21\u5F0F");
    readingCloseButton.addClass("obsidian-memos-card__reading-close");
    owner.registerDomEvent(pinButton, "click", () => void this.togglePinned());
    owner.registerDomEvent(deleteButton, "click", (event) => {
      event.stopPropagation();
      void this.handleDeleteClick();
    });
    owner.registerDomEvent(this.article.ownerDocument, "pointerdown", (event) => {
      if (!this.deleteArmed) return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !this.deleteButton.contains(target)) this.clearDeleteArmed();
    });
    owner.registerDomEvent(readingCloseButton, "click", () => this.exitReadingMode());
    owner.registerDomEvent(this.article, "contextmenu", (event) => {
      var _a2, _b2;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        openTextEditingMenu(target, event, target === this.editorTitleInput ? this.editorTextarea : void 0);
        return;
      }
      if (openReadingCopyMenu(this.display, event, ((_b2 = (_a2 = this.options).isMobileLayout) == null ? void 0 : _b2.call(_a2)) ? void 0 : this.memo.content)) return;
      event.stopPropagation();
    });
    owner.registerDomEvent(this.article, "click", (event) => {
      var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j;
      const target = event.target instanceof Element ? event.target : null;
      if (target == null ? void 0 : target.closest("a, button, select, input, textarea")) return;
      if (this.article.hasClass("is-editing") && event.detail === 1) {
        event.preventDefault();
        const title = (_b2 = (_a2 = this.editorTitleInput) == null ? void 0 : _a2.value) != null ? _b2 : "";
        const body = (_d = (_c = this.editorTextarea) == null ? void 0 : _c.value) != null ? _d : "";
        void this.finishEditing(joinMemoContent(title, body));
        return;
      }
      if (event.detail === 2 && !((_f = (_e = this.options).isMobileLayout) == null ? void 0 : _f.call(_e))) {
        event.preventDefault();
        if (this.article.hasClass("is-editing")) {
          const title = (_h = (_g = this.editorTitleInput) == null ? void 0 : _g.value) != null ? _h : "";
          const body = (_j = (_i = this.editorTextarea) == null ? void 0 : _i.value) != null ? _j : "";
          void this.finishEditing(joinMemoContent(title, body));
        } else {
          void this.startEditing(void 0, Boolean(target == null ? void 0 : target.closest(".obsidian-memos-card__title")));
        }
      }
    });
    owner.registerDomEvent(this.article, "keydown", (event) => {
      if (event.key === "Escape" && this.article.hasClass("is-reading-mode")) {
        event.preventDefault();
        this.exitReadingMode();
      }
    });
    this.article.tabIndex = -1;
    this.display = this.article.createDiv({ cls: "obsidian-memos-card__display" });
    if ((_b = (_a = this.options).isMobileLayout) == null ? void 0 : _b.call(_a)) {
      bindMobileDoubleTap(
        this.article,
        (target) => !this.article.hasClass("is-editing") && !this.display.hasClass("has-mobile-selection") && target instanceof Element && !target.closest("a, button, input, textarea, select, [role=button], .obsidian-memos-attachments"),
        () => void this.startEditing()
      );
    }
  }
  async render() {
    await this.renderDisplay();
  }
  get path() {
    return this.memo.file.path;
  }
  expand() {
    this.enterReadingMode();
    void this.startEditing();
  }
  destroy() {
    var _a, _b, _c;
    (_a = this.stopSelection) == null ? void 0 : _a.call(this);
    if (this.editSaveTimer !== void 0) window.clearTimeout(this.editSaveTimer);
    (_c = (_b = this.options).onEditingChange) == null ? void 0 : _c.call(_b, false);
    this.unloadMarkdownChild();
  }
  async renderDisplay() {
    var _a, _b, _c, _d, _e;
    (_a = this.stopSelection) == null ? void 0 : _a.call(this);
    if ((_c = (_b = this.options).isMobileLayout) == null ? void 0 : _c.call(_b)) this.stopSelection = bindMobileSelection(this.display);
    this.unloadMarkdownChild();
    this.display.empty();
    this.article.removeClass("is-editing");
    const parts = splitMemoContent(this.memo.content);
    if (parts.title) {
      const title = this.display.createEl("h2", { cls: "obsidian-memos-card__title" });
      this.renderTextWithTags(title, parts.title);
    }
    const content = this.display.createDiv({ cls: "obsidian-memos-card__content markdown-rendered" });
    if (!parts.body) {
      if (!parts.title) {
        content.createEl("p", { cls: "obsidian-memos-card__empty-content", text: "\uFF08\u7A7A Memo\uFF09" });
      }
    } else {
      this.markdownChild = new import_obsidian11.MarkdownRenderChild(content);
      this.owner.addChild(this.markdownChild);
      try {
        await import_obsidian11.MarkdownRenderer.render(this.app, parts.body, content, this.memo.file.path, this.markdownChild);
        for (const link of Array.from(content.querySelectorAll("a.external-link, a[href^='http:' i], a[href^='https:' i], a[href^='//'], a[href^='mailto:' i]"))) {
          link.replaceWith(...Array.from(link.childNodes));
        }
        this.highlightInlineTags(content);
      } catch (error) {
        console.warn(`[Markdown Memos] Markdown \u6E32\u67D3\u5931\u8D25\uFF1A${this.memo.file.path}`, error);
        content.empty();
        content.createEl("pre", { text: parts.body });
      }
    }
    new MemoAttachmentList(this.owner, this.options.attachmentService, (attachment) => this.removeAttachment(attachment), ((_e = (_d = this.options).isMobileLayout) == null ? void 0 : _e.call(_d)) === true).render(
      this.display,
      this.memo.attachments
    );
  }
  async startEditing(tagToInsert, editTitle = false) {
    var _a, _b, _c, _d, _e;
    if (this.article.hasClass("is-editing")) {
      if (tagToInsert) this.insertTagIntoEditor(tagToInsert);
      return;
    }
    this.unloadMarkdownChild();
    this.display.empty();
    (_a = this.stopSelection) == null ? void 0 : _a.call(this);
    this.article.addClass("is-editing");
    (_c = (_b = this.options).onEditingChange) == null ? void 0 : _c.call(_b, true);
    this.lastPersistedContent = this.memo.content;
    const parts = splitMemoContent(this.memo.content);
    const editor = this.display.createDiv({ cls: "obsidian-memos-card__editor-shell" });
    const titleField = editor.createDiv({ cls: "obsidian-memos-card__editor-field is-title" });
    const titleMirror = titleField.createDiv({ cls: "obsidian-memos-card__editor-mirror" });
    const titleInput = titleField.createEl("textarea", {
      cls: "obsidian-memos-card__title-editor",
      attr: { rows: "1", "aria-label": "\u7F16\u8F91 Memo \u6807\u9898", placeholder: "\u6807\u9898", enterkeyhint: "next" }
    });
    titleInput.value = parts.title;
    if (tagToInsert) {
      titleInput.value += `${titleInput.value && !/\s$/.test(titleInput.value) ? " " : ""}${tagToInsert}`;
    }
    const bodyField = editor.createDiv({ cls: "obsidian-memos-card__editor-field is-body" });
    const bodyMirror = bodyField.createDiv({ cls: "obsidian-memos-card__editor-mirror" });
    const textarea = bodyField.createEl("textarea", {
      cls: "obsidian-memos-card__editor",
      attr: { rows: "1", "aria-label": "\u7F16\u8F91 Memo \u5185\u5BB9", placeholder: "" }
    });
    textarea.value = parts.body;
    this.renderEditorMirror(titleMirror, titleInput.value);
    this.renderEditorMirror(bodyMirror, textarea.value);
    this.editorTitleInput = titleInput;
    this.editorTextarea = textarea;
    this.editorTagTarget = titleInput;
    const updateDraft = () => {
      const content = joinMemoContent(titleInput.value, textarea.value);
      this.scheduleAutoSave(content);
      resizeEditor(titleInput);
      resizeEditor(textarea);
      this.renderEditorMirror(titleMirror, titleInput.value);
      this.renderEditorMirror(bodyMirror, textarea.value);
    };
    titleInput.addEventListener("input", updateDraft);
    textarea.addEventListener("input", updateDraft);
    bindTitleToBody(titleInput, textarea);
    titleInput.addEventListener("focus", () => {
      this.editorTagTarget = titleInput;
    });
    textarea.addEventListener("focus", () => {
      this.editorTagTarget = textarea;
    });
    titleInput.addEventListener("scroll", () => {
      titleMirror.scrollLeft = titleInput.scrollLeft;
    });
    textarea.addEventListener("scroll", () => {
      bodyMirror.scrollTop = textarea.scrollTop;
      bodyMirror.scrollLeft = textarea.scrollLeft;
    });
    this.display.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (editor.querySelector(".has-memo-edit-menu") || this.article.contains(this.article.ownerDocument.activeElement)) return;
        void this.finishEditing(joinMemoContent(titleInput.value, textarea.value));
      }, 0);
    });
    new MemoAttachmentList(this.owner, this.options.attachmentService, (attachment) => this.removeAttachment(attachment), ((_e = (_d = this.options).isMobileLayout) == null ? void 0 : _e.call(_d)) === true).render(
      this.display,
      this.memo.attachments
    );
    resizeEditor(titleInput);
    resizeEditor(textarea);
    const initialTarget = tagToInsert || editTitle ? titleInput : textarea;
    initialTarget.focus({ preventScroll: true });
    initialTarget.setSelectionRange(initialTarget.value.length, initialTarget.value.length);
  }
  async openMoveMenu(event) {
    var _a, _b, _c, _d, _e, _f;
    if (this.article.hasClass("is-editing")) {
      const content = joinMemoContent((_b = (_a = this.editorTitleInput) == null ? void 0 : _a.value) != null ? _b : "", (_d = (_c = this.editorTextarea) == null ? void 0 : _c.value) != null ? _d : "");
      this.editDraft = content;
      await this.flushAutoSave();
      if (this.lastPersistedContent !== content) return;
    }
    (_f = (_e = this.options).onMove) == null ? void 0 : _f.call(_e, event);
  }
  enterReadingMode() {
    this.article.addClass("is-reading-mode");
    this.article.focus({ preventScroll: true });
  }
  exitReadingMode() {
    this.article.removeClass("is-reading-mode");
  }
  scheduleAutoSave(content) {
    this.editDraft = content;
    if (this.editSaveTimer !== void 0) window.clearTimeout(this.editSaveTimer);
    this.editSaveTimer = window.setTimeout(() => void this.flushAutoSave(), 450);
  }
  async flushAutoSave() {
    if (this.editSaveTimer !== void 0) window.clearTimeout(this.editSaveTimer);
    this.editSaveTimer = void 0;
    const draft = this.editDraft;
    this.editDraft = void 0;
    if (draft === void 0 || !draft.trim() || draft === this.lastPersistedContent) return this.editSaveQueue;
    this.editSaveQueue = this.editSaveQueue.then(async () => {
      await this.repository.updateMemo(this.memo.file, draft);
      this.lastPersistedContent = draft;
    }).catch((error) => {
      console.error(`[Markdown Memos] \u81EA\u52A8\u4FDD\u5B58\u5931\u8D25\uFF1A${this.memo.file.path}`, error);
      new import_obsidian11.Notice(`\u81EA\u52A8\u4FDD\u5B58\u5931\u8D25\uFF1A${errorMessage(error)}`);
    });
    return this.editSaveQueue;
  }
  async finishEditing(content) {
    var _a, _b;
    if (!this.article.hasClass("is-editing") || this.finishingEdit) return;
    this.finishingEdit = true;
    try {
      this.editDraft = content;
      await this.flushAutoSave();
      (_b = (_a = this.options).onEditingChange) == null ? void 0 : _b.call(_a, false);
      await this.options.onChanged();
    } finally {
      this.finishingEdit = false;
    }
  }
  async addTag(tag) {
    await this.startEditing(tag);
  }
  insertTagIntoEditor(tag) {
    var _a, _b, _c, _d;
    const target = (_b = (_a = this.editorTagTarget) != null ? _a : this.editorTitleInput) != null ? _b : this.editorTextarea;
    if (!target) return;
    const start = (_c = target.selectionStart) != null ? _c : target.value.length;
    const end = (_d = target.selectionEnd) != null ? _d : target.value.length;
    const prefix = start > 0 && !/\s/.test(target.value.charAt(start - 1)) ? " " : "";
    target.setRangeText(`${prefix}${tag}`, start, end, "end");
    target.dispatchEvent(new Event("input"));
    target.focus();
    const caret = start + prefix.length + tag.length;
    target.setSelectionRange(caret, caret);
  }
  renderTextWithTags(container, text) {
    const pattern = /#([\p{L}\p{N}_/-]+)/gu;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > cursor) container.appendText(text.slice(cursor, match.index));
      container.createSpan({ cls: "obsidian-memos-inline-tag", text: match[0] });
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) container.appendText(text.slice(cursor));
  }
  highlightInlineTags(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let current;
    while (current = walker.nextNode()) {
      if (current.instanceOf(Text) && /#[\p{L}\p{N}_/-]+/u.test(current.data)) nodes.push(current);
    }
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || parent.closest("a, code, pre, .obsidian-memos-inline-tag")) continue;
      const replacement = container.createSpan();
      this.renderTextWithTags(replacement, node.data);
      node.replaceWith(...Array.from(replacement.childNodes));
    }
  }
  renderEditorMirror(container, text) {
    container.empty();
    this.renderTextWithTags(container, text || " ");
  }
  async toggleCompleted() {
    await this.runAction("\u66F4\u65B0\u4EFB\u52A1\u5931\u8D25", () => this.repository.toggleTaskCompleted(this.memo.file));
  }
  async togglePinned() {
    await this.runAction("\u66F4\u65B0\u7F6E\u9876\u72B6\u6001\u5931\u8D25", () => this.repository.togglePinned(this.memo.file));
  }
  async removeAttachment(attachment) {
    try {
      await this.repository.removeAttachment(this.memo.file, attachment.path);
      if (attachment.managed && !await this.options.attachmentService.isAttachmentReferenced(attachment.path, this.memo.file.path)) {
        await this.options.attachmentService.deleteManagedAttachment(attachment);
      }
      new import_obsidian11.Notice(attachment.managed ? "\u9644\u4EF6\u5DF2\u79FB\u5230\u7CFB\u7EDF\u5E9F\u7EB8\u7BD3" : "\u5DF2\u79FB\u9664\u9644\u4EF6\u94FE\u63A5\uFF1B\u539F\u6587\u4EF6\u4FDD\u7559");
      await this.options.onChanged();
    } catch (error) {
      new import_obsidian11.Notice(`\u79FB\u9664\u9644\u4EF6\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  async handleDeleteClick() {
    var _a, _b;
    if (!this.deleteArmed) {
      this.deleteArmed = true;
      this.deleteButton.addClass("is-delete-armed");
      this.deleteButton.setAttr("aria-label", "\u518D\u6B21\u70B9\u51FB\u79FB\u5165\u56DE\u6536\u7AD9");
      this.deleteButton.setAttr("title", "\u518D\u6B21\u70B9\u51FB\u79FB\u5165\u56DE\u6536\u7AD9");
      return;
    }
    if ((_b = (_a = this.options).isMobileLayout) == null ? void 0 : _b.call(_a)) {
      await this.trashImmediately();
      return;
    }
    await this.deleteImmediately();
  }
  clearDeleteArmed() {
    if (!this.deleteArmed) return;
    this.deleteArmed = false;
    this.deleteButton.removeClass("is-delete-armed");
    this.deleteButton.setAttr("aria-label", "\u5220\u9664 Memo");
    this.deleteButton.setAttr("title", "\u5220\u9664");
  }
  async trashImmediately() {
    try {
      await this.repository.trashMemo(this.memo.file);
      await this.options.onChanged();
    } catch (error) {
      console.error(`[Markdown Memos] \u79FB\u5165\u56DE\u6536\u7AD9\u5931\u8D25\uFF1A${this.memo.file.path}`, error);
      new import_obsidian11.Notice(`\u79FB\u5165\u56DE\u6536\u7AD9\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  async deleteImmediately() {
    try {
      await this.repository.trashMemo(this.memo.file);
      await this.options.onChanged();
    } catch (error) {
      console.error(`[Markdown Memos] \u5220\u9664\u5931\u8D25\uFF1A${this.memo.file.path}`, error);
      new import_obsidian11.Notice(`\u5220\u9664\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  async runAction(label, action) {
    try {
      await action();
      await this.options.onChanged();
    } catch (error) {
      console.error(`[Markdown Memos] ${label}`, error);
      new import_obsidian11.Notice(`${label}\uFF1A${errorMessage(error)}`);
    }
  }
  unloadMarkdownChild() {
    if (!this.markdownChild) return;
    this.owner.removeChild(this.markdownChild);
    this.markdownChild = void 0;
  }
};
function createIconButton(container, icon, label) {
  const button = container.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": label, title: label } });
  (0, import_obsidian11.setIcon)(button, icon);
  return button;
}
function formatMemoTime(date) {
  return new Intl.DateTimeFormat(void 0, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

// src/components/MemoComposer.ts
var import_obsidian12 = require("obsidian");

// src/components/TagSuggestionControl.ts
function createTagSuggestionControl(owner, container, options) {
  const wrapper = container.createSpan({ cls: `obsidian-memos-tag-control${options.className ? ` ${options.className}` : ""}` });
  const button = wrapper.createEl("button", {
    cls: "clickable-icon obsidian-memos-tag-control__button",
    text: "#",
    attr: { type: "button", "aria-label": "\u6DFB\u52A0\u6807\u7B7E", title: "\u6DFB\u52A0\u6807\u7B7E" }
  });
  const popup = wrapper.createDiv({ cls: "obsidian-memos-tag-control__popup" });
  let hideTimer;
  const cancelHide = () => {
    if (hideTimer !== void 0) window.clearTimeout(hideTimer);
    hideTimer = void 0;
  };
  const hide = () => {
    cancelHide();
    popup.removeClass("is-open");
    button.removeClass("is-active");
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer = window.setTimeout(hide, 140);
  };
  const show = () => {
    cancelHide();
    popup.empty();
    const suggestions = options.getSuggestions().slice(0, 3);
    if (suggestions.length > 0) {
      for (const tag of suggestions) {
        const item = popup.createEl("button", { text: tag, attr: { type: "button" } });
        owner.registerDomEvent(item, "mousedown", (event) => event.preventDefault());
        owner.registerDomEvent(item, "click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          hide();
          options.onSelect(tag);
        });
      }
      popup.addClass("is-open");
    }
    button.addClass("is-active");
  };
  owner.registerDomEvent(button, "click", (event) => {
    event.stopPropagation();
    if (options.onButtonClick) {
      if (button.hasClass("is-active")) {
        hide();
        options.onSelect("#");
      } else {
        options.onButtonClick();
        show();
      }
    } else {
      options.onSelect("#");
    }
  });
  owner.registerDomEvent(button, "mousedown", (event) => event.preventDefault());
  if (!options.onButtonClick) {
    owner.registerDomEvent(wrapper, "mouseenter", show);
    owner.registerDomEvent(wrapper, "mouseleave", scheduleHide);
    owner.registerDomEvent(popup, "mouseenter", cancelHide);
    owner.registerDomEvent(popup, "mouseleave", scheduleHide);
  }
  owner.registerDomEvent(document, "pointerdown", (event) => {
    const target = event.target instanceof Node ? event.target : null;
    if (!target || !wrapper.contains(target)) hide();
  });
  return button;
}

// src/components/MemoComposer.ts
var MemoComposer = class {
  constructor(owner, container, repository, onCreated, options = {}) {
    this.repository = repository;
    this.onCreated = onCreated;
    this.pendingAttachments = [];
    this.submitting = false;
    var _a, _b, _c;
    this.container = container;
    this.memoType = (_a = options.defaultType) != null ? _a : "note";
    this.attachmentService = options.attachmentService;
    this.isMobileLayout = (_b = options.isMobileLayout) != null ? _b : (() => false);
    this.getNotebookId = (_c = options.getNotebookId) != null ? _c : (() => void 0);
    const composer = container.createDiv({ cls: "obsidian-memos-composer" });
    this.composerEl = composer;
    const titleField = composer.createDiv({ cls: "obsidian-memos-composer__field is-title" });
    this.titleMirror = titleField.createDiv({ cls: "obsidian-memos-composer__mirror" });
    this.titleInput = titleField.createEl("input", {
      cls: "obsidian-memos-composer__title",
      attr: { type: "text", placeholder: "\u6807\u9898", "aria-label": "Memo \u6807\u9898", enterkeyhint: "next" }
    });
    const bodyField = composer.createDiv({ cls: "obsidian-memos-composer__field is-body" });
    this.bodyMirror = bodyField.createDiv({ cls: "obsidian-memos-composer__mirror" });
    this.textarea = bodyField.createEl("textarea", {
      cls: "obsidian-memos-composer__input",
      attr: {
        placeholder: "\u4F60\u73B0\u5728\u5728\u60F3\u4EC0\u4E48\uFF1F",
        rows: "5",
        "aria-label": "Memo \u5185\u5BB9"
      }
    });
    this.pendingHost = composer.createDiv({ cls: "obsidian-memos-composer__attachments is-empty" });
    this.tagTarget = this.titleInput;
    const footer = composer.createDiv({ cls: "obsidian-memos-composer__footer" });
    const tools = footer.createDiv({ cls: "obsidian-memos-composer__tools" });
    createTagSuggestionControl(owner, tools, {
      className: "is-composer",
      getSuggestions: () => {
        var _a2, _b2;
        return (_b2 = (_a2 = options.getPopularTags) == null ? void 0 : _a2.call(options)) != null ? _b2 : [];
      },
      onSelect: (tag) => this.insertTag(tag),
      onButtonClick: () => this.focus()
    });
    const attachmentButton = tools.createEl("button", {
      cls: "clickable-icon obsidian-memos-composer__attachment-button",
      attr: { type: "button", "aria-label": "\u7ED9\u5F53\u524D Memo \u6DFB\u52A0\u9644\u4EF6" }
    });
    (0, import_obsidian12.setIcon)(attachmentButton, "plus");
    attachmentButton.title = "\u4E0A\u4F20\u9644\u4EF6";
    this.taskButton = tools.createEl("button", { cls: "clickable-icon obsidian-memos-composer__task", attr: { type: "button" } });
    this.submitButton = footer.createEl("button", {
      cls: "mod-cta obsidian-memos-composer__submit",
      text: "NOTE",
      attr: { type: "button" }
    });
    owner.registerDomEvent(this.titleInput, "input", () => {
      this.renderMirrors();
      this.updateButtonState();
    });
    owner.registerDomEvent(this.textarea, "input", () => {
      this.renderMirrors();
      this.updateButtonState();
    });
    owner.registerDomEvent(this.titleInput, "focus", () => {
      this.tagTarget = this.titleInput;
      this.expandMobileComposer();
    });
    owner.registerDomEvent(this.textarea, "focus", () => {
      this.tagTarget = this.textarea;
      this.expandMobileComposer();
    });
    owner.registerDomEvent(composer, "focusout", (event) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !composer.contains(nextTarget)) {
        if (!this.titleInput.value.trim() && !this.textarea.value.trim() && this.pendingAttachments.length === 0) {
          composer.removeClass("is-mobile-expanded");
        }
      }
    });
    owner.registerDomEvent(composer, "paste", (event) => {
      var _a2, _b2;
      if (this.isMobileLayout()) return;
      const files = Array.from((_b2 = (_a2 = event.clipboardData) == null ? void 0 : _a2.items) != null ? _b2 : []).filter((item) => item.kind === "file" && item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((file) => file !== null);
      if (files.length === 0) return;
      event.preventDefault();
      this.addPendingExternalFiles(files);
    });
    let pressedField;
    owner.registerDomEvent(composer, "pointerdown", (event) => {
      pressedField = event.target === this.textarea ? this.textarea : event.target === this.titleInput ? this.titleInput : void 0;
    });
    owner.registerDomEvent(composer, "keydown", () => {
      pressedField = void 0;
    });
    owner.registerDomEvent(composer, "contextmenu", (event) => {
      if (event.target !== this.titleInput && event.target !== this.textarea) return;
      const field = pressedField != null ? pressedField : event.target === this.titleInput ? this.titleInput : this.textarea;
      pressedField = void 0;
      openTextEditingMenu(field, event, field === this.titleInput ? this.textarea : void 0);
    });
    owner.registerDomEvent(this.textarea, "scroll", () => {
      this.bodyMirror.scrollTop = this.textarea.scrollTop;
      this.bodyMirror.scrollLeft = this.textarea.scrollLeft;
    });
    const uploadChoices = composer.createDiv({ cls: "obsidian-memos-mobile-upload-choices" });
    uploadChoices.hidden = true;
    const closeUploadChoices = () => {
      uploadChoices.hidden = true;
      attachmentButton.setAttribute("aria-expanded", "false");
    };
    if (this.isMobileLayout()) {
      attachmentButton.setAttribute("aria-expanded", "false");
      const choices = [
        { source: "album", icon: "image", label: "\u76F8\u518C" },
        { source: "camera", icon: "camera", label: "\u62CD\u6444" },
        { source: "files", icon: "folder", label: "\u6587\u4EF6" }
      ];
      for (const choice of choices) {
        const button = uploadChoices.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": choice.label } });
        (0, import_obsidian12.setIcon)(button, choice.icon);
        owner.registerDomEvent(button, "click", () => {
          closeUploadChoices();
          void this.queueExternalAttachments(choice.source);
        });
      }
      owner.registerDomEvent(container.ownerDocument, "pointerdown", (event) => {
        if (!uploadChoices.contains(event.target) && !attachmentButton.contains(event.target)) closeUploadChoices();
      });
      owner.registerDomEvent(container.ownerDocument, "keydown", (event) => {
        if (event.key === "Escape") closeUploadChoices();
      });
    }
    owner.registerDomEvent(attachmentButton, "click", () => {
      if (!this.isMobileLayout()) {
        void this.queueExternalAttachments();
        return;
      }
      uploadChoices.hidden = !uploadChoices.hidden;
      attachmentButton.setAttribute("aria-expanded", String(!uploadChoices.hidden));
    });
    owner.registerDomEvent(attachmentButton, "contextmenu", (event) => {
      event.preventDefault();
      const menu = new import_obsidian12.Menu();
      menu.addItem((item) => item.setTitle("\u94FE\u63A5\u5E93\u5185\u6587\u4EF6").setIcon("link").onClick(() => void this.queueVaultAttachment()));
      menu.showAtMouseEvent(event);
    });
    owner.registerDomEvent(this.taskButton, "click", () => {
      this.memoType = this.memoType === "task" ? "note" : "task";
      this.updateTaskButton();
    });
    const submitFromKeyboard = (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.submit();
      }
    };
    owner.registerDomEvent(this.titleInput, "keydown", (event) => {
      submitFromKeyboard(event);
      if (event.defaultPrevented) return;
      if (event.isComposing) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        this.textarea.focus();
        this.textarea.setSelectionRange(0, 0);
      }
    });
    bindTitleToBody(this.titleInput, this.textarea);
    owner.registerDomEvent(this.textarea, "keydown", submitFromKeyboard);
    owner.registerDomEvent(this.textarea, "keydown", (event) => {
      var _a2;
      if (event.defaultPrevented || event.key !== "ArrowUp") return;
      const caret = (_a2 = this.textarea.selectionStart) != null ? _a2 : 0;
      if (caret > 0 && this.textarea.value.slice(0, caret).includes("\n")) return;
      event.preventDefault();
      event.stopPropagation();
      this.titleInput.focus();
      this.titleInput.setSelectionRange(this.titleInput.value.length, this.titleInput.value.length);
    });
    owner.registerDomEvent(this.submitButton, "click", () => void this.submit());
    this.updateTaskButton();
    this.renderMirrors();
    this.updateButtonState();
  }
  focus() {
    this.expandMobileComposer();
    this.textarea.focus();
  }
  async submit() {
    const title = this.titleInput.value;
    const content = joinMemoContent(title, this.textarea.value);
    if (!content.trim() && this.pendingAttachments.length === 0 || this.submitting) {
      return;
    }
    this.setSubmitting(true);
    try {
      let memo = await this.repository.createMemo(content, {
        type: this.memoType,
        notebookId: this.getNotebookId(),
        allowEmpty: this.pendingAttachments.length > 0
      });
      await this.persistPendingAttachments(memo);
      memo = await this.repository.getMemo(memo.file);
      this.titleInput.value = "";
      this.textarea.value = "";
      this.clearPendingAttachments();
      this.renderMirrors();
      this.updateButtonState();
      await this.onCreated(memo);
      if (this.isMobileLayout()) {
        this.composerEl.removeClass("is-mobile-expanded");
        const activeElement = this.container.ownerDocument.activeElement;
        if (activeElement instanceof HTMLElement && this.container.contains(activeElement)) activeElement.blur();
      }
    } catch (error) {
      console.error("[Markdown Memos] \u521B\u5EFA Memo \u5931\u8D25\u3002", error);
      new import_obsidian12.Notice(`\u521B\u5EFA Memo \u5931\u8D25\uFF1A${errorMessage(error)}`);
    } finally {
      this.setSubmitting(false);
      if (!this.isMobileLayout() && !this.textarea.value && !this.titleInput.value) this.textarea.focus();
    }
  }
  setSubmitting(submitting) {
    this.submitting = submitting;
    this.titleInput.disabled = submitting;
    this.textarea.disabled = submitting;
    this.submitButton.setText(submitting ? "\u4FDD\u5B58\u4E2D\u2026" : "NOTE");
    this.updateButtonState();
  }
  updateButtonState() {
    this.submitButton.disabled = this.submitting || !this.titleInput.value.trim() && !this.textarea.value.trim() && this.pendingAttachments.length === 0;
  }
  expandMobileComposer() {
    this.composerEl.addClass("is-mobile-expanded");
  }
  updateTaskButton() {
    const isTask = this.memoType === "task";
    this.taskButton.toggleClass("is-active", isTask);
    (0, import_obsidian12.setIcon)(this.taskButton, isTask ? "list-checks" : "list-todo");
    this.taskButton.setAttr("aria-pressed", String(isTask));
    this.taskButton.setAttr("aria-label", isTask ? "\u5207\u6362\u4E3A\u666E\u901A Memo" : "\u5207\u6362\u4E3A\u4EFB\u52A1");
    this.taskButton.setAttr("title", isTask ? "\u5207\u6362\u4E3A\u666E\u901A Memo" : "\u5207\u6362\u4E3A\u4EFB\u52A1");
  }
  insertTextAtCursor(text, target) {
    var _a, _b;
    const start = (_a = target.selectionStart) != null ? _a : target.value.length;
    const end = (_b = target.selectionEnd) != null ? _b : target.value.length;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input"));
    target.focus();
  }
  insertTag(tag) {
    const prefix = this.tagTarget.value && this.tagTarget.selectionStart === this.tagTarget.value.length && !/\s$/.test(this.tagTarget.value) ? " " : "";
    this.insertTextAtCursor(`${prefix}${tag}`, this.tagTarget);
  }
  renderMirrors() {
    this.titleMirror.empty();
    this.bodyMirror.empty();
    renderTextWithTags(this.titleMirror, this.titleInput.value || " ");
    renderTextWithTags(this.bodyMirror, this.textarea.value || " ");
  }
  async queueExternalAttachments(mobileSource) {
    if (!this.attachmentService) return;
    try {
      this.addPendingExternalFiles(await this.attachmentService.pickExternalAttachments("*/*", mobileSource));
    } catch (error) {
      new import_obsidian12.Notice(`\u9009\u62E9\u9644\u4EF6\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  addPendingExternalFiles(files) {
    for (const file of files) {
      const mime = file.type || inferMime(file.name);
      this.pendingAttachments.push({
        kind: "external",
        file,
        name: file.name,
        mime,
        size: file.size,
        previewUrl: mime.startsWith("image/") || mime.startsWith("video/") ? URL.createObjectURL(file) : void 0
      });
    }
    this.renderPendingAttachments();
    this.updateButtonState();
  }
  async queueVaultAttachment() {
    if (!this.attachmentService) return;
    const file = await this.attachmentService.pickVaultAttachment();
    if (!file || this.pendingAttachments.some((attachment) => attachment.kind === "vault" && attachment.file.path === file.path)) return;
    this.pendingAttachments.push({ kind: "vault", file, name: file.name, mime: inferMime(file.name), size: file.stat.size });
    this.renderPendingAttachments();
  }
  renderPendingAttachments() {
    var _a;
    this.pendingHost.empty();
    this.pendingHost.toggleClass("is-empty", this.pendingAttachments.length === 0);
    for (const attachment of this.pendingAttachments) {
      const item = this.pendingHost.createDiv({ cls: "obsidian-memos-composer__attachment", attr: { title: attachment.name } });
      const url = attachment.kind === "external" ? attachment.previewUrl : (_a = this.attachmentService) == null ? void 0 : _a.getResourceUrl({ path: attachment.file.path, name: attachment.name, mime: attachment.mime, size: attachment.size, managed: false });
      if (attachment.mime.startsWith("image/") && url) {
        item.createEl("img", { attr: { src: url, alt: attachment.name } });
      } else if (attachment.mime.startsWith("video/") && url) {
        const video = item.createEl("video", { attr: { src: url, preload: "auto", muted: "true", playsinline: "true" } });
        if (this.isMobileLayout()) prepareVideoThumbnail(video);
      } else {
        item.createSpan({ cls: "obsidian-memos-composer__attachment-icon", text: attachment.mime.startsWith("audio/") ? "\u{1F3B5}" : "\u{1F4C4}" });
      }
      item.createSpan({ cls: "obsidian-memos-composer__attachment-name", text: attachment.name });
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.openPendingAttachment(attachment);
      });
      ownerContextMenu(
        item,
        () => void this.downloadPendingAttachment(attachment),
        () => this.removePendingAttachment(attachment)
      );
    }
  }
  removePendingAttachment(attachment) {
    if (attachment.kind === "external" && attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    this.pendingAttachments = this.pendingAttachments.filter((item) => item !== attachment);
    this.renderPendingAttachments();
  }
  clearPendingAttachments() {
    for (const attachment of this.pendingAttachments) {
      if (attachment.kind === "external" && attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
    this.pendingAttachments = [];
    this.renderPendingAttachments();
  }
  async openPendingAttachment(attachment) {
    var _a, _b, _c;
    if (attachment.kind === "vault") {
      await ((_a = this.attachmentService) == null ? void 0 : _a.openAttachment({
        path: attachment.file.path,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        managed: false
      }));
      return;
    }
    if (attachment.mime.startsWith("image/") && attachment.previewUrl) {
      (_b = this.attachmentService) == null ? void 0 : _b.previewImage(attachment.previewUrl, attachment.name);
      return;
    }
    try {
      if (import_obsidian12.Platform.isDesktopApp) {
        const path = getDesktopUploadPath(attachment.file);
        if (!path) throw new Error("\u8BF7\u5148\u4FDD\u5B58\u8FD9\u6761\u5907\u5FD8\u5F55\uFF0C\u518D\u7528\u7CFB\u7EDF\u5E94\u7528\u6253\u5F00\u9644\u4EF6");
        const message = await require("electron").shell.openPath(path);
        if (message) throw new Error(message);
      } else if ((_c = navigator.canShare) == null ? void 0 : _c.call(navigator, { files: [attachment.file] })) {
        await navigator.share({ files: [attachment.file], title: attachment.name });
      } else {
        throw new Error("\u8BF7\u5148\u4FDD\u5B58\u8FD9\u6761\u5907\u5FD8\u5F55\uFF0C\u518D\u7528\u7CFB\u7EDF\u5E94\u7528\u6253\u5F00\u9644\u4EF6");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) new import_obsidian12.Notice(errorMessage(error));
    }
  }
  async downloadPendingAttachment(attachment) {
    var _a, _b;
    if (attachment.kind === "vault") {
      await ((_a = this.attachmentService) == null ? void 0 : _a.downloadAttachment({
        path: attachment.file.path,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        managed: false
      }));
      return;
    }
    await ((_b = this.attachmentService) == null ? void 0 : _b.downloadExternalFile(attachment.file));
  }
  async persistPendingAttachments(memo) {
    if (!this.attachmentService || this.pendingAttachments.length === 0) return;
    const externalFiles = this.pendingAttachments.filter((attachment) => attachment.kind === "external").map((attachment) => attachment.file);
    await this.attachmentService.addExternalFiles(memo.file, externalFiles);
    for (const attachment of this.pendingAttachments) {
      if (attachment.kind === "vault") await this.attachmentService.linkChosenVaultFile(memo.file, attachment.file);
    }
  }
};
function ownerContextMenu(item, onDownload, onRemove) {
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const menu = new import_obsidian12.Menu();
    menu.addItem((entry) => entry.setTitle("\u4E0B\u8F7D").setIcon("download").onClick(onDownload));
    menu.addItem((entry) => entry.setTitle("\u5220\u9664").setIcon("trash-2").onClick(onRemove));
    menu.showAtMouseEvent(event);
  });
}
function renderTextWithTags(container, text) {
  const pattern = /#([\p{L}\p{N}_/-]+)/gu;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) container.appendText(text.slice(cursor, match.index));
    container.createSpan({ cls: "obsidian-memos-inline-tag", text: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) container.appendText(text.slice(cursor));
}

// src/components/MemoList.ts
var import_obsidian13 = require("obsidian");
var MemoList = class {
  constructor(owner, container, callbacks) {
    this.callbacks = callbacks;
    this.memos = [];
    this.listEl = container.createDiv({ cls: "obsidian-memos-list-pane__items" });
    owner.registerDomEvent(this.listEl, "click", (event) => {
      var _a, _b, _c;
      const eventTarget = event.target instanceof Element ? event.target : null;
      const deleteButton = (_a = eventTarget == null ? void 0 : eventTarget.closest("[data-swipe-delete]")) != null ? _a : null;
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = (_b = eventTarget == null ? void 0 : eventTarget.closest("[data-memo-path]")) != null ? _b : null;
      const path = target == null ? void 0 : target.dataset.memoPath;
      if (!path) {
        return;
      }
      const memo = this.memos.find((item) => item.file.path === path);
      if (memo) {
        const taskToggle = (_c = eventTarget == null ? void 0 : eventTarget.closest("[data-task-toggle]")) != null ? _c : null;
        if (taskToggle) {
          this.callbacks.onToggleTask(memo);
        } else {
          this.callbacks.onSelect(memo);
        }
      }
    });
    owner.registerDomEvent(this.listEl, "contextmenu", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-memo-path]") : null;
      const path = target == null ? void 0 : target.dataset.memoPath;
      const memo = path ? this.memos.find((item) => item.file.path === path) : void 0;
      if (!memo) return;
      event.preventDefault();
      if (!this.listEl.hasClass("is-arranging")) this.callbacks.onContextMenu(memo, event);
    });
  }
  setMemos(memos, selectedPath) {
    this.memos = memos;
    this.selectedPath = selectedPath;
    this.render();
  }
  destroy() {
    this.listEl.empty();
    this.memos = [];
  }
  activateDelete(memo, button) {
    button.addClass("is-activated");
    void Promise.resolve(this.callbacks.onDelete(memo)).finally(() => {
      if (button.isConnected) button.removeClass("is-activated");
    });
  }
  render() {
    this.listEl.empty();
    if (this.memos.length === 0) {
      this.listEl.createDiv({ cls: "obsidian-memos-list-pane__empty", text: "\u6682\u65E0 Memo" });
      return;
    }
    let previousGroup = "";
    for (const memo of this.memos) {
      const group = memo.pinned ? "\u7F6E\u9876" : getDateGroup(memo);
      if (group !== previousGroup) {
        this.listEl.createDiv({ cls: "obsidian-memos-list-group", text: group });
        previousGroup = group;
      }
      const row = this.listEl.createDiv({
        cls: "obsidian-memos-list-row",
        attr: { "data-memo-path": memo.file.path }
      });
      this.callbacks.bindRowDrag(row, memo);
      const deleteButton = row.createEl("button", {
        cls: "obsidian-memos-list-row__delete",
        attr: { type: "button", "data-swipe-delete": "true", "aria-label": "\u5220\u9664 Memo", title: "\u5220\u9664" }
      });
      (0, import_obsidian13.setIcon)(deleteButton, "trash-2");
      deleteButton.addEventListener("pointerdown", (event) => event.stopPropagation());
      deleteButton.addEventListener("pointerup", (event) => event.stopPropagation());
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.activateDelete(memo, deleteButton);
      });
      const item = row.createDiv({
        cls: `obsidian-memos-list-item${memo.file.path === this.selectedPath ? " is-selected" : ""}`,
        attr: { role: "button", tabindex: "0" }
      });
      const titleRow = item.createDiv({ cls: "obsidian-memos-list-item__title-row" });
      if (memo.pinned) {
        const pin = titleRow.createSpan({ cls: "obsidian-memos-list-item__pin", attr: { "aria-label": "\u5DF2\u7F6E\u9876", title: "\u5DF2\u7F6E\u9876" } });
        (0, import_obsidian13.setIcon)(pin, "pin");
      }
      if (isTaskMemo(memo)) {
        titleRow.createEl("button", {
          cls: `obsidian-memos-list-item__task-mark${isCompletedTask(memo) ? " is-completed" : ""}`,
          text: isCompletedTask(memo) ? "\u2713" : "\u25CB",
          attr: { type: "button", "data-task-toggle": "true", "aria-label": isCompletedTask(memo) ? "\u6062\u590D\u4E3A\u672A\u5B8C\u6210" : "\u6807\u8BB0\u4E3A\u5DF2\u5B8C\u6210" }
        });
      }
      titleRow.createDiv({ cls: "obsidian-memos-list-item__title", text: getMemoListTitle(memo.content) });
      const summary = getSummary(memo.content);
      const preview = [formatListDate(memo.modified), summary].filter(Boolean).join("  ");
      item.createDiv({ cls: "obsidian-memos-list-item__summary", text: preview });
    }
  }
};
function isTaskMemo(memo) {
  return memo.type === "task";
}
function isCompletedTask(memo) {
  return memo.completed;
}
function getMemoListTitle(content) {
  const parts = splitMemoContent(content);
  const line = parts.title.trim();
  if (line) {
    return line.replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").slice(0, 80);
  }
  const firstBodyLine = parts.body.split("\n").map((item) => item.trim()).find(Boolean);
  return firstBodyLine ? firstBodyLine.replace(/^[-*+]\s+/, "").slice(0, 80) : "\u65E0\u6807\u9898 Memo";
}
function getSummary(content) {
  const parts = splitMemoContent(content);
  const lines = parts.body.split("\n").map((item) => item.trim()).filter(Boolean);
  if (!parts.title.trim() && lines.length > 0) {
    lines.shift();
  }
  return lines.slice(0, 2).join(" ").replace(/[*_`]/g, "").slice(0, 120);
}
function formatListDate(date) {
  const now = /* @__PURE__ */ new Date();
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (isToday) {
    return new Intl.DateTimeFormat(void 0, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}
function getDateGroup(memo) {
  if (memo.pinned) {
    return "\u7F6E\u9876";
  }
  const now = /* @__PURE__ */ new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const memoDay = new Date(memo.modified.getFullYear(), memo.modified.getMonth(), memo.modified.getDate()).getTime();
  if (memoDay === today) {
    return "\u4ECA\u5929";
  }
  if (memoDay === yesterdayDate.getTime()) {
    return "\u6628\u5929";
  }
  return new Intl.DateTimeFormat(void 0, { year: "numeric", month: "long" }).format(memo.modified);
}

// src/components/MemoDeleteModal.ts
var import_obsidian14 = require("obsidian");
var MemoDeleteModal = class extends import_obsidian14.Modal {
  constructor(app, memo, resolve) {
    super(app);
    this.memo = memo;
    this.resolve = resolve;
    this.resolved = false;
  }
  onOpen() {
    this.setTitle("\u5220\u9664\u8FD9\u6761 Memo\uFF1F");
    this.contentEl.createEl("p", { text: `\u201C${previewContent(this.memo.content)}\u201D` });
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "\u6587\u4EF6\u5C06\u901A\u8FC7 Obsidian \u7684\u56DE\u6536\u7AD9\u8BBE\u7F6E\u5B89\u5168\u5220\u9664\u3002"
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88", attr: { type: "button" } });
    const confirm = actions.createEl("button", {
      cls: "mod-warning",
      text: "\u5220\u9664",
      attr: { type: "button" }
    });
    cancel.addEventListener("click", () => this.finish(false));
    confirm.addEventListener("click", () => this.finish(true));
    confirm.focus();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(false);
    }
  }
  finish(confirmed) {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.resolve(confirmed);
    this.close();
  }
};
function confirmMemoDeletion(app, memo) {
  return new Promise((resolve) => new MemoDeleteModal(app, memo, resolve).open());
}
function previewContent(content) {
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (!singleLine) {
    return memoFallback;
  }
  return singleLine.length > 80 ? `${singleLine.slice(0, 80)}\u2026` : singleLine;
}
var memoFallback = "\u7A7A Memo";

// src/views/MemosView.ts
var MEMOS_VIEW_TYPE = "obsidian-memos-view";
var MIN_LIST_WIDTH = 240;
var MAX_LIST_WIDTH = 420;
var MemosView = class extends import_obsidian15.ItemView {
  constructor(leaf, plugin) {
    var _a;
    super(leaf);
    this.plugin = plugin;
    this.detailCards = [];
    this.allMemos = [];
    this.memos = [];
    this.searchQuery = "";
    this.sortOption = "modified-desc";
    // Mobile views should open on the memo feed. The sidebar is explicitly
    // opened with the edge arrow button.
    this.mobileDetail = true;
    this.refreshSequence = 0;
    this.isDraggingDivider = false;
    this.showTrash = false;
    this.unlockedNotebookIds = /* @__PURE__ */ new Set(["default"]);
    this.activeNotebookId = plugin.settings.activeMemoNotebookId;
    this.expandedNotebookId = this.activeNotebookId;
    if ((_a = plugin.settings.manualMemoOrder) == null ? void 0 : _a.length) this.sortOption = "manual";
  }
  getViewType() {
    return MEMOS_VIEW_TYPE;
  }
  getDisplayText() {
    return "Markdown Memos";
  }
  getIcon() {
    return "book-open";
  }
  async onOpen() {
    const activeNotebook = this.plugin.settings.memoNotebooks.find((item) => item.id === this.activeNotebookId);
    if ((activeNotebook == null ? void 0 : activeNotebook.private) && !this.unlockedNotebookIds.has(activeNotebook.id)) {
      this.activeNotebookId = "default";
      this.expandedNotebookId = this.activeNotebookId;
      this.plugin.settings.activeMemoNotebookId = this.activeNotebookId;
      await this.plugin.saveSettings();
    }
    this.contentEl.empty();
    this.contentEl.addClass("obsidian-memos-view");
    this.containerEl.addClass("obsidian-memos-view-container");
    this.buildLayout();
    await this.refresh();
  }
  async onClose() {
    var _a;
    this.refreshSequence += 1;
    this.destroyDetailCards();
    (_a = this.memoList) == null ? void 0 : _a.destroy();
    this.memoList = void 0;
    this.folderLabel = void 0;
    this.mobileTagButton = void 0;
    this.mobileNotebookList = void 0;
    this.mobileTrashButton = void 0;
    this.mobileSettingsButton = void 0;
    this.mobileTrashToolbar = void 0;
    this.mobileDrawerButton = void 0;
    this.containerEl.removeClass("obsidian-memos-view-container", "is-mobile");
    this.contentEl.empty();
  }
  async refresh(preferredPath) {
    var _a, _b, _c;
    if (this.editingPath && preferredPath === void 0) return;
    const sequence = ++this.refreshSequence;
    try {
      const memos = await this.plugin.repository.getMemos();
      if (sequence !== this.refreshSequence) {
        return;
      }
      this.allMemos = this.sortMemos(memos);
      (_a = this.folderLabel) == null ? void 0 : _a.setText(this.plugin.repository.folder);
      this.renderMobileLibrary();
      this.updateTagOptions();
      await this.applyCurrentFilters(preferredPath, sequence);
    } catch (error) {
      console.error("[Markdown Memos] \u8BFB\u53D6 Memo \u5217\u8868\u5931\u8D25\u3002", error);
      (_b = this.detailContentEl) == null ? void 0 : _b.empty();
      (_c = this.detailContentEl) == null ? void 0 : _c.createDiv({ cls: "obsidian-memos-status is-error", text: "\u65E0\u6CD5\u8BFB\u53D6 Memo \u5217\u8868\uFF0C\u8BF7\u67E5\u770B\u5F00\u53D1\u8005\u63A7\u5236\u53F0\u3002" });
    }
  }
  buildLayout() {
    const page = this.contentEl.createDiv({ cls: "obsidian-memos-page" });
    const toolbar = page.createDiv({ cls: "obsidian-memos-toolbar" });
    const sidebarButton = toolbar.createEl("button", {
      cls: "clickable-icon obsidian-memos-toolbar__icon",
      attr: { type: "button", "aria-label": "\u5C55\u5F00\u6216\u6536\u8D77 Memo \u5217\u8868", title: "\u5C55\u5F00\u6216\u6536\u8D77 Memo \u5217\u8868" }
    });
    (0, import_obsidian15.setIcon)(sidebarButton, "sidebar");
    this.registerDomEvent(sidebarButton, "click", () => void this.toggleListPane());
    const mobileRefreshButton = toolbar.createEl("button", {
      cls: "clickable-icon obsidian-memos-toolbar__mobile-refresh",
      attr: { type: "button", "aria-label": "\u5237\u65B0 Memo", title: "\u5237\u65B0 Memo" }
    });
    (0, import_obsidian15.setIcon)(mobileRefreshButton, "refresh-cw");
    this.registerDomEvent(mobileRefreshButton, "click", () => void this.refresh());
    const title = toolbar.createDiv({ cls: "obsidian-memos-toolbar__title" });
    title.createEl("strong", { text: "Markdown Memos" });
    this.folderLabel = title.createSpan({ cls: "obsidian-memos-toolbar__folder", text: this.plugin.repository.folder });
    const toolbarActions = toolbar.createDiv({ cls: "obsidian-memos-toolbar__actions" });
    const searchShell = toolbarActions.createDiv({ cls: "obsidian-memos-toolbar__search-shell" });
    this.mobileTagButton = searchShell.createEl("button", {
      cls: "clickable-icon obsidian-memos-toolbar__mobile-tag",
      attr: { type: "button", "aria-label": "\u6309\u6807\u7B7E\u7B5B\u9009", title: "\u6309\u6807\u7B7E\u7B5B\u9009" }
    });
    (0, import_obsidian15.setIcon)(this.mobileTagButton, "chevron-down");
    this.registerDomEvent(this.mobileTagButton, "click", (event) => this.openMobileTagMenu(event));
    const searchInput = searchShell.createEl("input", {
      cls: "obsidian-memos-toolbar__search",
      attr: { type: "search", placeholder: " ", "aria-label": "\u641C\u7D22 Memos", autocomplete: "off" }
    });
    const searchIcon = searchShell.createSpan({ cls: "obsidian-memos-toolbar__search-icon", attr: { "aria-hidden": "true" } });
    (0, import_obsidian15.setIcon)(searchIcon, "search");
    const filterSelect = toolbarActions.createEl("select", { cls: "dropdown obsidian-memos-toolbar__select", attr: { "aria-label": "Memo \u7C7B\u578B\u7B5B\u9009" } });
    addSelectOption(filterSelect, "all", "\u5168\u90E8");
    addSelectOption(filterSelect, "note", "\u666E\u901A Memo");
    addSelectOption(filterSelect, "task-open", "\u672A\u5B8C\u6210\u4EFB\u52A1");
    addSelectOption(filterSelect, "task-completed", "\u5DF2\u5B8C\u6210\u4EFB\u52A1");
    addSelectOption(filterSelect, "archived", "\u5DF2\u5F52\u6863");
    filterSelect.value = this.plugin.settings.selectedFilter;
    this.tagSelect = toolbarActions.createEl("select", { cls: "dropdown obsidian-memos-toolbar__select", attr: { "aria-label": "\u6807\u7B7E\u7B5B\u9009" } });
    const applySearch = () => {
      this.searchQuery = searchInput.value;
      searchShell.toggleClass("has-query", Boolean(this.searchQuery));
      if (this.isMobileLayout()) this.mobileDetail = true;
      void this.applyCurrentFilters();
    };
    this.registerDomEvent(searchInput, "input", applySearch);
    searchInput.addEventListener("search", applySearch);
    this.registerDomEvent(searchInput, "compositionend", applySearch);
    this.registerDomEvent(searchInput, "focus", () => {
      window.setTimeout(() => searchInput.setSelectionRange(0, 0), 0);
    });
    this.registerDomEvent(filterSelect, "change", () => {
      const value = filterSelect.value;
      this.plugin.settings.selectedFilter = isFilterValue(value) ? value : "all";
      void this.plugin.saveSettings();
      void this.applyCurrentFilters();
    });
    this.registerDomEvent(this.tagSelect, "change", () => {
      var _a;
      this.plugin.settings.selectedTag = ((_a = this.tagSelect) == null ? void 0 : _a.value) || null;
      void this.plugin.saveSettings();
      void this.applyCurrentFilters();
    });
    const newButton = toolbarActions.createEl("button", {
      cls: "mod-cta obsidian-memos-toolbar__new",
      attr: { type: "button", "aria-label": "\u65B0\u5EFA Memo" }
    });
    newButton.createSpan({ cls: "obsidian-memos-toolbar__new-label is-full", text: "+ \u65B0\u5EFA Memo" });
    const compactNewIcon = newButton.createSpan({ cls: "obsidian-memos-toolbar__new-icon is-compact", attr: { "aria-hidden": "true" } });
    (0, import_obsidian15.setIcon)(compactNewIcon, "plus");
    this.registerDomEvent(newButton, "click", () => {
      this.mobileDetail = true;
      this.updateLayoutState();
      this.composerFocus();
    });
    this.splitEl = page.createDiv({ cls: "obsidian-memos-split" });
    const listPaneEl = this.splitEl.createDiv({ cls: "obsidian-memos-list-pane" });
    const mobileLibrary = listPaneEl.createDiv({ cls: "obsidian-memos-mobile-library" });
    const mobileLibraryUpper = mobileLibrary.createDiv({ cls: "obsidian-memos-mobile-library__upper" });
    this.mobileNotebookList = mobileLibraryUpper.createDiv({ cls: "obsidian-memos-mobile-library__list" });
    const libraryFooter = mobileLibrary.createDiv({ cls: "obsidian-memos-mobile-library__footer" });
    this.mobileTrashButton = libraryFooter.createEl("button", {
      cls: "obsidian-memos-mobile-library__trash",
      attr: { type: "button" }
    });
    const trashIcon = this.mobileTrashButton.createSpan({ cls: "obsidian-memos-mobile-library__trash-icon", attr: { "aria-hidden": "true" } });
    (0, import_obsidian15.setIcon)(trashIcon, "trash");
    this.mobileTrashButton.setAttr("aria-label", "\u56DE\u6536\u7AD9");
    this.registerDomEvent(this.mobileTrashButton, "click", () => void this.openTrash());
    this.mobileSettingsButton = libraryFooter.createEl("button", {
      cls: "obsidian-memos-mobile-library__settings clickable-icon",
      attr: { type: "button", "aria-label": "Markdown Memos \u8BBE\u7F6E" }
    });
    libraryFooter.prepend(this.mobileSettingsButton);
    (0, import_obsidian15.setIcon)(this.mobileSettingsButton, "settings");
    this.registerDomEvent(this.mobileSettingsButton, "click", () => this.openPluginSettings());
    const addNotebookButton = libraryFooter.createEl("button", {
      cls: "clickable-icon obsidian-memos-mobile-library__add",
      attr: { type: "button", "aria-label": "\u65B0\u5EFA\u5907\u5FD8\u5F55", title: "\u65B0\u5EFA\u5907\u5FD8\u5F55" }
    });
    (0, import_obsidian15.setIcon)(addNotebookButton, "plus");
    this.registerDomEvent(addNotebookButton, "click", () => void this.createNotebook());
    this.renderMobileLibrary();
    const listHeader = listPaneEl.createDiv({ cls: "obsidian-memos-list-pane__header" });
    const listTopButton = listHeader.createEl("button", {
      cls: "clickable-icon obsidian-memos-pane-top",
      attr: { type: "button", "aria-label": "\u56DE\u5230 Memo \u5217\u8868\u9876\u90E8", title: "\u56DE\u5230\u5217\u8868\u9876\u90E8" }
    });
    (0, import_obsidian15.setIcon)(listTopButton, "arrow-up-to-line");
    this.listCountLabel = listHeader.createSpan({ cls: "obsidian-memos-list-pane__count", text: "0" });
    this.sortSelect = listHeader.createEl("select", {
      cls: "dropdown obsidian-memos-list-pane__sort",
      attr: { "aria-label": "Memo \u6392\u5E8F" }
    });
    addSelectOption(this.sortSelect, "modified-desc", "\u65F6\u95F4\u2193");
    addSelectOption(this.sortSelect, "manual", "\u624B\u52A8\u6392\u5E8F");
    addSelectOption(this.sortSelect, "modified-asc", "\u65F6\u95F4\u2191");
    addSelectOption(this.sortSelect, "name-asc", "\u540D\u79F0 A\u2192Z");
    addSelectOption(this.sortSelect, "name-desc", "\u540D\u79F0 Z\u2192A");
    addSelectOption(this.sortSelect, "tags-desc", "\u6807\u7B7E\u6570\u2193");
    addSelectOption(this.sortSelect, "tags-asc", "\u6807\u7B7E\u6570\u2191");
    this.sortSelect.value = this.sortOption;
    this.registerDomEvent(this.sortSelect, "change", () => {
      var _a;
      const value = (_a = this.sortSelect) == null ? void 0 : _a.value;
      if (!isMemoSort(value)) return;
      this.sortOption = value;
      this.allMemos = this.sortMemos(this.allMemos);
      void this.applyCurrentFilters();
    });
    const listHost = listPaneEl.createDiv({ cls: "obsidian-memos-list-pane__body" });
    this.registerDomEvent(listTopButton, "click", () => listHost.scrollTo({ top: 0, behavior: "smooth" }));
    this.memoList = new MemoList(this, listHost, {
      bindRowDrag: (row, memo) => this.bindSidebarRow(row, memo),
      onSelect: (memo) => this.selectMemo(memo),
      onToggleTask: (memo) => void this.toggleTaskFromList(memo),
      onDelete: (memo) => this.deleteMemoFromList(memo, true),
      onContextMenu: (memo, event) => this.openListContextMenu(memo, event)
    });
    const mobileScrim = this.splitEl.createDiv({ cls: "obsidian-memos-mobile-scrim" });
    this.registerDomEvent(mobileScrim, "click", () => {
      this.mobileDetail = true;
      this.updateLayoutState();
    });
    const divider = this.splitEl.createDiv({ cls: "obsidian-memos-divider", attr: { role: "separator", "aria-label": "\u8C03\u6574\u5217\u8868\u5BBD\u5EA6" } });
    this.registerDomEvent(divider, "pointerdown", (event) => this.startDividerDrag(event));
    const detailPaneEl = this.splitEl.createDiv({ cls: "obsidian-memos-detail-pane" });
    this.detailContentEl = detailPaneEl.createDiv({ cls: "obsidian-memos-detail-pane__content" });
    this.mobileTrashToolbar = this.detailContentEl.createDiv({ cls: "obsidian-memos-mobile-trash-toolbar" });
    const backFromTrash = this.mobileTrashToolbar.createEl("button", {
      cls: "clickable-icon obsidian-memos-mobile-trash-back",
      attr: { type: "button", "aria-label": "\u8FD4\u56DE\u4E3B\u754C\u9762", title: "\u8FD4\u56DE\u4E3B\u754C\u9762" }
    });
    (0, import_obsidian15.setIcon)(backFromTrash, "arrow-left");
    const emptyTrashButton = this.mobileTrashToolbar.createEl("button", { text: "\u6E05\u7A7A\u56DE\u6536\u7AD9", attr: { type: "button" } });
    this.registerDomEvent(backFromTrash, "click", () => {
      this.showTrash = false;
      this.mobileDetail = true;
      this.renderMobileLibrary();
      void this.refresh();
    });
    this.registerDomEvent(emptyTrashButton, "click", () => void this.emptyTrash());
    const composerHost = this.detailContentEl.createDiv({ cls: "obsidian-memos-composer-host" });
    this.registerDomEvent(composerHost, "pointerdown", (event) => {
      if (this.isMobileLayout() && !this.mobileDetail) {
        event.preventDefault();
        event.stopPropagation();
        this.mobileDetail = true;
        this.updateLayoutState();
      }
    }, true);
    new MemoComposer(
      this,
      composerHost,
      this.plugin.repository,
      async (memo) => {
        if (this.activeNotebookId !== memo.notebookId) return;
        this.mobileDetail = true;
        await this.refresh(memo.file.path);
      },
      {
        defaultType: this.plugin.settings.defaultMemoType,
        attachmentService: this.plugin.attachmentService,
        getPopularTags: () => this.getPopularTags(3),
        isMobileLayout: () => this.isMobileLayout(),
        getNotebookId: () => {
          if (!this.plugin.settings.memoNotebooks.some((book) => book.id === this.activeNotebookId)) {
            throw new Error("\u5F53\u524D\u5907\u5FD8\u5F55\u5DF2\u5220\u9664\uFF0C\u8BF7\u9009\u62E9\u8981\u4FDD\u5B58\u5230\u7684\u5907\u5FD8\u5F55\u540E\u91CD\u8BD5");
          }
          return this.activeNotebookId;
        }
      }
    );
    const detailFeed = this.detailContentEl.createDiv({ cls: "obsidian-memos-detail-feed" });
    this.mobileDrawerButton = detailFeed.createEl("button", {
      cls: "obsidian-memos-mobile-drawer-button",
      attr: { type: "button", "aria-label": "\u5C55\u5F00\u5907\u5FD8\u5F55\u4FA7\u8FB9\u680F", title: "\u5C55\u5F00\u5907\u5FD8\u5F55\u4FA7\u8FB9\u680F" }
    });
    this.registerDomEvent(this.mobileDrawerButton, "click", () => {
      this.mobileDetail = false;
      this.updateLayoutState();
    });
    detailFeed.createDiv({ cls: "obsidian-memos-detail-card-host" });
    this.registerDomEvent(this.contentEl, "keydown", (event) => this.handleKeyboard(event));
    this.registerDomEvent(window, "resize", () => this.updateLayoutState());
    this.registerDomEvent(window, "pointermove", (event) => {
      this.moveDivider(event);
    });
    this.registerDomEvent(window, "pointerup", () => {
      this.stopDividerDrag();
    });
    this.updateLayoutState();
  }
  renderMobileLibrary() {
    var _a;
    if (!this.mobileNotebookList) return;
    this.mobileNotebookList.empty();
    const activeId = this.activeNotebookId;
    const notebooks = [...this.plugin.settings.memoNotebooks].sort((left, right) => Number(right.pinned === true) - Number(left.pinned === true));
    for (const notebook of notebooks) {
      const row = this.mobileNotebookList.createDiv({ cls: "obsidian-memos-mobile-library__row" });
      const button = row.createEl("button", {
        cls: `obsidian-memos-mobile-library__item${!this.showTrash && notebook.id === activeId ? " is-active" : ""}`,
        attr: { type: "button" }
      });
      const icon = button.createSpan({ cls: "obsidian-memos-mobile-library__item-icon", attr: { "aria-hidden": "true" } });
      (0, import_obsidian15.setIcon)(icon, notebook.private ? "lock" : "notebook-tabs");
      button.createSpan({ cls: "obsidian-memos-mobile-library__item-name", text: notebook.name });
      row.dataset.sortKey = notebook.id;
      this.bindArrangement(button, row, notebook.pinned ? "pinned-book" : "book", (keys) => {
        const books = this.plugin.settings.memoNotebooks;
        const ordered = keys.map((key) => books.find((book) => book.id === key));
        this.plugin.settings.memoNotebooks = books.map((book) => keys.includes(book.id) ? ordered.shift() : book);
      });
      this.registerDomEvent(button, "contextmenu", (event) => {
        var _a2;
        event.preventDefault();
        if (!((_a2 = row.parentElement) == null ? void 0 : _a2.hasClass("is-arranging"))) this.openNotebookMenu(notebook, button);
      });
      this.registerDomEvent(button, "click", (event) => {
        if (!event.defaultPrevented) void this.selectNotebook(notebook);
      });
      const expandButton = row.createEl("button", {
        cls: "clickable-icon obsidian-memos-mobile-library__expand",
        attr: { type: "button", "aria-label": "\u5C55\u5F00\u5907\u5FD8\u5F55\u5185\u5BB9", title: "\u5C55\u5F00\u5907\u5FD8\u5F55\u5185\u5BB9" }
      });
      const expanded = this.expandedNotebookId === notebook.id && !this.showTrash;
      (0, import_obsidian15.setIcon)(expandButton, expanded ? "chevron-down" : "chevron-right");
      this.registerDomEvent(expandButton, "click", (event) => {
        event.stopPropagation();
        if (!expanded) {
          void this.selectNotebook(notebook, this.mobileDetail);
          return;
        }
        this.expandedNotebookId = "";
        this.renderMobileLibrary();
      });
      if (expanded) this.renderNotebookContents(row, notebook.id);
    }
    (_a = this.mobileTrashButton) == null ? void 0 : _a.toggleClass("is-active", this.showTrash);
  }
  renderNotebookContents(container, notebookId) {
    const contents = container.createDiv({ cls: "obsidian-memos-mobile-library__contents" });
    const memos = this.allMemos.filter((memo) => memo.notebookId === notebookId && !memo.trashedAt);
    if (memos.length === 0) {
      contents.createDiv({ cls: "obsidian-memos-mobile-library__contents-empty", text: "\u6682\u65E0\u5185\u5BB9" });
      return;
    }
    for (const memo of this.sidebarOrder(memos)) {
      const button = contents.createEl("button", {
        cls: "obsidian-memos-mobile-library__content-item",
        attr: { type: "button" }
      });
      this.bindSidebarRow(button, memo);
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (!contents.hasClass("is-arranging")) this.openListContextMenu(memo, event);
      });
      button.dataset.memoPath = memo.file.path;
      const titleRow = button.createDiv({ cls: "obsidian-memos-mobile-library__content-title-row" });
      if (memo.pinned) {
        const pin = titleRow.createSpan({
          cls: "obsidian-memos-mobile-library__content-pin",
          attr: { "aria-label": "\u5DF2\u7F6E\u9876", title: "\u5DF2\u7F6E\u9876" }
        });
        (0, import_obsidian15.setIcon)(pin, "pin");
      }
      titleRow.createSpan({ cls: "obsidian-memos-mobile-library__content-title", text: getMemoListTitle(memo.content) });
      const preview = [formatListDate(memo.modified), getSummary(memo.content)].filter(Boolean).join("  ");
      button.createDiv({ cls: "obsidian-memos-mobile-library__content-summary", text: preview });
      this.registerDomEvent(button, "click", async () => {
        var _a;
        if (this.activeNotebookId !== notebookId) {
          const notebook = this.plugin.settings.memoNotebooks.find((entry) => entry.id === notebookId);
          if (!notebook) return;
          await this.selectNotebook(notebook);
          if (this.activeNotebookId !== notebookId) return;
        }
        if (this.showTrash || !this.memos.some((entry) => entry.file.path === memo.file.path)) {
          this.showTrash = false;
          this.searchQuery = "";
          const search = this.containerEl.querySelector(".obsidian-memos-toolbar__search");
          if (search) search.value = "";
          (_a = search == null ? void 0 : search.parentElement) == null ? void 0 : _a.removeClass("has-query");
          this.plugin.settings.selectedTag = null;
          this.plugin.settings.selectedFilter = memo.archived ? "archived" : "all";
          const filter = this.containerEl.querySelector(".obsidian-memos-toolbar__select");
          if (filter) filter.value = this.plugin.settings.selectedFilter;
          await this.plugin.saveSettings();
          await this.refresh(memo.file.path);
        }
        this.showTrash = false;
        this.mobileDetail = true;
        this.selectMemo(memo);
      });
    }
  }
  async createNotebook() {
    const name = await this.promptNotebookName("\u65B0\u5EFA\u5907\u5FD8\u5F55");
    if (!(name == null ? void 0 : name.trim())) return;
    const isPrivate = await confirmAction(this.app, "\u662F\u5426\u521B\u5EFA\u4E3A\u79C1\u5BC6\u5907\u5FD8\u5F55\uFF1F");
    let passwordHash;
    if (isPrivate) {
      const password = await requestText(this.app, "\u8BBE\u7F6E\u8BBF\u95EE\u5BC6\u7801", "\u8BF7\u8F93\u5165\u8BBF\u95EE\u5BC6\u7801", "password");
      if (!password) return;
      const confirmation = await requestText(this.app, "\u518D\u6B21\u8F93\u5165\u5BC6\u7801", "\u8BF7\u518D\u6B21\u8F93\u5165\u8BBF\u95EE\u5BC6\u7801", "password");
      if (confirmation !== password) {
        new import_obsidian15.Notice("\u4E24\u6B21\u8F93\u5165\u7684\u5BC6\u7801\u4E0D\u4E00\u81F4");
        return;
      }
      passwordHash = await hashNotebookPassword(password);
    }
    const notebook = {
      id: `notebook-${Date.now().toString(36)}`,
      name: name.trim(),
      private: isPrivate,
      passwordHash
    };
    this.plugin.settings.memoNotebooks.push(notebook);
    this.unlockedNotebookIds.add(notebook.id);
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
    await this.selectNotebook(notebook);
  }
  openNotebookMenu(notebook, anchor) {
    const menu = new import_obsidian15.Menu();
    menu.addItem((item) => item.setTitle(notebook.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876").setIcon("pin").onClick(() => void this.toggleNotebookPinned(notebook)));
    menu.addItem((item) => item.setTitle("\u91CD\u547D\u540D").setIcon("pencil").onClick(() => void this.renameNotebook(notebook)));
    menu.addItem((item) => item.setTitle("\u5220\u9664\u5907\u5FD8\u5F55").setIcon("trash-2").setDisabled(this.plugin.settings.memoNotebooks.length <= 1).onClick(() => void this.deleteNotebook(notebook)));
    const rect = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
  }
  async toggleNotebookPinned(notebook) {
    notebook.pinned = notebook.pinned !== true;
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
  }
  async renameNotebook(notebook) {
    const name = await this.promptNotebookName("\u91CD\u547D\u540D\u5907\u5FD8\u5F55", notebook.name);
    if (!(name == null ? void 0 : name.trim())) return;
    notebook.name = name.trim();
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
  }
  async deleteNotebook(notebook) {
    if (this.plugin.settings.memoNotebooks.length <= 1) return;
    if (!await confirmAction(this.app, `\u5220\u9664\u201C${notebook.name}\u201D\uFF1F\u5176\u4E2D\u7684 Memo \u5C06\u79FB\u52A8\u5230\u9ED8\u8BA4\u5907\u5FD8\u5F55\u3002`)) return;
    const fallback = this.plugin.settings.memoNotebooks.find((item) => item.id !== notebook.id);
    if (!fallback) return;
    await this.plugin.repository.moveMemosToNotebook(notebook.id, fallback.id);
    this.plugin.settings.memoNotebooks = this.plugin.settings.memoNotebooks.filter((item) => item.id !== notebook.id);
    if (this.activeNotebookId === notebook.id) this.activeNotebookId = fallback.id;
    if (this.plugin.settings.activeMemoNotebookId === notebook.id) this.plugin.settings.activeMemoNotebookId = fallback.id;
    this.expandedNotebookId = this.activeNotebookId;
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
    await this.refresh();
  }
  promptNotebookName(title, initial = "") {
    return new Promise((resolve) => {
      new NotebookNameModal(this.app, title, resolve, initial).open();
    });
  }
  async selectNotebook(notebook, showDetail = true) {
    if (notebook.private && !this.unlockedNotebookIds.has(notebook.id)) {
      if (!notebook.passwordHash) {
        const password = await requestText(this.app, `\u4E3A\u201C${notebook.name}\u201D\u8BBE\u7F6E\u5BC6\u7801`, "\u8BF7\u8F93\u5165\u8BBF\u95EE\u5BC6\u7801", "password");
        if (!password) return;
        const confirmation = await requestText(this.app, "\u518D\u6B21\u8F93\u5165\u5BC6\u7801", "\u8BF7\u518D\u6B21\u8F93\u5165\u8BBF\u95EE\u5BC6\u7801", "password");
        if (confirmation !== password) {
          new import_obsidian15.Notice("\u4E24\u6B21\u8F93\u5165\u7684\u5BC6\u7801\u4E0D\u4E00\u81F4");
          return;
        }
        notebook.passwordHash = await hashNotebookPassword(password);
        await this.plugin.saveSettings();
      } else {
        const password = await requestText(this.app, `\u8F93\u5165\u201C${notebook.name}\u201D\u7684\u5BC6\u7801`, "\u8BF7\u8F93\u5165\u8BBF\u95EE\u5BC6\u7801", "password");
        if (!password || await hashNotebookPassword(password) !== notebook.passwordHash) {
          new import_obsidian15.Notice("\u5BC6\u7801\u9519\u8BEF");
          return;
        }
      }
      this.unlockedNotebookIds.add(notebook.id);
    }
    this.activeNotebookId = notebook.id;
    this.plugin.settings.activeMemoNotebookId = notebook.id;
    this.expandedNotebookId = notebook.id;
    this.showTrash = false;
    this.mobileDetail = showDetail;
    this.searchQuery = "";
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
    await this.refresh();
  }
  async openTrash() {
    this.showTrash = true;
    this.mobileDetail = true;
    this.renderMobileLibrary();
    await this.applyCurrentFilters();
  }
  openPluginSettings() {
    const setting = this.app.setting;
    if (!(setting == null ? void 0 : setting.open)) {
      new import_obsidian15.Notice("\u65E0\u6CD5\u6253\u5F00\u8BBE\u7F6E");
      return;
    }
    setting.open();
    window.setTimeout(() => {
      var _a;
      return (_a = setting.openTabById) == null ? void 0 : _a.call(setting, "markdown-memos");
    }, 0);
  }
  async emptyTrash() {
    if (!await confirmAction(this.app, "\u786E\u5B9A\u6C38\u4E45\u6E05\u7A7A\u5F53\u524D\u5907\u5FD8\u5F55\u7684\u56DE\u6536\u7AD9\u5417\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002")) return;
    await this.plugin.repository.emptyTrash();
    await this.refresh();
  }
  async renderDetail(sequence) {
    var _a;
    const host = (_a = this.detailContentEl) == null ? void 0 : _a.querySelector(".obsidian-memos-detail-card-host");
    if (!host || sequence !== this.refreshSequence) {
      return;
    }
    const scrollTop = host.scrollTop;
    this.destroyDetailCards();
    host.empty();
    if (this.memos.length === 0) {
      const empty = host.createDiv({ cls: "obsidian-memos-detail-empty" });
      empty.createEl("h2", { text: this.showTrash ? "\u56DE\u6536\u7AD9\u4E3A\u7A7A" : "\u6682\u65E0 Memo" });
      if (!this.showTrash) empty.createEl("p", { text: "\u5728\u4E0A\u65B9\u8F93\u5165\u6846\u5F00\u59CB\u8BB0\u5F55\u3002" });
      return;
    }
    for (const memo of this.memos) {
      if (sequence !== this.refreshSequence) return;
      const item = host.createDiv({ cls: `obsidian-memos-feed-item${memo.file.path === this.selectedPath ? " is-selected" : ""}` });
      item.dataset.memoPath = memo.file.path;
      if (this.showTrash) {
        const trashActions = item.createDiv({ cls: "obsidian-memos-trash-actions" });
        const restoreButton = item.createEl("button", {
          cls: "clickable-icon obsidian-memos-trash-action obsidian-memos-trash-restore",
          attr: { type: "button", "aria-label": "\u8FD8\u539F Memo", title: "\u8FD8\u539F Memo" }
        });
        (0, import_obsidian15.setIcon)(restoreButton, "rotate-ccw");
        this.registerDomEvent(restoreButton, "click", async (event) => {
          event.stopPropagation();
          await this.plugin.repository.restoreMemo(memo.file);
          await this.refresh();
        });
        trashActions.appendChild(restoreButton);
        const deleteButton = trashActions.createEl("button", {
          cls: "clickable-icon obsidian-memos-trash-action obsidian-memos-trash-permanent-delete",
          attr: { type: "button", "aria-label": "\u6C38\u4E45\u5220\u9664 Memo", title: "\u6C38\u4E45\u5220\u9664 Memo" }
        });
        (0, import_obsidian15.setIcon)(deleteButton, "brush");
        this.registerDomEvent(deleteButton, "click", async (event) => {
          event.stopPropagation();
          if (!await confirmAction(this.app, "\u786E\u5B9A\u6C38\u4E45\u5220\u9664\u8FD9\u4E2A Memo \u5417\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002")) return;
          await this.plugin.repository.deleteMemo(memo.file);
          await this.refresh();
        });
      }
      const card = new MemoCard(this.app, this, item, this.plugin.repository, memo, {
        onChanged: () => this.refresh(memo.file.path),
        onMove: (event) => this.openMoveMenu(memo, event),
        attachmentService: this.plugin.attachmentService,
        onEditingChange: (editing) => {
          this.editingPath = editing ? memo.file.path : void 0;
        },
        getPopularTags: () => this.getPopularTags(3),
        isMobileLayout: () => this.isMobileLayout(),
        trashMode: this.showTrash
      });
      this.detailCards.push(card);
      await card.render();
    }
    host.scrollTop = scrollTop;
    if (this.pendingScrollPath === this.selectedPath && this.pendingScrollPath) {
      this.scrollSelectedIntoView(false);
      this.pendingScrollPath = void 0;
    }
  }
  selectMemo(memo) {
    var _a;
    this.selectedPath = memo.file.path;
    this.mobileDetail = true;
    (_a = this.memoList) == null ? void 0 : _a.setMemos(this.sidebarOrder(this.memos), this.selectedPath);
    this.updateLayoutState();
    this.updateSelectedFeedItem();
    this.pendingScrollPath = memo.file.path;
    window.requestAnimationFrame(() => this.scrollSelectedIntoView(false));
  }
  async applyCurrentFilters(preferredPath, sequence = this.refreshSequence) {
    var _a, _b, _c;
    const query = this.searchQuery.trim().toLocaleLowerCase();
    const selectedTag = this.plugin.settings.selectedTag;
    const selectedFilter = this.plugin.settings.selectedFilter;
    const activeNotebookId = this.activeNotebookId;
    const filterByNotebook = true;
    this.memos = this.allMemos.filter((memo) => {
      if (filterByNotebook && !this.showTrash && memo.notebookId !== activeNotebookId) return false;
      if (this.showTrash) {
        if (!memo.trashedAt) return false;
      } else if (memo.trashedAt) {
        return false;
      }
      if (this.showTrash) {
        if (!query) return true;
        const trashHaystack = [memo.content, memo.file.basename, ...memo.tags].join("\n").toLocaleLowerCase();
        return trashHaystack.includes(query);
      }
      if (selectedFilter === "archived") {
        if (!memo.archived) return false;
      } else if (memo.archived) {
        return false;
      }
      if (selectedFilter === "note" && memo.type !== "note") return false;
      if (selectedFilter === "task-open" && (memo.type !== "task" || memo.completed)) return false;
      if (selectedFilter === "task-completed" && (memo.type !== "task" || !memo.completed)) return false;
      if (selectedTag && !memo.tags.includes(selectedTag)) return false;
      if (!query) return true;
      const haystack = [memo.content, memo.file.basename, ...memo.tags, ...memo.attachments.map((attachment) => attachment.name)].join("\n").toLocaleLowerCase();
      return haystack.includes(query);
    });
    const requestedPath = preferredPath != null ? preferredPath : this.selectedPath;
    this.selectedPath = this.memos.some((memo) => memo.file.path === requestedPath) ? requestedPath : (_a = this.memos[0]) == null ? void 0 : _a.file.path;
    if (!this.selectedPath && this.mobileDetail && !this.searchQuery.trim()) {
      this.mobileDetail = false;
    }
    (_b = this.listCountLabel) == null ? void 0 : _b.setText(this.memos.length === this.allMemos.length ? String(this.memos.length) : `${this.memos.length}/${this.allMemos.length}`);
    (_c = this.memoList) == null ? void 0 : _c.setMemos(this.sidebarOrder(this.memos), this.selectedPath);
    this.updateLayoutState();
    await this.renderDetail(sequence);
  }
  updateTagOptions() {
    var _a, _b, _c, _d;
    if (!this.tagSelect) {
      return;
    }
    const tagFrequency = this.getTagFrequency();
    const tags = Array.from(tagFrequency.keys()).sort((left, right) => {
      var _a2, _b2;
      const countDifference = ((_a2 = tagFrequency.get(right)) != null ? _a2 : 0) - ((_b2 = tagFrequency.get(left)) != null ? _b2 : 0);
      return countDifference || left.localeCompare(right);
    });
    const selected = this.plugin.settings.selectedTag;
    this.tagSelect.empty();
    addSelectOption(this.tagSelect, "", "\u5168\u90E8\u6807\u7B7E");
    for (const tag of tags) {
      addSelectOption(this.tagSelect, tag, `${tag} (${(_a = tagFrequency.get(tag)) != null ? _a : 0})`);
    }
    if (selected && tags.includes(selected)) {
      this.tagSelect.value = selected;
    } else {
      this.plugin.settings.selectedTag = null;
      this.tagSelect.value = "";
    }
    const activeTag = this.plugin.settings.selectedTag;
    (_b = this.mobileTagButton) == null ? void 0 : _b.toggleClass("has-active-tag", Boolean(activeTag));
    (_c = this.mobileTagButton) == null ? void 0 : _c.setAttr("aria-label", activeTag ? `\u5F53\u524D\u6807\u7B7E\uFF1A${activeTag}` : "\u6309\u6807\u7B7E\u7B5B\u9009");
    (_d = this.mobileTagButton) == null ? void 0 : _d.setAttr("title", activeTag ? `\u5F53\u524D\u6807\u7B7E\uFF1A${activeTag}` : "\u6309\u6807\u7B7E\u7B5B\u9009");
  }
  openMobileTagMenu(event) {
    const menu = new import_obsidian15.Menu();
    const selectedTag = this.plugin.settings.selectedTag;
    menu.addItem((item) => item.setTitle("\u5168\u90E8\u6807\u7B7E").setIcon("list-filter").setChecked(!selectedTag).onClick(() => void this.selectMobileTag(null)));
    const frequency = this.getTagFrequency();
    const tags = Array.from(frequency.keys()).sort((left, right) => {
      var _a, _b;
      const countDifference = ((_a = frequency.get(right)) != null ? _a : 0) - ((_b = frequency.get(left)) != null ? _b : 0);
      return countDifference || left.localeCompare(right);
    });
    for (const tag of tags) {
      menu.addItem((item) => {
        var _a;
        return item.setTitle(`${tag} (${(_a = frequency.get(tag)) != null ? _a : 0})`).setIcon("hash").setChecked(tag === selectedTag).onClick(() => void this.selectMobileTag(tag));
      });
    }
    menu.showAtMouseEvent(event);
  }
  async selectMobileTag(tag) {
    var _a, _b, _c;
    this.plugin.settings.selectedTag = tag;
    if (this.tagSelect) this.tagSelect.value = tag != null ? tag : "";
    (_a = this.mobileTagButton) == null ? void 0 : _a.toggleClass("has-active-tag", Boolean(tag));
    (_b = this.mobileTagButton) == null ? void 0 : _b.setAttr("aria-label", tag ? `\u5F53\u524D\u6807\u7B7E\uFF1A${tag}` : "\u6309\u6807\u7B7E\u7B5B\u9009");
    (_c = this.mobileTagButton) == null ? void 0 : _c.setAttr("title", tag ? `\u5F53\u524D\u6807\u7B7E\uFF1A${tag}` : "\u6309\u6807\u7B7E\u7B5B\u9009");
    await this.plugin.saveSettings();
    await this.applyCurrentFilters();
  }
  getTagFrequency() {
    var _a, _b;
    const frequency = /* @__PURE__ */ new Map();
    for (const memo of this.allMemos) {
      if (memo.trashedAt) continue;
      const occurrences = extractMemoTagOccurrences(memo.content);
      for (const tag of occurrences) frequency.set(tag, ((_a = frequency.get(tag)) != null ? _a : 0) + 1);
      for (const tag of memo.tags) {
        if (!occurrences.includes(tag)) frequency.set(tag, ((_b = frequency.get(tag)) != null ? _b : 0) + 1);
      }
    }
    return frequency;
  }
  getPopularTags(limit) {
    const configured = this.plugin.settings.composerTags.filter(Boolean);
    if (configured.length > 0) return configured.slice(0, limit);
    const frequency = this.getTagFrequency();
    return Array.from(frequency.keys()).sort((left, right) => {
      var _a, _b;
      return ((_a = frequency.get(right)) != null ? _a : 0) - ((_b = frequency.get(left)) != null ? _b : 0) || left.localeCompare(right);
    }).slice(0, limit);
  }
  sidebarOrder(memos) {
    var _a, _b;
    const ranks = new Map(((_a = this.plugin.settings.pinnedMemoOrder) != null ? _a : []).map((path, index) => [path, index]));
    const normal = new Map(((_b = this.plugin.settings.sidebarMemoOrder) != null ? _b : []).map((path, index) => [path, index]));
    return [...memos].sort((a, b) => {
      var _a2, _b2, _c, _d;
      return Number(b.pinned) - Number(a.pinned) || (a.pinned && b.pinned ? ((_a2 = ranks.get(a.file.path)) != null ? _a2 : Infinity) - ((_b2 = ranks.get(b.file.path)) != null ? _b2 : Infinity) : (Number(a.frontmatter.notebookMoveOrder) || Infinity) - (Number(b.frontmatter.notebookMoveOrder) || Infinity) || ((_c = normal.get(a.file.path)) != null ? _c : Infinity) - ((_d = normal.get(b.file.path)) != null ? _d : Infinity));
    });
  }
  bindSidebarRow(row, memo) {
    row.dataset.sortKey = memo.file.path;
    this.bindArrangement(row, row, memo.pinned ? "pinned" : "memo", (keys) => {
      const field = memo.pinned ? "pinnedMemoOrder" : "sidebarMemoOrder";
      const all = this.sidebarOrder(this.allMemos.filter((entry) => entry.pinned === memo.pinned));
      this.plugin.settings[field] = mergeVisibleOrder(all.map((entry) => entry.file.path), keys);
    });
  }
  bindArrangement(handle, row, group, save) {
    bindSidebarDrag(handle, row, group, (keys) => {
      var _a;
      save(keys);
      void this.plugin.saveSettings().catch(() => new import_obsidian15.Notice("\u6392\u5E8F\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5"));
      this.renderMobileLibrary();
      (_a = this.memoList) == null ? void 0 : _a.setMemos(this.sidebarOrder(this.memos), this.selectedPath);
    });
  }
  sortMemos(memos) {
    var _a;
    if (this.sortOption === "manual") {
      const order = new Map(((_a = this.plugin.settings.manualMemoOrder) != null ? _a : []).map((path, index) => [path, index]));
      return [...memos].sort((a, b) => {
        var _a2, _b;
        return ((_a2 = order.get(a.file.path)) != null ? _a2 : -1) - ((_b = order.get(b.file.path)) != null ? _b : -1) || b.created.getTime() - a.created.getTime();
      });
    }
    return [...memos].sort((left, right) => {
      let comparison = 0;
      if (this.sortOption === "name-asc" || this.sortOption === "name-desc") {
        comparison = getMemoListTitle(left.content).localeCompare(getMemoListTitle(right.content), "zh-Hans");
        if (this.sortOption === "name-desc") comparison *= -1;
      } else if (this.sortOption === "tags-desc" || this.sortOption === "tags-asc") {
        comparison = getMemoTagCount(left) - getMemoTagCount(right);
        if (this.sortOption === "tags-desc") comparison *= -1;
      } else {
        comparison = left.modified.getTime() - right.modified.getTime();
        if (this.sortOption === "modified-desc") comparison *= -1;
      }
      return comparison || right.created.getTime() - left.created.getTime() || right.file.path.localeCompare(left.file.path);
    });
  }
  openListContextMenu(memo, event) {
    const menu = new import_obsidian15.Menu();
    menu.addItem((item) => item.setTitle("\u590D\u5236").setIcon("copy").onClick(async () => {
      try {
        await navigator.clipboard.writeText(memoClipboardText(memo.content));
        new import_obsidian15.Notice("\u5DF2\u590D\u5236");
      } catch (e) {
        new import_obsidian15.Notice("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
      }
    }));
    menu.addItem((item) => item.setTitle(memo.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876").setIcon("pin").onClick(() => void this.togglePinnedFromList(memo)));
    menu.addItem((item) => item.setTitle("\u5220\u9664").setIcon("trash-2").onClick(() => void this.deleteMemoFromList(memo)));
    menu.showAtMouseEvent(event);
  }
  openMoveMenu(memo, event) {
    const targets = this.plugin.settings.memoNotebooks.filter((book) => book.id !== memo.notebookId);
    if (!targets.length) {
      new import_obsidian15.Notice("\u8BF7\u5148\u521B\u5EFA\u53E6\u4E00\u4E2A\u5907\u5FD8\u5F55");
      return;
    }
    const menu = new import_obsidian15.Menu();
    for (const book of targets) {
      menu.addItem((item) => item.setTitle(book.name).setIcon(book.private ? "lock" : "notebook-tabs").onClick(() => void this.moveMemo(memo, book.id)));
    }
    menu.showAtMouseEvent(event);
  }
  async moveMemo(memo, notebookId) {
    if (!this.plugin.settings.memoNotebooks.some((book) => book.id === notebookId)) {
      new import_obsidian15.Notice("\u76EE\u6807\u5907\u5FD8\u5F55\u5DF2\u4E0D\u5B58\u5728");
      return;
    }
    try {
      await this.plugin.repository.moveMemoToNotebook(memo.file, notebookId);
      this.editingPath = void 0;
      await this.refresh(memo.file.path);
      new import_obsidian15.Notice("\u6D88\u606F\u5DF2\u79FB\u52A8");
    } catch (e) {
      new import_obsidian15.Notice("\u79FB\u52A8\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
    }
  }
  async togglePinnedFromList(memo) {
    try {
      await this.plugin.repository.togglePinned(memo.file);
      await this.refresh(memo.file.path);
    } catch (error) {
      console.error("[Markdown Memos] \u66F4\u65B0\u7F6E\u9876\u5931\u8D25\u3002", error);
      new import_obsidian15.Notice("\u66F4\u65B0\u7F6E\u9876\u5931\u8D25");
    }
  }
  async deleteMemoFromList(memo, keepMobileListOpen = false) {
    const mobile = this.isMobileLayout();
    if (!mobile && !await confirmMemoDeletion(this.app, memo)) return;
    try {
      await this.plugin.repository.trashMemo(memo.file);
      if (keepMobileListOpen && mobile) {
        this.mobileDetail = false;
      }
      await this.refresh();
    } catch (error) {
      console.error("[Markdown Memos] \u5220\u9664\u5931\u8D25\u3002", error);
      new import_obsidian15.Notice("\u5220\u9664\u5931\u8D25");
    }
  }
  async toggleTaskFromList(memo) {
    try {
      await this.plugin.repository.toggleTaskCompleted(memo.file);
      await this.refresh(memo.file.path);
    } catch (error) {
      console.error("[Markdown Memos] \u66F4\u65B0\u4EFB\u52A1\u5931\u8D25\u3002", error);
      new import_obsidian15.Notice("\u66F4\u65B0\u4EFB\u52A1\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u5F00\u53D1\u8005\u63A7\u5236\u53F0");
    }
  }
  handleKeyboard(event) {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement || event.isComposing) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
      event.preventDefault();
      this.mobileDetail = true;
      this.updateLayoutState();
      this.composerFocus();
      return;
    }
    if (event.key === "Escape" && this.isMobileLayout() && this.mobileDetail) {
      this.mobileDetail = false;
      this.updateLayoutState();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" || this.memos.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = Math.max(0, this.memos.findIndex((memo) => memo.file.path === this.selectedPath));
    const offset = event.key === "ArrowUp" ? -1 : 1;
    const nextIndex = Math.min(this.memos.length - 1, Math.max(0, currentIndex + offset));
    const nextMemo = this.memos[nextIndex];
    if (nextMemo) {
      this.selectMemo(nextMemo);
    }
  }
  composerFocus() {
    var _a, _b;
    (_b = (_a = this.detailContentEl) == null ? void 0 : _a.querySelector(".obsidian-memos-composer__input")) == null ? void 0 : _b.focus();
  }
  destroyDetailCards() {
    for (const card of this.detailCards) card.destroy();
    this.detailCards = [];
  }
  updateSelectedFeedItem() {
    var _a;
    const items = (_a = this.detailContentEl) == null ? void 0 : _a.querySelectorAll(".obsidian-memos-feed-item");
    items == null ? void 0 : items.forEach((item) => item.toggleClass("is-selected", item.dataset.memoPath === this.selectedPath));
  }
  scrollSelectedIntoView(smooth) {
    var _a, _b;
    if (!this.selectedPath) return;
    const items = (_a = this.detailContentEl) == null ? void 0 : _a.querySelectorAll(".obsidian-memos-feed-item");
    const selected = Array.from(items != null ? items : []).find((item) => item.dataset.memoPath === this.selectedPath);
    const host = (_b = this.detailContentEl) == null ? void 0 : _b.querySelector(".obsidian-memos-detail-card-host");
    if (!selected || !host) return;
    const top = Math.max(0, host.scrollTop + selected.getBoundingClientRect().top - host.getBoundingClientRect().top);
    host.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }
  async toggleListPane() {
    if (this.isMobileLayout()) {
      this.mobileDetail = !this.mobileDetail;
      this.updateLayoutState();
      return;
    }
    this.plugin.settings.listPaneCollapsed = !this.plugin.settings.listPaneCollapsed;
    await this.plugin.saveSettings();
    this.updateLayoutState();
  }
  updateLayoutState() {
    var _a, _b;
    if (!this.splitEl) {
      return;
    }
    this.contentEl.toggleClass("is-list-right", this.plugin.settings.listPanePosition === "right");
    this.contentEl.toggleClass("is-list-collapsed", this.plugin.settings.listPaneCollapsed);
    this.contentEl.toggleClass("is-mobile", this.isMobileLayout());
    this.containerEl.toggleClass("is-mobile", this.isMobileLayout());
    this.contentEl.toggleClass("is-mobile-detail", this.mobileDetail);
    this.contentEl.toggleClass("is-trash-mode", this.showTrash);
    (_a = this.mobileTrashToolbar) == null ? void 0 : _a.toggleClass("is-visible", this.showTrash);
    (_b = this.mobileDrawerButton) == null ? void 0 : _b.toggleClass("is-visible", this.isMobileLayout() && this.mobileDetail);
    this.splitEl.setCssProps({ "--memos-list-width": `${this.plugin.settings.listPaneWidth}px` });
  }
  isMobileLayout() {
    const appIsMobile = this.app.isMobile;
    return appIsMobile === true || import_obsidian15.Platform.isMobile;
  }
  startDividerDrag(event) {
    if (this.isMobileLayout() || this.plugin.settings.listPaneCollapsed) {
      return;
    }
    event.preventDefault();
    this.isDraggingDivider = true;
    this.contentEl.addClass("is-dragging-divider");
  }
  moveDivider(event) {
    if (!this.isDraggingDivider || !this.splitEl) {
      return;
    }
    const bounds = this.splitEl.getBoundingClientRect();
    const width = this.plugin.settings.listPanePosition === "right" ? bounds.right - event.clientX : event.clientX - bounds.left;
    const nextWidth = Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, Math.round(width)));
    this.plugin.settings.listPaneWidth = nextWidth;
    this.splitEl.setCssProps({ "--memos-list-width": `${nextWidth}px` });
  }
  stopDividerDrag() {
    if (!this.isDraggingDivider) {
      return;
    }
    this.isDraggingDivider = false;
    this.contentEl.removeClass("is-dragging-divider");
    void this.plugin.saveSettings();
  }
};
function addSelectOption(select, value, label) {
  select.createEl("option", { text: label, attr: { value } });
}
function getMemoTagCount(memo) {
  return (/* @__PURE__ */ new Set([...memo.tags, ...extractMemoTagOccurrences(memo.content)])).size;
}
function isMemoSort(value) {
  return value === "manual" || value === "modified-desc" || value === "modified-asc" || value === "name-asc" || value === "name-desc" || value === "tags-desc" || value === "tags-asc";
}
function isFilterValue(value) {
  return value === "all" || value === "note" || value === "task-open" || value === "task-completed" || value === "archived";
}
async function hashNotebookPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
var NotebookNameModal = class extends import_obsidian15.Modal {
  constructor(app, heading, resolveName, initial) {
    super(app);
    this.heading = heading;
    this.resolveName = resolveName;
    this.initial = initial;
    this.submitted = false;
  }
  onOpen() {
    this.titleEl.setText(this.heading);
    const input = this.contentEl.createEl("input", {
      cls: "obsidian-memos-modal-input",
      attr: { type: "text", placeholder: "\u5907\u5FD8\u5F55\u540D\u79F0", value: this.initial }
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88", attr: { type: "button" } });
    const confirm = actions.createEl("button", { text: "\u786E\u5B9A", cls: "mod-cta", attr: { type: "button" } });
    const submit = () => {
      const name = input.value.trim();
      if (!name) return;
      this.submitted = true;
      this.resolveName(name);
      this.close();
    };
    cancel.addEventListener("click", () => this.close());
    confirm.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }
  onClose() {
    if (!this.submitted) this.resolveName(null);
    this.contentEl.empty();
  }
};
var ConfirmActionModal = class extends import_obsidian15.Modal {
  constructor(app, message, resolveResult) {
    super(app);
    this.message = message;
    this.resolveResult = resolveResult;
    this.resolved = false;
  }
  onOpen() {
    this.titleEl.setText("\u786E\u8BA4\u64CD\u4F5C");
    this.contentEl.createEl("p", { text: this.message });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88", attr: { type: "button" } });
    const confirm = actions.createEl("button", { text: "\u786E\u5B9A", cls: "mod-cta", attr: { type: "button" } });
    cancel.addEventListener("click", () => this.finish(false));
    confirm.addEventListener("click", () => this.finish(true));
    confirm.focus();
  }
  onClose() {
    this.contentEl.empty();
    if (this.resolved) return;
    this.resolved = true;
    this.resolveResult(false);
  }
  finish(confirmed) {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveResult(confirmed);
    this.close();
  }
};
function confirmAction(app, message) {
  return new Promise((resolve) => new ConfirmActionModal(app, message, resolve).open());
}
var TextInputModal = class extends import_obsidian15.Modal {
  constructor(app, heading, placeholder, inputType, resolveValue) {
    super(app);
    this.heading = heading;
    this.placeholder = placeholder;
    this.inputType = inputType;
    this.resolveValue = resolveValue;
    this.resolved = false;
  }
  onOpen() {
    this.titleEl.setText(this.heading);
    const input = this.contentEl.createEl("input", {
      cls: "obsidian-memos-modal-input",
      attr: { type: this.inputType, placeholder: this.placeholder }
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88", attr: { type: "button" } });
    const confirm = actions.createEl("button", { text: "\u786E\u5B9A", cls: "mod-cta", attr: { type: "button" } });
    const submit = () => {
      if (this.resolved) return;
      this.resolved = true;
      this.resolveValue(input.value);
      this.close();
    };
    cancel.addEventListener("click", () => this.close());
    confirm.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      submit();
    });
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }
  onClose() {
    this.contentEl.empty();
    if (this.resolved) return;
    this.resolved = true;
    this.resolveValue(null);
  }
};
function requestText(app, heading, placeholder, inputType = "text") {
  return new Promise((resolve) => new TextInputModal(app, heading, placeholder, inputType, resolve).open());
}

// src/main.ts
var DEFAULT_SETTINGS = {
  memoFolder: DEFAULT_MEMO_FOLDER,
  attachmentFolder: "",
  listPanePosition: "left",
  listPaneCollapsed: false,
  listPaneWidth: 300,
  defaultMemoType: "note",
  selectedFilter: "all",
  selectedTag: null,
  memoNotebooks: [
    { id: "default", name: "\u5907\u5FD8\u5F55 1", private: false },
    { id: "private", name: "\u79C1\u5BC6\u5907\u5FD8\u5F55", private: true }
  ],
  activeMemoNotebookId: "default",
  composerTags: []
};
var ObsidianMemosPlugin = class extends import_obsidian16.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.repository = new MemoRepository(this.app, () => this.settings, () => this.saveSettings());
    this.attachmentService = new AttachmentService(this.app, this.repository, () => this.settings);
    this.registerView(MEMOS_VIEW_TYPE, (leaf) => new MemosView(leaf, this));
    this.addRibbonIcon("book-open", "\u6253\u5F00 Markdown Memos", () => void this.openMemosView());
    this.addCommand({
      id: "open-memos-view",
      name: "Open memos view",
      callback: () => void this.openMemosView()
    });
    this.addSettingTab(new ObsidianMemosSettingTab(this.app, this));
    this.registerEvent(this.app.vault.on("create", (file) => this.handleVaultChange(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleVaultChange(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.handleVaultChange(file)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.isRelevantPath(oldPath) || this.isRelevantFile(file)) {
          this.scheduleViewRefresh();
        }
      })
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.isRelevantFile(file)) {
          this.scheduleViewRefresh();
        }
      })
    );
  }
  onunload() {
    if (this.refreshTimer !== void 0) {
      window.clearTimeout(this.refreshTimer);
    }
  }
  async openMemosView() {
    try {
      const existing = this.app.workspace.getLeavesOfType(MEMOS_VIEW_TYPE)[0];
      if (existing) {
        this.app.workspace.setActiveLeaf(existing, { focus: true });
        return;
      }
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: MEMOS_VIEW_TYPE, active: true });
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    } catch (error) {
      console.error("[Markdown Memos] \u6253\u5F00 View \u5931\u8D25\u3002", error);
      new import_obsidian16.Notice(`\u6253\u5F00 Markdown Memos \u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  scheduleViewRefresh() {
    if (this.refreshTimer !== void 0) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = void 0;
      for (const leaf of this.app.workspace.getLeavesOfType(MEMOS_VIEW_TYPE)) {
        if (leaf.view instanceof MemosView) {
          void leaf.view.refresh();
        }
      }
    }, 80);
  }
  async saveSettings() {
    this.settings.memoFolder = normalizeMemoFolder(this.settings.memoFolder);
    await this.saveData(this.settings);
  }
  async loadSettings() {
    var _a, _b, _c;
    const saved = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved != null ? saved : {},
      memoFolder: normalizeMemoFolder((_a = saved == null ? void 0 : saved.memoFolder) != null ? _a : DEFAULT_MEMO_FOLDER),
      attachmentFolder: typeof (saved == null ? void 0 : saved.attachmentFolder) === "string" ? saved.attachmentFolder.trim() : "",
      listPanePosition: (saved == null ? void 0 : saved.listPanePosition) === "left" ? "left" : "right",
      listPaneCollapsed: (saved == null ? void 0 : saved.listPaneCollapsed) === true,
      listPaneWidth: clampListPaneWidth(saved == null ? void 0 : saved.listPaneWidth),
      defaultMemoType: (saved == null ? void 0 : saved.defaultMemoType) === "task" ? "task" : "note",
      selectedFilter: isMemoFilter(saved == null ? void 0 : saved.selectedFilter) ? saved.selectedFilter : "all",
      selectedTag: typeof (saved == null ? void 0 : saved.selectedTag) === "string" && saved.selectedTag ? saved.selectedTag : null,
      memoNotebooks: normalizeNotebooks(saved == null ? void 0 : saved.memoNotebooks),
      activeMemoNotebookId: typeof (saved == null ? void 0 : saved.activeMemoNotebookId) === "string" && saved.activeMemoNotebookId ? saved.activeMemoNotebookId : "default",
      composerTags: normalizeComposerTags(saved == null ? void 0 : saved.composerTags),
      manualMemoOrder: Array.isArray(saved == null ? void 0 : saved.manualMemoOrder) ? saved.manualMemoOrder.filter((path) => typeof path === "string") : []
    };
    if (!this.settings.memoNotebooks.some((notebook) => notebook.id === this.settings.activeMemoNotebookId)) {
      this.settings.activeMemoNotebookId = (_c = (_b = this.settings.memoNotebooks[0]) == null ? void 0 : _b.id) != null ? _c : "default";
    }
  }
  handleVaultChange(file) {
    if (this.isRelevantFile(file)) {
      this.scheduleViewRefresh();
    }
  }
  isRelevantFile(file) {
    return this.isRelevantPath(file.path);
  }
  isRelevantPath(path) {
    return isPathInsideFolder(path, this.settings.memoFolder);
  }
};
function normalizeComposerTags(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
}
function normalizeNotebooks(value) {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.memoNotebooks.map((item) => ({ ...item }));
  const notebooks = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item;
    if (typeof candidate.id !== "string" || !candidate.id || typeof candidate.name !== "string" || !candidate.name.trim()) return [];
    return [{
      id: candidate.id,
      name: candidate.name.trim(),
      private: candidate.private === true,
      passwordHash: typeof candidate.passwordHash === "string" && candidate.passwordHash ? candidate.passwordHash : void 0,
      pinned: candidate.pinned === true
    }];
  });
  if (!notebooks.some((item) => item.id === "default")) notebooks.unshift({ id: "default", name: "\u5907\u5FD8\u5F55 1", private: false, passwordHash: void 0, pinned: false });
  if (!notebooks.some((item) => item.id === "private")) notebooks.push({ id: "private", name: "\u79C1\u5BC6\u5907\u5FD8\u5F55", private: true, passwordHash: void 0, pinned: false });
  return notebooks;
}
function isMemoFilter(value) {
  return value === "all" || value === "note" || value === "task-open" || value === "task-completed" || value === "archived";
}
function clampListPaneWidth(value) {
  const width = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_SETTINGS.listPaneWidth;
  return Math.min(420, Math.max(240, Math.round(width)));
}
