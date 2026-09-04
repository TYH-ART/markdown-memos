import { Notice, Plugin, TAbstractFile } from "obsidian";
import { MemoRepository } from "./services/MemoRepository";
import { AttachmentService } from "./services/AttachmentService";
import { ObsidianMemosSettingTab } from "./settings";
import type { ObsidianMemosSettings } from "./types";
import { DEFAULT_MEMO_FOLDER, errorMessage, isPathInsideFolder, normalizeMemoFolder } from "./utils";
import { MEMOS_VIEW_TYPE, MemosView } from "./views/MemosView";

const DEFAULT_SETTINGS: ObsidianMemosSettings = {
  memoFolder: DEFAULT_MEMO_FOLDER,
  attachmentFolder: "",
  listPanePosition: "left",
  listPaneCollapsed: false,
  listPaneWidth: 300,
  defaultMemoType: "note",
  selectedFilter: "all",
  selectedTag: null,
  memoNotebooks: [
    { id: "default", name: "备忘录 1", private: false },
    { id: "private", name: "私密备忘录", private: true },
  ],
  activeMemoNotebookId: "default",
  composerTags: [],
};

export default class ObsidianMemosPlugin extends Plugin {
  public override settings: ObsidianMemosSettings = DEFAULT_SETTINGS;
  public repository!: MemoRepository;
  public attachmentService!: AttachmentService;
  private refreshTimer?: number;

  public override async onload(): Promise<void> {
    await this.loadSettings();
    this.repository = new MemoRepository(this.app, () => this.settings);
    this.attachmentService = new AttachmentService(this.app, this.repository, () => this.settings);

    this.registerView(MEMOS_VIEW_TYPE, (leaf) => new MemosView(leaf, this));
    // `book-open` is part of Obsidian's stable built-in icon set and remains visible
    // across desktop/mobile icon registries (unlike some newer Lucide aliases).
    this.addRibbonIcon("book-open", "打开 Markdown Memos", () => void this.openMemosView());
    this.addCommand({
      id: "open-memos-view",
      name: "Open memos view",
      callback: () => void this.openMemosView(),
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
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.isRelevantFile(file)) {
          this.scheduleViewRefresh();
        }
      }),
    );
  }

  public override onunload(): void {
    if (this.refreshTimer !== undefined) {
      window.clearTimeout(this.refreshTimer);
    }
  }

  public async openMemosView(): Promise<void> {
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
      console.error("[Markdown Memos] 打开 View 失败。", error);
      new Notice(`打开 Markdown Memos 失败：${errorMessage(error)}`);
    }
  }

  public scheduleViewRefresh(): void {
    if (this.refreshTimer !== undefined) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      for (const leaf of this.app.workspace.getLeavesOfType(MEMOS_VIEW_TYPE)) {
        if (leaf.view instanceof MemosView) {
          void leaf.view.refresh();
        }
      }
    }, 80);
  }

  public async saveSettings(): Promise<void> {
    this.settings.memoFolder = normalizeMemoFolder(this.settings.memoFolder);
    await this.saveData(this.settings);
  }

  private async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<ObsidianMemosSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(saved ?? {}),
      memoFolder: normalizeMemoFolder(saved?.memoFolder ?? DEFAULT_MEMO_FOLDER),
      attachmentFolder: typeof saved?.attachmentFolder === "string" ? saved.attachmentFolder.trim() : "",
      listPanePosition: saved?.listPanePosition === "left" ? "left" : "right",
      listPaneCollapsed: saved?.listPaneCollapsed === true,
      listPaneWidth: clampListPaneWidth(saved?.listPaneWidth),
      defaultMemoType: saved?.defaultMemoType === "task" ? "task" : "note",
      selectedFilter: isMemoFilter(saved?.selectedFilter) ? saved.selectedFilter : "all",
      selectedTag: typeof saved?.selectedTag === "string" && saved.selectedTag ? saved.selectedTag : null,
      memoNotebooks: normalizeNotebooks(saved?.memoNotebooks),
      activeMemoNotebookId: typeof saved?.activeMemoNotebookId === "string" && saved.activeMemoNotebookId
        ? saved.activeMemoNotebookId
        : "default",
      composerTags: normalizeComposerTags(saved?.composerTags),
    };
    if (!this.settings.memoNotebooks.some((notebook) => notebook.id === this.settings.activeMemoNotebookId)) {
      this.settings.activeMemoNotebookId = this.settings.memoNotebooks[0]?.id ?? "default";
    }
  }

  private handleVaultChange(file: TAbstractFile): void {
    if (this.isRelevantFile(file)) {
      this.scheduleViewRefresh();
    }
  }

  private isRelevantFile(file: TAbstractFile): boolean {
    return this.isRelevantPath(file.path);
  }

  private isRelevantPath(path: string): boolean {
    return isPathInsideFolder(path, this.settings.memoFolder);
  }
}

function normalizeComposerTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
}

function normalizeNotebooks(value: unknown): ObsidianMemosSettings["memoNotebooks"] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.memoNotebooks.map((item) => ({ ...item }));
  const notebooks = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !candidate.id || typeof candidate.name !== "string" || !candidate.name.trim()) return [];
    return [{
      id: candidate.id,
      name: candidate.name.trim(),
      private: candidate.private === true,
      passwordHash: typeof candidate.passwordHash === "string" && candidate.passwordHash ? candidate.passwordHash : undefined,
      pinned: candidate.pinned === true,
    }];
  });
  if (!notebooks.some((item) => item.id === "default")) notebooks.unshift({ id: "default", name: "备忘录 1", private: false, passwordHash: undefined, pinned: false });
  if (!notebooks.some((item) => item.id === "private")) notebooks.push({ id: "private", name: "私密备忘录", private: true, passwordHash: undefined, pinned: false });
  return notebooks;
}

function isMemoFilter(value: unknown): value is ObsidianMemosSettings["selectedFilter"] {
  return value === "all" || value === "note" || value === "task-open" || value === "task-completed" || value === "archived";
}

function clampListPaneWidth(value: unknown): number {
  const width = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_SETTINGS.listPaneWidth;
  return Math.min(420, Math.max(240, Math.round(width)));
}
