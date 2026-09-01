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
var import_obsidian11 = require("obsidian");

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
function extractExternalUrls(content) {
  var _a;
  const matches = (_a = content.match(/https?:\/\/[^\s<>()\x5B\x5D{}"']+/gi)) != null ? _a : [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, ""))));
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
  constructor(app, getSettings) {
    this.app = app;
    this.getSettings = getSettings;
    this.createQueue = Promise.resolve();
  }
  get folder() {
    return normalizeMemoFolder(this.getSettings().memoFolder);
  }
  createMemo(rawContent, options = {}) {
    const operation = this.createQueue.then(() => this.createMemoInternal(rawContent, options));
    this.createQueue = operation.then(
      () => void 0,
      () => void 0
    );
    return operation;
  }
  async createMemoInternal(rawContent, options) {
    var _a;
    if (!rawContent.trim()) {
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
        attachments: []
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
  async togglePinned(file) {
    const currentFile = this.requireFile(file);
    await this.updateFrontmatter(currentFile, (frontmatter) => {
      frontmatter.pinned = frontmatter.pinned !== true;
    });
    return this.readMemo(currentFile);
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
  async updateFrontmatter(file, update) {
    await this.app.fileManager.processFrontMatter(file, (rawFrontmatter) => {
      const frontmatter = rawFrontmatter && typeof rawFrontmatter === "object" && !Array.isArray(rawFrontmatter) ? rawFrontmatter : {};
      update(frontmatter);
      frontmatter.modified = formatLocalIso(/* @__PURE__ */ new Date());
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
var import_obsidian3 = require("obsidian");
var AttachmentService = class {
  constructor(app, repository, getSettings) {
    this.app = app;
    this.repository = repository;
    this.getSettings = getSettings;
  }
  get folder() {
    const configured = this.getSettings().attachmentFolder.trim();
    return configured ? normalizeMemoFolder(configured) : (0, import_obsidian3.normalizePath)(`${this.repository.folder}/_attachments`);
  }
  async addExternalAttachments(memoFile) {
    const files = await this.pickExternalAttachments();
    return this.addExternalFiles(memoFile, files);
  }
  pickExternalAttachments() {
    return this.pickExternalFiles();
  }
  async addExternalFiles(memoFile, files) {
    if (files.length === 0) {
      return 0;
    }
    await this.ensureFolder(this.folder);
    let added = 0;
    for (const file of files) {
      const path = this.uniqueAttachmentPath(file.name);
      await this.app.vault.createBinary(path, await file.arrayBuffer());
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
    if (!(file instanceof import_obsidian3.TFile)) {
      new import_obsidian3.Notice(`\u9644\u4EF6\u4E0D\u5B58\u5728\uFF1A${attachment.name}`);
      return;
    }
    await this.app.workspace.getLeaf(true).openFile(file);
  }
  getResourceUrl(attachment) {
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    return file instanceof import_obsidian3.TFile ? this.app.vault.getResourcePath(file) : void 0;
  }
  async downloadAttachment(attachment) {
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    if (!(file instanceof import_obsidian3.TFile)) {
      new import_obsidian3.Notice(`\u9644\u4EF6\u4E0D\u5B58\u5728\uFF1A${attachment.name}`);
      return;
    }
    const data = await this.app.vault.readBinary(file);
    const url = URL.createObjectURL(new Blob([data], { type: attachment.mime }));
    const anchor = this.app.workspace.containerEl.createEl("a");
    anchor.href = url;
    anchor.download = attachment.name;
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async deleteManagedAttachment(attachment) {
    if (!attachment.managed) return;
    const file = this.app.vault.getAbstractFileByPath(attachment.path);
    if (file instanceof import_obsidian3.TFile) {
      await this.app.fileManager.trashFile(file);
    }
  }
  async isAttachmentReferenced(path, excludingMemoPath) {
    const memos = await this.repository.getMemos();
    return memos.some((memo) => memo.file.path !== excludingMemoPath && memo.attachments.some((attachment) => attachment.path === path));
  }
  pickExternalFiles() {
    return new Promise((resolve) => {
      const input = this.app.workspace.containerEl.createEl("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "*/*";
      let resolved = false;
      const finish = (files) => {
        if (resolved) return;
        resolved = true;
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
      const candidate = (0, import_obsidian3.normalizePath)(`${this.folder}/${prefix}-${stem}${suffix === 0 ? "" : `-${suffix}`}${extension}`);
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
      current = (0, import_obsidian3.normalizePath)(current ? `${current}/${segment}` : segment);
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof import_obsidian3.TFolder) continue;
      if (existing) throw new Error(`\u9644\u4EF6\u76EE\u5F55\u88AB\u6587\u4EF6\u5360\u7528\uFF1A${current}`);
      await this.app.vault.createFolder(current);
    }
  }
};
var VaultFileSuggestModal = class extends import_obsidian3.FuzzySuggestModal {
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
  const sanitized = name.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
  return sanitized.slice(0, 120) || "attachment";
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
    zip: "application/zip",
    txt: "text/plain",
    md: "text/markdown"
  };
  return (_c = mimeByExtension[extension]) != null ? _c : "application/octet-stream";
}

// src/settings.ts
var import_obsidian4 = require("obsidian");
var ObsidianMemosSettingTab = class extends import_obsidian4.PluginSettingTab {
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
      }
    ];
  }
  display() {
    this.containerEl.empty();
    new import_obsidian4.Setting(this.containerEl).setName("Memo \u4FDD\u5B58\u6587\u4EF6\u5939").setDesc("\u65B0 Memo \u5C06\u5199\u5165\u6B64\u76EE\u5F55\u3002\u4FEE\u6539\u8DEF\u5F84\u4E0D\u4F1A\u79FB\u52A8\u6216\u5220\u9664\u65E7\u76EE\u5F55\u4E2D\u7684\u6587\u4EF6\u3002").addText((text) => {
      text.setPlaceholder("Memos").setValue(this.plugin.settings.memoFolder);
      text.onChange(async (value) => {
        this.plugin.settings.memoFolder = normalizeMemoFolder(value);
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    new import_obsidian4.Setting(this.containerEl).setName("\u9644\u4EF6\u4FDD\u5B58\u4F4D\u7F6E").setDesc("\u7559\u7A7A\u65F6\u4F7F\u7528 <Memo \u4FDD\u5B58\u6587\u4EF6\u5939>/_attachments\u3002\u8BE5\u76EE\u5F55\u4F4D\u4E8E Vault \u5185\uFF0C\u53EF\u540C\u6B65\u5E76\u652F\u6301\u6807\u51C6 Obsidian \u94FE\u63A5\u3002").addText((text) => {
      text.setPlaceholder("Memos/_attachments").setValue(this.plugin.settings.attachmentFolder);
      text.onChange(async (value) => {
        this.plugin.settings.attachmentFolder = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian4.Setting(this.containerEl).setName("\u65B0\u5EFA Memo \u9ED8\u8BA4\u7C7B\u578B").setDesc("Composer \u6253\u5F00\u65F6\u9ED8\u8BA4\u521B\u5EFA\u666E\u901A Memo \u6216\u4EFB\u52A1\u3002").addDropdown((dropdown) => {
      dropdown.addOption("note", "\u666E\u901A Memo").addOption("task", "\u4EFB\u52A1").setValue(this.plugin.settings.defaultMemoType).onChange(async (value) => {
        this.plugin.settings.defaultMemoType = value === "task" ? "task" : "note";
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    new import_obsidian4.Setting(this.containerEl).setName("\u7F29\u7565\u5217\u8868\u4F4D\u7F6E").setDesc("Apple Notes \u98CE\u683C\u7684 Memo \u5217\u8868\u663E\u793A\u5728\u8BE6\u60C5\u533A\u5DE6\u4FA7\u6216\u53F3\u4FA7\u3002").addDropdown((dropdown) => {
      dropdown.addOption("right", "\u53F3\u4FA7\uFF08\u9ED8\u8BA4\uFF09").addOption("left", "\u5DE6\u4FA7").setValue(this.plugin.settings.listPanePosition).onChange(async (value) => {
        this.plugin.settings.listPanePosition = value === "left" ? "left" : "right";
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    new import_obsidian4.Setting(this.containerEl).setName("\u5217\u8868\u9ED8\u8BA4\u5C55\u5F00").setDesc("\u63A7\u5236 Memos View \u9996\u6B21\u6253\u5F00\u65F6\u662F\u5426\u663E\u793A\u7F29\u7565\u5217\u8868\u3002").addToggle((toggle) => {
      toggle.setValue(!this.plugin.settings.listPaneCollapsed).onChange(async (expanded) => {
        this.plugin.settings.listPaneCollapsed = !expanded;
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    new import_obsidian4.Setting(this.containerEl).setName("\u7F29\u7565\u5217\u8868\u5BBD\u5EA6").setDesc("\u684C\u9762\u7AEF\u5217\u8868\u680F\u5BBD\u5EA6\uFF0C\u8303\u56F4 240\u2013420 px\u3002").addSlider((slider) => {
      slider.setLimits(240, 420, 10).setValue(this.plugin.settings.listPaneWidth).onChange(async (value) => {
        this.plugin.settings.listPaneWidth = Math.round(value);
        await this.plugin.saveSettings();
        this.plugin.scheduleViewRefresh();
      });
    });
    this.containerEl.createEl("p", {
      cls: "setting-item-description",
      text: `\u5F53\u524D\u8BFB\u53D6\u76EE\u5F55\uFF1A${this.plugin.repository.folder}`
    });
  }
};

// src/views/MemosView.ts
var import_obsidian10 = require("obsidian");

// src/components/MemoCard.ts
var import_obsidian8 = require("obsidian");

// src/components/MemoAttachmentList.ts
var import_obsidian5 = require("obsidian");
var MemoAttachmentList = class {
  constructor(owner, attachmentService, onRemove) {
    this.owner = owner;
    this.attachmentService = attachmentService;
    this.onRemove = onRemove;
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
      item.createEl("video", { cls: "obsidian-memos-attachment__media", attr: { src: url, preload: "metadata" } });
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
      const menu = new import_obsidian5.Menu();
      menu.addItem((entry) => entry.setTitle("\u4E0B\u8F7D").setIcon("download").onClick(() => void this.attachmentService.downloadAttachment(attachment)));
      menu.addItem((entry) => entry.setTitle("\u5220\u9664").setIcon("trash-2").onClick(() => void this.onRemove(attachment)));
      menu.showAtMouseEvent(event);
    });
  }
};
function formatFileSize(size) {
  if (size === void 0) return "\u6587\u4EF6";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

// src/components/MemoDeleteModal.ts
var import_obsidian6 = require("obsidian");
var MemoDeleteModal = class extends import_obsidian6.Modal {
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
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer = window.setTimeout(hide, 140);
  };
  const show = () => {
    cancelHide();
    popup.empty();
    const suggestions = options.getSuggestions().slice(0, 3);
    if (suggestions.length === 0) return;
    popup.createDiv({ cls: "obsidian-memos-tag-control__label", text: "\u5E38\u7528\u6807\u7B7E" });
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
  };
  owner.registerDomEvent(button, "click", (event) => {
    event.stopPropagation();
    options.onSelect("#");
  });
  owner.registerDomEvent(button, "mousedown", (event) => event.preventDefault());
  owner.registerDomEvent(wrapper, "mouseenter", show);
  owner.registerDomEvent(wrapper, "mouseleave", scheduleHide);
  owner.registerDomEvent(popup, "mouseenter", cancelHide);
  owner.registerDomEvent(popup, "mouseleave", scheduleHide);
  return button;
}

// src/components/TextEditingMenu.ts
var import_obsidian7 = require("obsidian");
function openTextEditingMenu(control, event) {
  var _a, _b;
  event.preventDefault();
  event.stopPropagation();
  const start = (_a = control.selectionStart) != null ? _a : 0;
  const end = (_b = control.selectionEnd) != null ? _b : start;
  const hasSelection = end > start;
  const menu = new import_obsidian7.Menu();
  menu.addItem((item) => item.setTitle("\u590D\u5236").setIcon("copy").setDisabled(!hasSelection).onClick(() => void copySelection(control)));
  menu.addItem((item) => item.setTitle("\u7C98\u8D34").setIcon("clipboard-paste").onClick(() => void pasteSelection(control)));
  menu.addItem((item) => item.setTitle("\u526A\u5207").setIcon("scissors").setDisabled(!hasSelection).onClick(() => void cutSelection(control)));
  menu.showAtMouseEvent(event);
}
async function copySelection(control) {
  var _a, _b;
  const start = (_a = control.selectionStart) != null ? _a : 0;
  const end = (_b = control.selectionEnd) != null ? _b : start;
  if (end <= start) return;
  try {
    await navigator.clipboard.writeText(control.value.slice(start, end));
  } catch (error) {
    new import_obsidian7.Notice(`\u590D\u5236\u5931\u8D25\uFF1A${errorMessage(error)}`);
  }
}
async function pasteSelection(control) {
  var _a, _b;
  try {
    const text = await navigator.clipboard.readText();
    const start = (_a = control.selectionStart) != null ? _a : control.value.length;
    const end = (_b = control.selectionEnd) != null ? _b : start;
    control.setRangeText(text, start, end, "end");
    control.dispatchEvent(new Event("input"));
    control.focus();
  } catch (error) {
    new import_obsidian7.Notice(`\u7C98\u8D34\u5931\u8D25\uFF1A${errorMessage(error)}`);
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
    new import_obsidian7.Notice(`\u526A\u5207\u5931\u8D25\uFF1A${errorMessage(error)}`);
  }
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
    this.article = container.createEl("article", {
      cls: `obsidian-memos-card${memo.type === "task" ? " is-task" : ""}${memo.completed ? " is-completed" : ""}`
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
    if (memo.pinned) {
      const pinned = metadata.createSpan({ cls: "obsidian-memos-card__pinned", attr: { "aria-label": "\u5DF2\u7F6E\u9876", title: "\u5DF2\u7F6E\u9876" } });
      (0, import_obsidian8.setIcon)(pinned, "pin");
    }
    const actions = header.createDiv({ cls: "obsidian-memos-card__toolbar" });
    const pinButton = createIconButton(actions, "pin", memo.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876");
    createTagSuggestionControl(owner, actions, {
      className: "is-card",
      getSuggestions: () => {
        var _a, _b, _c;
        return (_c = (_b = (_a = this.options).getPopularTags) == null ? void 0 : _b.call(_a)) != null ? _c : [];
      },
      onSelect: (tag) => void this.addTag(tag)
    });
    const deleteButton = createIconButton(actions, "trash-2", "\u5220\u9664 Memo");
    const readingCloseButton = createIconButton(actions, "x", "\u9000\u51FA\u9605\u8BFB\u6A21\u5F0F");
    readingCloseButton.addClass("obsidian-memos-card__reading-close");
    owner.registerDomEvent(pinButton, "click", () => void this.togglePinned());
    owner.registerDomEvent(deleteButton, "click", () => void this.deleteMemo());
    owner.registerDomEvent(readingCloseButton, "click", () => this.exitReadingMode());
    owner.registerDomEvent(this.article, "contextmenu", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        openTextEditingMenu(target, event);
        return;
      }
      if (this.article.hasClass("is-reading-mode") && this.hasReadingSelection(event)) {
        event.preventDefault();
        this.openReadingSelectionMenu(event);
        return;
      }
      event.preventDefault();
      this.openMenu(event);
    });
    owner.registerDomEvent(this.article, "click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("a, button, input, textarea, select")) return;
      if (event.detail === 2) {
        void this.startEditing();
      } else if (event.detail >= 3) {
        event.preventDefault();
        this.expand();
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
    var _a, _b;
    if (this.editSaveTimer !== void 0) window.clearTimeout(this.editSaveTimer);
    (_b = (_a = this.options).onEditingChange) == null ? void 0 : _b.call(_a, false);
    this.unloadMarkdownChild();
  }
  openMenu(event) {
    const menu = new import_obsidian8.Menu();
    menu.addItem((item) => item.setTitle(this.memo.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876").setIcon("pin").onClick(() => void this.togglePinned()));
    menu.addItem((item) => item.setTitle("#").setIcon("hash").onClick(() => void this.addTag("#")));
    menu.addItem((item) => item.setTitle("\u5220\u9664").setIcon("trash-2").onClick(() => void this.deleteMemo()));
    menu.showAtMouseEvent(event);
  }
  async renderDisplay() {
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
      this.markdownChild = new import_obsidian8.MarkdownRenderChild(content);
      this.owner.addChild(this.markdownChild);
      try {
        await import_obsidian8.MarkdownRenderer.render(this.app, parts.body, content, this.memo.file.path, this.markdownChild);
        this.highlightInlineTags(content);
      } catch (error) {
        console.warn(`[Markdown Memos] Markdown \u6E32\u67D3\u5931\u8D25\uFF1A${this.memo.file.path}`, error);
        content.empty();
        content.createEl("pre", { text: parts.body });
      }
    }
    this.renderDetectedLinks(this.display, this.memo.content);
    new MemoAttachmentList(this.owner, this.options.attachmentService, (attachment) => this.removeAttachment(attachment)).render(
      this.display,
      this.memo.attachments
    );
  }
  async startEditing(tagToInsert) {
    var _a, _b;
    if (this.article.hasClass("is-editing")) {
      if (tagToInsert) this.insertTagIntoEditor(tagToInsert);
      return;
    }
    this.unloadMarkdownChild();
    this.display.empty();
    this.article.addClass("is-editing");
    (_b = (_a = this.options).onEditingChange) == null ? void 0 : _b.call(_a, true);
    this.lastPersistedContent = this.memo.content;
    const parts = splitMemoContent(this.memo.content);
    const editor = this.display.createDiv({ cls: "obsidian-memos-card__editor-shell" });
    const titleField = editor.createDiv({ cls: "obsidian-memos-card__editor-field is-title" });
    const titleMirror = titleField.createDiv({ cls: "obsidian-memos-card__editor-mirror" });
    const titleInput = titleField.createEl("textarea", {
      cls: "obsidian-memos-card__title-editor",
      attr: { rows: "1", "aria-label": "\u7F16\u8F91 Memo \u6807\u9898", placeholder: "" }
    });
    titleInput.value = parts.title;
    if (tagToInsert) {
      titleInput.value += `${titleInput.value && !/\s$/.test(titleInput.value) ? " " : ""}${tagToInsert}`;
    }
    const bodyField = editor.createDiv({ cls: "obsidian-memos-card__editor-field is-body" });
    const bodyMirror = bodyField.createDiv({ cls: "obsidian-memos-card__editor-mirror" });
    const textarea = bodyField.createEl("textarea", {
      cls: "obsidian-memos-card__editor",
      attr: { rows: "8", "aria-label": "\u7F16\u8F91 Memo \u5185\u5BB9", placeholder: "" }
    });
    textarea.value = parts.body;
    this.renderEditorMirror(titleMirror, titleInput.value);
    this.renderEditorMirror(bodyMirror, textarea.value);
    this.editorTitleInput = titleInput;
    this.editorTextarea = textarea;
    this.editorTagTarget = titleInput;
    const links = this.display.createDiv({ cls: "obsidian-memos-card__editor-links" });
    this.display.createDiv({ cls: "obsidian-memos-card__autosave-hint", text: "\u81EA\u52A8\u4FDD\u5B58" });
    const updateDraft = () => {
      const content = joinMemoContent(titleInput.value, textarea.value);
      this.scheduleAutoSave(content);
      titleInput.setCssProps({ height: "auto" });
      titleInput.setCssProps({ height: `${titleInput.scrollHeight}px` });
      this.renderEditorMirror(titleMirror, titleInput.value);
      this.renderEditorMirror(bodyMirror, textarea.value);
      links.empty();
      this.renderDetectedLinks(links, content);
    };
    titleInput.addEventListener("input", updateDraft);
    textarea.addEventListener("input", updateDraft);
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
        if (this.article.contains(document.activeElement)) return;
        void this.finishEditing(joinMemoContent(titleInput.value, textarea.value));
      }, 0);
    });
    this.renderDetectedLinks(links, this.memo.content);
    titleInput.setCssProps({ height: "auto" });
    titleInput.setCssProps({ height: `${titleInput.scrollHeight}px` });
    const initialTarget = !tagToInsert && !parts.title && parts.body ? textarea : titleInput;
    initialTarget.focus();
    initialTarget.setSelectionRange(initialTarget.value.length, initialTarget.value.length);
  }
  enterReadingMode() {
    this.article.addClass("is-reading-mode");
    this.article.focus({ preventScroll: true });
  }
  exitReadingMode() {
    this.article.removeClass("is-reading-mode");
  }
  hasReadingSelection(event) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("a")) return true;
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && selection.toString().trim() && selection.anchorNode && this.article.contains(selection.anchorNode));
  }
  openReadingSelectionMenu(event) {
    var _a, _b;
    const target = event.target instanceof HTMLElement ? event.target : void 0;
    const link = target == null ? void 0 : target.closest("a");
    const selectedText = (_b = (_a = window.getSelection()) == null ? void 0 : _a.toString().trim()) != null ? _b : "";
    const text = selectedText || (link == null ? void 0 : link.href) || "";
    const menu = new import_obsidian8.Menu();
    menu.addItem((item) => item.setTitle("\u590D\u5236").setIcon("copy").onClick(() => void this.copyText(text)));
    menu.addItem((item) => item.setTitle("\u7C98\u8D34").setIcon("clipboard-paste").setDisabled(true));
    menu.addItem((item) => item.setTitle("\u526A\u5207").setIcon("scissors").setDisabled(true));
    menu.showAtMouseEvent(event);
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
      new import_obsidian8.Notice(`\u81EA\u52A8\u4FDD\u5B58\u5931\u8D25\uFF1A${errorMessage(error)}`);
    });
    return this.editSaveQueue;
  }
  async finishEditing(content) {
    var _a, _b;
    if (!this.article.hasClass("is-editing")) return;
    this.editDraft = content;
    await this.flushAutoSave();
    (_b = (_a = this.options).onEditingChange) == null ? void 0 : _b.call(_a, false);
    await this.options.onChanged();
  }
  renderDetectedLinks(container, content) {
    const urls = extractExternalUrls(content);
    if (urls.length === 0) return;
    const links = container.createDiv({ cls: "obsidian-memos-detected-links", attr: { "aria-label": "\u5185\u5BB9\u4E2D\u7684\u7F51\u5740" } });
    for (const url of urls) {
      links.createEl("a", { cls: "external-link", text: url, href: url, attr: { target: "_blank", rel: "noopener noreferrer" } });
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
      new import_obsidian8.Notice(attachment.managed ? "\u9644\u4EF6\u5DF2\u79FB\u5230\u7CFB\u7EDF\u5E9F\u7EB8\u7BD3" : "\u5DF2\u79FB\u9664\u9644\u4EF6\u94FE\u63A5\uFF1B\u539F\u6587\u4EF6\u4FDD\u7559");
      await this.options.onChanged();
    } catch (error) {
      new import_obsidian8.Notice(`\u79FB\u9664\u9644\u4EF6\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      new import_obsidian8.Notice("\u5DF2\u590D\u5236");
    } catch (error) {
      new import_obsidian8.Notice(`\u590D\u5236\u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  async deleteMemo() {
    if (!await confirmMemoDeletion(this.app, this.memo)) return;
    try {
      await this.repository.deleteMemo(this.memo.file);
      await this.options.onChanged();
    } catch (error) {
      console.error(`[Markdown Memos] \u5220\u9664\u5931\u8D25\uFF1A${this.memo.file.path}`, error);
      new import_obsidian8.Notice(`\u5220\u9664 Memo \u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
  async runAction(label, action) {
    try {
      await action();
      await this.options.onChanged();
    } catch (error) {
      console.error(`[Markdown Memos] ${label}`, error);
      new import_obsidian8.Notice(`${label}\uFF1A${errorMessage(error)}`);
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
  (0, import_obsidian8.setIcon)(button, icon);
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
var import_obsidian9 = require("obsidian");
var MemoComposer = class {
  constructor(owner, container, repository, onCreated, options = {}) {
    this.repository = repository;
    this.onCreated = onCreated;
    this.pendingAttachments = [];
    this.submitting = false;
    var _a;
    this.container = container;
    this.memoType = (_a = options.defaultType) != null ? _a : "note";
    this.attachmentService = options.attachmentService;
    const composer = container.createDiv({ cls: "obsidian-memos-composer" });
    const titleField = composer.createDiv({ cls: "obsidian-memos-composer__field is-title" });
    this.titleMirror = titleField.createDiv({ cls: "obsidian-memos-composer__mirror" });
    this.titleInput = titleField.createEl("input", {
      cls: "obsidian-memos-composer__title",
      attr: { type: "text", placeholder: "", "aria-label": "Memo \u6807\u9898" }
    });
    const bodyField = composer.createDiv({ cls: "obsidian-memos-composer__field is-body" });
    this.bodyMirror = bodyField.createDiv({ cls: "obsidian-memos-composer__mirror" });
    this.textarea = bodyField.createEl("textarea", {
      cls: "obsidian-memos-composer__input",
      attr: {
        placeholder: "",
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
        var _a2, _b;
        return (_b = (_a2 = options.getPopularTags) == null ? void 0 : _a2.call(options)) != null ? _b : [];
      },
      onSelect: (tag) => this.insertTag(tag)
    });
    const attachmentButton = tools.createEl("button", {
      cls: "clickable-icon",
      text: "\u{1F4CE}",
      attr: { type: "button", "aria-label": "\u7ED9\u5F53\u524D Memo \u6DFB\u52A0\u9644\u4EF6" }
    });
    const linkButton = tools.createEl("button", {
      cls: "clickable-icon",
      text: "\u{1F517}",
      attr: { type: "button", "aria-label": "\u7ED9\u5F53\u524D Memo \u94FE\u63A5 Vault \u6587\u4EF6" }
    });
    this.taskButton = tools.createEl("button", { cls: "obsidian-memos-composer__task", attr: { type: "button" } });
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
    });
    owner.registerDomEvent(this.textarea, "focus", () => {
      this.tagTarget = this.textarea;
    });
    owner.registerDomEvent(this.titleInput, "contextmenu", (event) => openTextEditingMenu(this.titleInput, event));
    owner.registerDomEvent(this.textarea, "contextmenu", (event) => openTextEditingMenu(this.textarea, event));
    owner.registerDomEvent(this.textarea, "scroll", () => {
      this.bodyMirror.scrollTop = this.textarea.scrollTop;
      this.bodyMirror.scrollLeft = this.textarea.scrollLeft;
    });
    owner.registerDomEvent(attachmentButton, "click", () => void this.queueExternalAttachments());
    owner.registerDomEvent(linkButton, "click", () => void this.queueVaultAttachment());
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
      if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        this.textarea.focus();
        this.textarea.setSelectionRange(0, 0);
      }
    });
    owner.registerDomEvent(this.textarea, "keydown", submitFromKeyboard);
    owner.registerDomEvent(this.textarea, "keydown", (event) => {
      var _a2;
      if (event.defaultPrevented || event.key !== "ArrowUp") return;
      const caret = (_a2 = this.textarea.selectionStart) != null ? _a2 : 0;
      if (caret > 0 && this.textarea.value.slice(0, caret).includes("\n")) return;
      event.preventDefault();
      this.titleInput.focus();
      this.titleInput.setSelectionRange(this.titleInput.value.length, this.titleInput.value.length);
    });
    owner.registerDomEvent(this.submitButton, "click", () => void this.submit());
    this.updateTaskButton();
    this.renderMirrors();
    this.updateButtonState();
  }
  focus() {
    this.titleInput.focus();
  }
  async submit() {
    const title = this.titleInput.value;
    const content = joinMemoContent(title, this.textarea.value);
    if (!content.trim() || this.submitting) {
      return;
    }
    this.setSubmitting(true);
    try {
      let memo = await this.repository.createMemo(content, { type: this.memoType });
      await this.persistPendingAttachments(memo);
      memo = await this.repository.getMemo(memo.file);
      this.titleInput.value = "";
      this.textarea.value = "";
      this.clearPendingAttachments();
      this.renderMirrors();
      this.updateButtonState();
      await this.onCreated(memo);
      this.titleInput.focus();
    } catch (error) {
      console.error("[Markdown Memos] \u521B\u5EFA Memo \u5931\u8D25\u3002", error);
      new import_obsidian9.Notice(`\u521B\u5EFA Memo \u5931\u8D25\uFF1A${errorMessage(error)}`);
    } finally {
      this.setSubmitting(false);
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
    this.submitButton.disabled = this.submitting || !this.titleInput.value.trim() && !this.textarea.value.trim();
  }
  updateTaskButton() {
    const isTask = this.memoType === "task";
    this.taskButton.toggleClass("is-active", isTask);
    this.taskButton.setText(isTask ? "\u2713 \u4EFB\u52A1" : "\u25CB \u4EFB\u52A1");
    this.taskButton.setAttr("aria-pressed", String(isTask));
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
  async queueExternalAttachments() {
    if (!this.attachmentService) return;
    const files = await this.attachmentService.pickExternalAttachments();
    for (const file of files) {
      this.pendingAttachments.push({
        kind: "external",
        file,
        name: file.name,
        mime: file.type || inferMime(file.name),
        size: file.size,
        previewUrl: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : void 0
      });
    }
    this.renderPendingAttachments();
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
        item.createEl("video", { attr: { src: url, preload: "metadata" } });
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
    var _a, _b;
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
    const url = (_b = attachment.previewUrl) != null ? _b : URL.createObjectURL(attachment.file);
    window.open(url, "_blank");
    if (!attachment.previewUrl) window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async downloadPendingAttachment(attachment) {
    var _a;
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
    const url = URL.createObjectURL(attachment.file);
    const anchor = this.container.createEl("a");
    anchor.href = url;
    anchor.download = attachment.name;
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
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
    const menu = new import_obsidian9.Menu();
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
var MemoList = class {
  constructor(owner, container, callbacks) {
    this.callbacks = callbacks;
    this.memos = [];
    this.listEl = container.createDiv({ cls: "obsidian-memos-list-pane__items" });
    owner.registerDomEvent(this.listEl, "click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("[data-memo-path]") : null;
      const path = target == null ? void 0 : target.dataset.memoPath;
      if (!path) {
        return;
      }
      const memo = this.memos.find((item) => item.file.path === path);
      if (memo) {
        const taskToggle = event.target instanceof HTMLElement ? event.target.closest("[data-task-toggle]") : null;
        if (taskToggle) {
          this.callbacks.onToggleTask(memo);
        } else {
          this.callbacks.onSelect(memo);
        }
      }
    });
    owner.registerDomEvent(this.listEl, "contextmenu", (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("[data-memo-path]") : null;
      const path = target == null ? void 0 : target.dataset.memoPath;
      const memo = path ? this.memos.find((item) => item.file.path === path) : void 0;
      if (!memo) return;
      event.preventDefault();
      this.callbacks.onContextMenu(memo, event);
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
  render() {
    this.listEl.empty();
    if (this.memos.length === 0) {
      this.listEl.createDiv({ cls: "obsidian-memos-list-pane__empty", text: "\u6682\u65E0 Memo" });
      return;
    }
    let previousGroup = "";
    for (const memo of this.memos) {
      const group = getDateGroup(memo);
      if (group !== previousGroup) {
        this.listEl.createDiv({ cls: "obsidian-memos-list-group", text: group });
        previousGroup = group;
      }
      const item = this.listEl.createDiv({
        cls: `obsidian-memos-list-item${memo.file.path === this.selectedPath ? " is-selected" : ""}`,
        attr: { "data-memo-path": memo.file.path, role: "button", tabindex: "0" }
      });
      const titleRow = item.createDiv({ cls: "obsidian-memos-list-item__title-row" });
      if (memo.pinned) {
        titleRow.createSpan({ cls: "obsidian-memos-list-item__pin", text: "\u{1F4CC}", attr: { "aria-label": "\u5DF2\u7F6E\u9876" } });
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

// src/views/MemosView.ts
var MEMOS_VIEW_TYPE = "obsidian-memos-view";
var MIN_LIST_WIDTH = 240;
var MAX_LIST_WIDTH = 420;
var MemosView = class extends import_obsidian10.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.detailCards = [];
    this.allMemos = [];
    this.memos = [];
    this.searchQuery = "";
    this.sortOption = "modified-desc";
    this.mobileDetail = false;
    this.refreshSequence = 0;
    this.isDraggingDivider = false;
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
    this.contentEl.empty();
    this.contentEl.addClass("obsidian-memos-view");
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
    (0, import_obsidian10.setIcon)(sidebarButton, "sidebar");
    this.registerDomEvent(sidebarButton, "click", () => void this.toggleListPane());
    const title = toolbar.createDiv({ cls: "obsidian-memos-toolbar__title" });
    title.createEl("strong", { text: "Markdown Memos" });
    this.folderLabel = title.createSpan({ cls: "obsidian-memos-toolbar__folder", text: this.plugin.repository.folder });
    const toolbarActions = toolbar.createDiv({ cls: "obsidian-memos-toolbar__actions" });
    const searchInput = toolbarActions.createEl("input", {
      cls: "obsidian-memos-toolbar__search",
      attr: { type: "search", placeholder: "\u641C\u7D22 Memos", "aria-label": "\u641C\u7D22 Memos" }
    });
    const filterSelect = toolbarActions.createEl("select", { cls: "dropdown obsidian-memos-toolbar__select", attr: { "aria-label": "Memo \u7C7B\u578B\u7B5B\u9009" } });
    addSelectOption(filterSelect, "all", "\u5168\u90E8");
    addSelectOption(filterSelect, "note", "\u666E\u901A Memo");
    addSelectOption(filterSelect, "task-open", "\u672A\u5B8C\u6210\u4EFB\u52A1");
    addSelectOption(filterSelect, "task-completed", "\u5DF2\u5B8C\u6210\u4EFB\u52A1");
    addSelectOption(filterSelect, "archived", "\u5DF2\u5F52\u6863");
    filterSelect.value = this.plugin.settings.selectedFilter;
    this.tagSelect = toolbarActions.createEl("select", { cls: "dropdown obsidian-memos-toolbar__select", attr: { "aria-label": "\u6807\u7B7E\u7B5B\u9009" } });
    this.registerDomEvent(searchInput, "input", () => {
      this.searchQuery = searchInput.value;
      void this.applyCurrentFilters();
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
    const newButton = toolbarActions.createEl("button", { cls: "mod-cta", text: "+ \u65B0\u5EFA Memo", attr: { type: "button" } });
    this.registerDomEvent(newButton, "click", () => {
      this.mobileDetail = true;
      this.updateLayoutState();
      this.composerFocus();
    });
    this.splitEl = page.createDiv({ cls: "obsidian-memos-split" });
    const listPaneEl = this.splitEl.createDiv({ cls: "obsidian-memos-list-pane" });
    const listHeader = listPaneEl.createDiv({ cls: "obsidian-memos-list-pane__header" });
    const listTopButton = listHeader.createEl("button", {
      cls: "clickable-icon obsidian-memos-pane-top",
      attr: { type: "button", "aria-label": "\u56DE\u5230 Memo \u5217\u8868\u9876\u90E8", title: "\u56DE\u5230\u5217\u8868\u9876\u90E8" }
    });
    (0, import_obsidian10.setIcon)(listTopButton, "arrow-up-to-line");
    this.listCountLabel = listHeader.createSpan({ cls: "obsidian-memos-list-pane__count", text: "0" });
    this.sortSelect = listHeader.createEl("select", {
      cls: "dropdown obsidian-memos-list-pane__sort",
      attr: { "aria-label": "Memo \u6392\u5E8F" }
    });
    addSelectOption(this.sortSelect, "modified-desc", "\u65F6\u95F4\u2193");
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
      onSelect: (memo) => this.selectMemo(memo),
      onToggleTask: (memo) => void this.toggleTaskFromList(memo),
      onContextMenu: (memo, event) => this.openListContextMenu(memo, event)
    });
    const divider = this.splitEl.createDiv({ cls: "obsidian-memos-divider", attr: { role: "separator", "aria-label": "\u8C03\u6574\u5217\u8868\u5BBD\u5EA6" } });
    this.registerDomEvent(divider, "pointerdown", (event) => this.startDividerDrag(event));
    const detailPaneEl = this.splitEl.createDiv({ cls: "obsidian-memos-detail-pane" });
    this.detailContentEl = detailPaneEl.createDiv({ cls: "obsidian-memos-detail-pane__content" });
    const detailToolbar = this.detailContentEl.createDiv({ cls: "obsidian-memos-detail-pane__toolbar" });
    const mobileBackButton = detailToolbar.createEl("button", {
      cls: "clickable-icon obsidian-memos-mobile-back",
      attr: { type: "button", "aria-label": "\u8FD4\u56DE Memo \u5217\u8868", title: "\u8FD4\u56DE\u5217\u8868" }
    });
    (0, import_obsidian10.setIcon)(mobileBackButton, "arrow-left");
    this.registerDomEvent(mobileBackButton, "click", () => {
      this.mobileDetail = false;
      this.updateLayoutState();
    });
    const composerHost = this.detailContentEl.createDiv({ cls: "obsidian-memos-composer-host" });
    new MemoComposer(
      this,
      composerHost,
      this.plugin.repository,
      async (memo) => {
        this.mobileDetail = true;
        await this.refresh(memo.file.path);
      },
      {
        defaultType: this.plugin.settings.defaultMemoType,
        attachmentService: this.plugin.attachmentService,
        getPopularTags: () => this.getPopularTags(3)
      }
    );
    this.detailContentEl.createDiv({ cls: "obsidian-memos-detail-card-host" });
    this.registerDomEvent(this.contentEl, "keydown", (event) => this.handleKeyboard(event));
    this.registerDomEvent(window, "resize", () => this.updateLayoutState());
    this.registerDomEvent(window, "pointermove", (event) => this.moveDivider(event));
    this.registerDomEvent(window, "pointerup", () => this.stopDividerDrag());
    this.updateLayoutState();
  }
  async renderDetail(sequence) {
    var _a;
    const host = (_a = this.detailContentEl) == null ? void 0 : _a.querySelector(".obsidian-memos-detail-card-host");
    if (!host || sequence !== this.refreshSequence) {
      return;
    }
    this.destroyDetailCards();
    host.empty();
    if (this.memos.length === 0) {
      const empty = host.createDiv({ cls: "obsidian-memos-detail-empty" });
      empty.createEl("h2", { text: "\u6682\u65E0 Memo" });
      empty.createEl("p", { text: "\u70B9\u51FB\u201C+ \u65B0\u5EFA Memo\u201D\u5F00\u59CB\u8BB0\u5F55\u3002" });
      return;
    }
    for (const memo of this.memos) {
      if (sequence !== this.refreshSequence) return;
      const item = host.createDiv({ cls: `obsidian-memos-feed-item${memo.file.path === this.selectedPath ? " is-selected" : ""}` });
      item.dataset.memoPath = memo.file.path;
      const card = new MemoCard(this.app, this, item, this.plugin.repository, memo, {
        onChanged: () => this.refresh(memo.file.path),
        attachmentService: this.plugin.attachmentService,
        onEditingChange: (editing) => {
          this.editingPath = editing ? memo.file.path : void 0;
        },
        getPopularTags: () => this.getPopularTags(3)
      });
      this.detailCards.push(card);
      await card.render();
    }
  }
  selectMemo(memo) {
    var _a;
    this.selectedPath = memo.file.path;
    this.mobileDetail = true;
    (_a = this.memoList) == null ? void 0 : _a.setMemos(this.memos, this.selectedPath);
    this.updateLayoutState();
    this.updateSelectedFeedItem();
    this.scrollSelectedIntoView(true);
  }
  async applyCurrentFilters(preferredPath, sequence = this.refreshSequence) {
    var _a, _b, _c;
    const query = this.searchQuery.trim().toLocaleLowerCase();
    const selectedTag = this.plugin.settings.selectedTag;
    const selectedFilter = this.plugin.settings.selectedFilter;
    this.memos = this.allMemos.filter((memo) => {
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
    if (!this.selectedPath && this.mobileDetail) {
      this.mobileDetail = false;
    }
    (_b = this.listCountLabel) == null ? void 0 : _b.setText(this.memos.length === this.allMemos.length ? String(this.memos.length) : `${this.memos.length}/${this.allMemos.length}`);
    (_c = this.memoList) == null ? void 0 : _c.setMemos(this.memos, this.selectedPath);
    this.updateLayoutState();
    await this.renderDetail(sequence);
  }
  updateTagOptions() {
    var _a;
    if (!this.tagSelect) {
      return;
    }
    const tagFrequency = this.getTagFrequency();
    const tags = Array.from(tagFrequency.keys()).sort((left, right) => {
      var _a2, _b;
      const countDifference = ((_a2 = tagFrequency.get(right)) != null ? _a2 : 0) - ((_b = tagFrequency.get(left)) != null ? _b : 0);
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
  }
  getTagFrequency() {
    var _a, _b;
    const frequency = /* @__PURE__ */ new Map();
    for (const memo of this.allMemos) {
      const occurrences = extractMemoTagOccurrences(memo.content);
      for (const tag of occurrences) frequency.set(tag, ((_a = frequency.get(tag)) != null ? _a : 0) + 1);
      for (const tag of memo.tags) {
        if (!occurrences.includes(tag)) frequency.set(tag, ((_b = frequency.get(tag)) != null ? _b : 0) + 1);
      }
    }
    return frequency;
  }
  getPopularTags(limit) {
    const frequency = this.getTagFrequency();
    return Array.from(frequency.keys()).sort((left, right) => {
      var _a, _b;
      return ((_a = frequency.get(right)) != null ? _a : 0) - ((_b = frequency.get(left)) != null ? _b : 0) || left.localeCompare(right);
    }).slice(0, limit);
  }
  sortMemos(memos) {
    return [...memos].sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
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
    const menu = new import_obsidian10.Menu();
    menu.addItem((item) => item.setTitle(memo.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876").setIcon("pin").onClick(() => void this.togglePinnedFromList(memo)));
    menu.addItem((item) => item.setTitle("#").setIcon("hash").onClick(() => this.addTagFromList(memo)));
    menu.addItem((item) => item.setTitle("\u5220\u9664").setIcon("trash-2").onClick(() => void this.deleteMemoFromList(memo)));
    menu.showAtMouseEvent(event);
  }
  addTagFromList(memo) {
    var _a;
    this.selectMemo(memo);
    void ((_a = this.detailCards.find((card) => card.path === memo.file.path)) == null ? void 0 : _a.addTag("#"));
  }
  async togglePinnedFromList(memo) {
    try {
      await this.plugin.repository.togglePinned(memo.file);
      await this.refresh(memo.file.path);
    } catch (error) {
      console.error("[Markdown Memos] \u66F4\u65B0\u7F6E\u9876\u5931\u8D25\u3002", error);
      new import_obsidian10.Notice("\u66F4\u65B0\u7F6E\u9876\u5931\u8D25");
    }
  }
  async deleteMemoFromList(memo) {
    if (!await confirmMemoDeletion(this.app, memo)) return;
    try {
      await this.plugin.repository.deleteMemo(memo.file);
      await this.refresh();
    } catch (error) {
      console.error("[Markdown Memos] \u5220\u9664\u5931\u8D25\u3002", error);
      new import_obsidian10.Notice("\u5220\u9664\u5931\u8D25");
    }
  }
  async toggleTaskFromList(memo) {
    try {
      await this.plugin.repository.toggleTaskCompleted(memo.file);
      await this.refresh(memo.file.path);
    } catch (error) {
      console.error("[Markdown Memos] \u66F4\u65B0\u4EFB\u52A1\u5931\u8D25\u3002", error);
      new import_obsidian10.Notice("\u66F4\u65B0\u4EFB\u52A1\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u5F00\u53D1\u8005\u63A7\u5236\u53F0");
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
    window.setTimeout(() => {
      var _a, _b;
      return (_b = (_a = this.detailContentEl) == null ? void 0 : _a.querySelector(".obsidian-memos-composer__title")) == null ? void 0 : _b.focus();
    }, 0);
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
    var _a;
    if (!this.selectedPath) return;
    const items = (_a = this.detailContentEl) == null ? void 0 : _a.querySelectorAll(".obsidian-memos-feed-item");
    const selected = Array.from(items != null ? items : []).find((item) => item.dataset.memoPath === this.selectedPath);
    selected == null ? void 0 : selected.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }
  async toggleListPane() {
    this.plugin.settings.listPaneCollapsed = !this.plugin.settings.listPaneCollapsed;
    await this.plugin.saveSettings();
    this.updateLayoutState();
  }
  updateLayoutState() {
    if (!this.splitEl) {
      return;
    }
    this.contentEl.toggleClass("is-list-right", this.plugin.settings.listPanePosition === "right");
    this.contentEl.toggleClass("is-list-collapsed", this.plugin.settings.listPaneCollapsed);
    this.contentEl.toggleClass("is-mobile", this.isMobileLayout());
    this.contentEl.toggleClass("is-mobile-detail", this.mobileDetail);
    this.splitEl.setCssProps({ "--memos-list-width": `${this.plugin.settings.listPaneWidth}px` });
  }
  isMobileLayout() {
    const appIsMobile = this.app.isMobile;
    return appIsMobile === true || import_obsidian10.Platform.isMobile;
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
  return value === "modified-desc" || value === "modified-asc" || value === "name-asc" || value === "name-desc" || value === "tags-desc" || value === "tags-asc";
}
function isFilterValue(value) {
  return value === "all" || value === "note" || value === "task-open" || value === "task-completed" || value === "archived";
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
  selectedTag: null
};
var ObsidianMemosPlugin = class extends import_obsidian11.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.repository = new MemoRepository(this.app, () => this.settings);
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
      new import_obsidian11.Notice(`\u6253\u5F00 Markdown Memos \u5931\u8D25\uFF1A${errorMessage(error)}`);
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
    var _a;
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
      selectedTag: typeof (saved == null ? void 0 : saved.selectedTag) === "string" && saved.selectedTag ? saved.selectedTag : null
    };
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
function isMemoFilter(value) {
  return value === "all" || value === "note" || value === "task-open" || value === "task-completed" || value === "archived";
}
function clampListPaneWidth(value) {
  const width = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_SETTINGS.listPaneWidth;
  return Math.min(420, Math.max(240, Math.round(width)));
}
