import { App, ItemView, Menu, Modal, Notice, Platform, setIcon, WorkspaceLeaf } from "obsidian";
import type ObsidianMemosPlugin from "../main";
import { MemoCard } from "../components/MemoCard";
import { MemoComposer } from "../components/MemoComposer";
import { formatListDate, getMemoListTitle, getSummary, MemoList } from "../components/MemoList";
import { confirmMemoDeletion } from "../components/MemoDeleteModal";
import type { MemoRecord } from "../types";
import type { MemoNotebook } from "../types";
import { extractMemoTagOccurrences } from "../utils";

export const MEMOS_VIEW_TYPE = "obsidian-memos-view";

const MIN_LIST_WIDTH = 240;
const MAX_LIST_WIDTH = 420;
type MemoSort = "modified-desc" | "modified-asc" | "name-asc" | "name-desc" | "tags-desc" | "tags-asc";

export class MemosView extends ItemView {
  private memoList?: MemoList;
  private detailCards: MemoCard[] = [];
  private splitEl?: HTMLElement;
  private detailContentEl?: HTMLElement;
  private folderLabel?: HTMLElement;
  private listCountLabel?: HTMLElement;
  private selectedPath?: string;
  private allMemos: MemoRecord[] = [];
  private memos: MemoRecord[] = [];
  private searchQuery = "";
  private tagSelect?: HTMLSelectElement;
  private mobileTagButton?: HTMLButtonElement;
  private mobileNotebookList?: HTMLElement;
  private mobileTrashButton?: HTMLButtonElement;
  private mobileTrashToolbar?: HTMLElement;
  private sortSelect?: HTMLSelectElement;
  private sortOption: MemoSort = "modified-desc";
  // Mobile views should open on the memo feed. The sidebar is explicitly
  // opened with the edge arrow button.
  private mobileDetail = true;
  private refreshSequence = 0;
  private isDraggingDivider = false;
  private editingPath?: string;
  private showTrash = false;
  private expandedNotebookId = "default";
  private readonly unlockedNotebookIds = new Set<string>(["default"]);
  private mobileDrawerButton?: HTMLButtonElement;

  public constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ObsidianMemosPlugin,
  ) {
    super(leaf);
  }

  public getViewType(): string {
    return MEMOS_VIEW_TYPE;
  }

  public getDisplayText(): string {
    return "Markdown Memos";
  }

  public override getIcon(): string {
    return "book-open";
  }

  public override async onOpen(): Promise<void> {
    const activeNotebook = this.plugin.settings.memoNotebooks.find((item) => item.id === this.plugin.settings.activeMemoNotebookId);
    if (activeNotebook?.private && !this.unlockedNotebookIds.has(activeNotebook.id)) {
      this.plugin.settings.activeMemoNotebookId = "default";
      await this.plugin.saveSettings();
    }
    this.contentEl.empty();
    this.contentEl.addClass("obsidian-memos-view");
    this.containerEl.addClass("obsidian-memos-view-container");
    this.buildLayout();
    await this.refresh();
  }

  public override async onClose(): Promise<void> {
    this.refreshSequence += 1;
    this.destroyDetailCards();
    this.memoList?.destroy();
    this.memoList = undefined;
    this.folderLabel = undefined;
    this.mobileTagButton = undefined;
    this.mobileNotebookList = undefined;
    this.mobileTrashButton = undefined;
    this.mobileTrashToolbar = undefined;
    this.mobileDrawerButton = undefined;
    this.containerEl.removeClass("obsidian-memos-view-container", "is-mobile");
    this.contentEl.empty();
  }

  public async refresh(preferredPath?: string): Promise<void> {
    if (this.editingPath && preferredPath === undefined) return;
    const sequence = ++this.refreshSequence;
    try {
      const memos = await this.plugin.repository.getMemos();
      if (sequence !== this.refreshSequence) {
        return;
      }

      this.allMemos = this.sortMemos(memos);

      this.folderLabel?.setText(this.plugin.repository.folder);
      this.renderMobileLibrary();
      this.updateTagOptions();
      await this.applyCurrentFilters(preferredPath, sequence);
    } catch (error) {
      console.error("[Markdown Memos] 读取 Memo 列表失败。", error);
      this.detailContentEl?.empty();
      this.detailContentEl?.createDiv({ cls: "obsidian-memos-status is-error", text: "无法读取 Memo 列表，请查看开发者控制台。" });
    }
  }

  private buildLayout(): void {
    const page = this.contentEl.createDiv({ cls: "obsidian-memos-page" });
    this.mobileDrawerButton = page.createEl("button", {
      cls: "clickable-icon obsidian-memos-mobile-drawer-button",
      attr: { type: "button", "aria-label": "展开备忘录侧边栏", title: "展开备忘录侧边栏" },
    });
    setIcon(this.mobileDrawerButton, "chevron-right");
    this.registerDomEvent(this.mobileDrawerButton, "click", () => {
      this.mobileDetail = false;
      this.updateLayoutState();
    });
    const toolbar = page.createDiv({ cls: "obsidian-memos-toolbar" });
    const sidebarButton = toolbar.createEl("button", {
      cls: "clickable-icon obsidian-memos-toolbar__icon",
      attr: { type: "button", "aria-label": "展开或收起 Memo 列表", title: "展开或收起 Memo 列表" },
    });
    setIcon(sidebarButton, "sidebar");
    this.registerDomEvent(sidebarButton, "click", () => void this.toggleListPane());
    const mobileRefreshButton = toolbar.createEl("button", {
      cls: "clickable-icon obsidian-memos-toolbar__mobile-refresh",
      attr: { type: "button", "aria-label": "刷新 Memo", title: "刷新 Memo" },
    });
    setIcon(mobileRefreshButton, "refresh-cw");
    this.registerDomEvent(mobileRefreshButton, "click", () => void this.refresh());

    const title = toolbar.createDiv({ cls: "obsidian-memos-toolbar__title" });
    title.createEl("strong", { text: "Markdown Memos" });
    this.folderLabel = title.createSpan({ cls: "obsidian-memos-toolbar__folder", text: this.plugin.repository.folder });

    const toolbarActions = toolbar.createDiv({ cls: "obsidian-memos-toolbar__actions" });
    const searchShell = toolbarActions.createDiv({ cls: "obsidian-memos-toolbar__search-shell" });
    this.mobileTagButton = searchShell.createEl("button", {
      cls: "clickable-icon obsidian-memos-toolbar__mobile-tag",
      attr: { type: "button", "aria-label": "按标签筛选", title: "按标签筛选" },
    });
    setIcon(this.mobileTagButton, "chevron-down");
    this.registerDomEvent(this.mobileTagButton, "click", (event: MouseEvent) => this.openMobileTagMenu(event));
    const searchInput = searchShell.createEl("input", {
      cls: "obsidian-memos-toolbar__search",
      attr: { type: "search", placeholder: " ", "aria-label": "搜索 Memos", autocomplete: "off" },
    });
    const searchIcon = searchShell.createSpan({ cls: "obsidian-memos-toolbar__search-icon", attr: { "aria-hidden": "true" } });
    setIcon(searchIcon, "search");
    const filterSelect = toolbarActions.createEl("select", { cls: "dropdown obsidian-memos-toolbar__select", attr: { "aria-label": "Memo 类型筛选" } });
    addSelectOption(filterSelect, "all", "全部");
    addSelectOption(filterSelect, "note", "普通 Memo");
    addSelectOption(filterSelect, "task-open", "未完成任务");
    addSelectOption(filterSelect, "task-completed", "已完成任务");
    addSelectOption(filterSelect, "archived", "已归档");
    filterSelect.value = this.plugin.settings.selectedFilter;
    this.tagSelect = toolbarActions.createEl("select", { cls: "dropdown obsidian-memos-toolbar__select", attr: { "aria-label": "标签筛选" } });
    const applySearch = (): void => {
      this.searchQuery = searchInput.value;
      searchShell.toggleClass("has-query", Boolean(this.searchQuery));
      // A search started from the main toolbar must keep the detail feed open,
      // even while the query temporarily has no matches.
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
      this.plugin.settings.selectedTag = this.tagSelect?.value || null;
      void this.plugin.saveSettings();
      void this.applyCurrentFilters();
    });
    const newButton = toolbarActions.createEl("button", {
      cls: "mod-cta obsidian-memos-toolbar__new",
      attr: { type: "button", "aria-label": "新建 Memo" },
    });
    newButton.createSpan({ cls: "obsidian-memos-toolbar__new-label is-full", text: "+ 新建 Memo" });
    const compactNewIcon = newButton.createSpan({ cls: "obsidian-memos-toolbar__new-icon is-compact", attr: { "aria-hidden": "true" } });
    setIcon(compactNewIcon, "plus");
    this.registerDomEvent(newButton, "click", () => {
      this.mobileDetail = true;
      this.updateLayoutState();
      this.composerFocus();
    });

    this.splitEl = page.createDiv({ cls: "obsidian-memos-split" });
    const listPaneEl = this.splitEl.createDiv({ cls: "obsidian-memos-list-pane" });
    const mobileLibrary = listPaneEl.createDiv({ cls: "obsidian-memos-mobile-library" });
    const mobileLibraryUpper = mobileLibrary.createDiv({ cls: "obsidian-memos-mobile-library__upper" });
    const mobileLibraryHeader = mobileLibraryUpper.createDiv({ cls: "obsidian-memos-mobile-library__header" });
    mobileLibraryHeader.createEl("strong", { text: "备忘录" });
    const addNotebookButton = mobileLibraryHeader.createEl("button", {
      cls: "clickable-icon obsidian-memos-mobile-library__add",
      attr: { type: "button", "aria-label": "新建备忘录", title: "新建备忘录" },
    });
    setIcon(addNotebookButton, "plus");
    this.registerDomEvent(addNotebookButton, "click", () => void this.createNotebook());
    this.mobileNotebookList = mobileLibraryUpper.createDiv({ cls: "obsidian-memos-mobile-library__list" });
    this.mobileTrashButton = mobileLibrary.createEl("button", {
      cls: "obsidian-memos-mobile-library__trash",
      attr: { type: "button" },
    });
    const trashIcon = this.mobileTrashButton.createSpan({ cls: "obsidian-memos-mobile-library__trash-icon", attr: { "aria-hidden": "true" } });
    setIcon(trashIcon, "trash-2");
    this.mobileTrashButton.createSpan({ text: "回收站" });
    this.registerDomEvent(this.mobileTrashButton, "click", () => void this.openTrash());
    this.renderMobileLibrary();
    const listHeader = listPaneEl.createDiv({ cls: "obsidian-memos-list-pane__header" });
    const listTopButton = listHeader.createEl("button", {
      cls: "clickable-icon obsidian-memos-pane-top",
      attr: { type: "button", "aria-label": "回到 Memo 列表顶部", title: "回到列表顶部" },
    });
    setIcon(listTopButton, "arrow-up-to-line");
    this.listCountLabel = listHeader.createSpan({ cls: "obsidian-memos-list-pane__count", text: "0" });
    this.sortSelect = listHeader.createEl("select", {
      cls: "dropdown obsidian-memos-list-pane__sort",
      attr: { "aria-label": "Memo 排序" },
    });
    addSelectOption(this.sortSelect, "modified-desc", "时间↓");
    addSelectOption(this.sortSelect, "modified-asc", "时间↑");
    addSelectOption(this.sortSelect, "name-asc", "名称 A→Z");
    addSelectOption(this.sortSelect, "name-desc", "名称 Z→A");
    addSelectOption(this.sortSelect, "tags-desc", "标签数↓");
    addSelectOption(this.sortSelect, "tags-asc", "标签数↑");
    this.sortSelect.value = this.sortOption;
    this.registerDomEvent(this.sortSelect, "change", () => {
      const value = this.sortSelect?.value;
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
      onDelete: (memo) => this.deleteMemoFromList(memo, true),
      onContextMenu: (memo, event) => this.openListContextMenu(memo, event),
    });

    const mobileScrim = this.splitEl.createDiv({ cls: "obsidian-memos-mobile-scrim" });
    this.registerDomEvent(mobileScrim, "click", () => {
      this.mobileDetail = true;
      this.updateLayoutState();
    });

    const divider = this.splitEl.createDiv({ cls: "obsidian-memos-divider", attr: { role: "separator", "aria-label": "调整列表宽度" } });
    this.registerDomEvent(divider, "pointerdown", (event: PointerEvent) => this.startDividerDrag(event));

    const detailPaneEl = this.splitEl.createDiv({ cls: "obsidian-memos-detail-pane" });
    this.detailContentEl = detailPaneEl.createDiv({ cls: "obsidian-memos-detail-pane__content" });
    this.mobileTrashToolbar = this.detailContentEl.createDiv({ cls: "obsidian-memos-mobile-trash-toolbar" });
    const backFromTrash = this.mobileTrashToolbar.createEl("button", {
      cls: "clickable-icon obsidian-memos-mobile-trash-back",
      attr: { type: "button", "aria-label": "返回主界面", title: "返回主界面" },
    });
    setIcon(backFromTrash, "arrow-left");
    this.mobileTrashToolbar.createEl("strong", { text: "回收站" });
    const emptyTrashButton = this.mobileTrashToolbar.createEl("button", { text: "清空回收站", attr: { type: "button" } });
    this.registerDomEvent(backFromTrash, "click", () => {
      this.showTrash = false;
      this.mobileDetail = true;
      this.renderMobileLibrary();
      void this.refresh();
    });
    this.registerDomEvent(emptyTrashButton, "click", () => void this.emptyTrash());
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
        getPopularTags: () => this.getPopularTags(3),
        isMobileLayout: () => this.isMobileLayout(),
        getNotebookId: () => this.isMobileLayout() ? this.plugin.settings.activeMemoNotebookId : undefined,
      },
    );
    this.detailContentEl.createDiv({ cls: "obsidian-memos-detail-card-host" });

    this.registerDomEvent(this.contentEl, "keydown", (event: KeyboardEvent) => this.handleKeyboard(event));
    this.registerDomEvent(window, "resize", () => this.updateLayoutState());
    this.registerDomEvent(window, "pointermove", (event: PointerEvent) => {
      this.moveDivider(event);
    });
    this.registerDomEvent(window, "pointerup", () => {
      this.stopDividerDrag();
    });
    this.updateLayoutState();
  }

  private renderMobileLibrary(): void {
    if (!this.mobileNotebookList) return;
    this.mobileNotebookList.empty();
    const activeId = this.plugin.settings.activeMemoNotebookId;
    const notebooks = [...this.plugin.settings.memoNotebooks].sort((left, right) => Number(right.pinned === true) - Number(left.pinned === true));
    for (const notebook of notebooks) {
      const row = this.mobileNotebookList.createDiv({ cls: "obsidian-memos-mobile-library__row" });
      const button = row.createEl("button", {
        cls: `obsidian-memos-mobile-library__item${!this.showTrash && notebook.id === activeId ? " is-active" : ""}`,
        attr: { type: "button" },
      });
      const icon = button.createSpan({ cls: "obsidian-memos-mobile-library__item-icon", attr: { "aria-hidden": "true" } });
      setIcon(icon, notebook.private ? "lock" : "notebook-tabs");
      button.createSpan({ cls: "obsidian-memos-mobile-library__item-name", text: notebook.name });
      let longPressTimer: number | undefined;
      let longPressTriggered = false;
      const clearLongPress = (): void => {
        if (longPressTimer !== undefined) window.clearTimeout(longPressTimer);
        longPressTimer = undefined;
      };
      this.registerDomEvent(button, "pointerdown", (event: PointerEvent) => {
        if (!event.isPrimary) return;
        longPressTriggered = false;
        clearLongPress();
        longPressTimer = window.setTimeout(() => {
          longPressTriggered = true;
          this.openNotebookMenu(notebook, button);
        }, 550);
      });
      this.registerDomEvent(button, "pointerup", clearLongPress);
      this.registerDomEvent(button, "pointercancel", clearLongPress);
      this.registerDomEvent(button, "pointerleave", clearLongPress);
      this.registerDomEvent(button, "contextmenu", (event: MouseEvent) => {
        event.preventDefault();
        this.openNotebookMenu(notebook, button);
      });
      this.registerDomEvent(button, "click", (event: MouseEvent) => {
        if (longPressTriggered) {
          event.preventDefault();
          event.stopPropagation();
          longPressTriggered = false;
          return;
        }
        void this.selectNotebook(notebook);
      });
      const expandButton = row.createEl("button", {
        cls: "clickable-icon obsidian-memos-mobile-library__expand",
        attr: { type: "button", "aria-label": "展开备忘录内容", title: "展开备忘录内容" },
      });
      const expanded = this.expandedNotebookId === notebook.id && !this.showTrash;
      setIcon(expandButton, expanded ? "chevron-down" : "chevron-right");
      this.registerDomEvent(expandButton, "click", (event: MouseEvent) => {
        event.stopPropagation();
        this.expandedNotebookId = expanded ? "" : notebook.id;
        this.renderMobileLibrary();
      });
      if (expanded) this.renderNotebookContents(row, notebook.id);
    }
    this.mobileTrashButton?.toggleClass("is-active", this.showTrash);
  }

  private renderNotebookContents(container: HTMLElement, notebookId: string): void {
    const contents = container.createDiv({ cls: "obsidian-memos-mobile-library__contents" });
    const memos = this.allMemos.filter((memo) => memo.notebookId === notebookId && !memo.trashedAt);
    if (memos.length === 0) {
      contents.createDiv({ cls: "obsidian-memos-mobile-library__contents-empty", text: "暂无内容" });
      return;
    }
    for (const memo of memos.slice(0, 30)) {
      const button = contents.createEl("button", {
        cls: "obsidian-memos-mobile-library__content-item",
        attr: { type: "button" },
      });
      const titleRow = button.createDiv({ cls: "obsidian-memos-mobile-library__content-title-row" });
      if (memo.pinned) {
        const pin = titleRow.createSpan({
          cls: "obsidian-memos-mobile-library__content-pin",
          attr: { "aria-label": "已置顶", title: "已置顶" },
        });
        setIcon(pin, "pin");
      }
      titleRow.createSpan({ cls: "obsidian-memos-mobile-library__content-title", text: getMemoListTitle(memo.content) });
      const preview = [formatListDate(memo.modified), getSummary(memo.content)].filter(Boolean).join("  ");
      button.createDiv({ cls: "obsidian-memos-mobile-library__content-summary", text: preview });
      this.registerDomEvent(button, "click", () => {
        this.showTrash = false;
        this.mobileDetail = true;
        this.selectMemo(memo);
      });
    }
  }

  private async createNotebook(): Promise<void> {
    const name = await this.promptNotebookName("新建备忘录");
    if (!name?.trim()) return;
    const isPrivate = await confirmAction(this.app, "是否创建为私密备忘录？");
    let passwordHash: string | undefined;
    if (isPrivate) {
      const password = await requestText(this.app, "设置访问密码", "请输入访问密码", "password");
      if (!password) return;
      const confirmation = await requestText(this.app, "再次输入密码", "请再次输入访问密码", "password");
      if (confirmation !== password) {
        new Notice("两次输入的密码不一致");
        return;
      }
      passwordHash = await hashNotebookPassword(password);
    }
    const notebook: MemoNotebook = {
      id: `notebook-${Date.now().toString(36)}`,
      name: name.trim(),
      private: isPrivate,
      passwordHash,
    };
    this.plugin.settings.memoNotebooks.push(notebook);
    if (!isPrivate) this.unlockedNotebookIds.add(notebook.id);
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
    await this.selectNotebook(notebook);
  }

  private openNotebookMenu(notebook: MemoNotebook, anchor: HTMLElement): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(notebook.pinned ? "取消置顶" : "置顶").setIcon("pin").onClick(() => void this.toggleNotebookPinned(notebook)));
    menu.addItem((item) => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.renameNotebook(notebook)));
    menu.addItem((item) => item.setTitle("删除备忘录").setIcon("trash-2")
      .setDisabled(this.plugin.settings.memoNotebooks.length <= 1)
      .onClick(() => void this.deleteNotebook(notebook)));
    const rect = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
  }

  private async toggleNotebookPinned(notebook: MemoNotebook): Promise<void> {
    notebook.pinned = notebook.pinned !== true;
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
  }

  private async renameNotebook(notebook: MemoNotebook): Promise<void> {
    const name = await this.promptNotebookName("重命名备忘录", notebook.name);
    if (!name?.trim()) return;
    notebook.name = name.trim();
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
  }

  private async deleteNotebook(notebook: MemoNotebook): Promise<void> {
    if (this.plugin.settings.memoNotebooks.length <= 1) return;
    if (!await confirmAction(this.app, `删除“${notebook.name}”？其中的 Memo 将移动到默认备忘录。`)) return;
    const fallback = this.plugin.settings.memoNotebooks.find((item) => item.id !== notebook.id);
    if (!fallback) return;
    await this.plugin.repository.moveMemosToNotebook(notebook.id, fallback.id);
    this.plugin.settings.memoNotebooks = this.plugin.settings.memoNotebooks.filter((item) => item.id !== notebook.id);
    if (this.plugin.settings.activeMemoNotebookId === notebook.id) this.plugin.settings.activeMemoNotebookId = fallback.id;
    this.expandedNotebookId = fallback.id;
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
    await this.refresh();
  }

  private promptNotebookName(title: string, initial = ""): Promise<string | null> {
    return new Promise((resolve) => {
      new NotebookNameModal(this.app, title, resolve, initial).open();
    });
  }

  private async selectNotebook(notebook: MemoNotebook): Promise<void> {
    if (notebook.private && !this.unlockedNotebookIds.has(notebook.id)) {
      if (!notebook.passwordHash) {
        const password = await requestText(this.app, `为“${notebook.name}”设置密码`, "请输入访问密码", "password");
        if (!password) return;
        const confirmation = await requestText(this.app, "再次输入密码", "请再次输入访问密码", "password");
        if (confirmation !== password) {
          new Notice("两次输入的密码不一致");
          return;
        }
        notebook.passwordHash = await hashNotebookPassword(password);
        await this.plugin.saveSettings();
      } else {
        const password = await requestText(this.app, `输入“${notebook.name}”的密码`, "请输入访问密码", "password");
        if (!password || await hashNotebookPassword(password) !== notebook.passwordHash) {
          new Notice("密码错误");
          return;
        }
      }
      this.unlockedNotebookIds.add(notebook.id);
    }
    this.plugin.settings.activeMemoNotebookId = notebook.id;
    this.showTrash = false;
    this.mobileDetail = true;
    this.searchQuery = "";
    await this.plugin.saveSettings();
    this.renderMobileLibrary();
    await this.refresh();
  }

  private async openTrash(): Promise<void> {
    this.showTrash = true;
    this.mobileDetail = true;
    this.renderMobileLibrary();
    await this.applyCurrentFilters();
  }

  private async emptyTrash(): Promise<void> {
    if (!await confirmAction(this.app, "确定永久清空当前备忘录的回收站吗？此操作无法撤销。")) return;
    await this.plugin.repository.emptyTrash();
    await this.refresh();
  }

  private async renderDetail(sequence: number): Promise<void> {
    const host = this.detailContentEl?.querySelector<HTMLElement>(".obsidian-memos-detail-card-host");
    if (!host || sequence !== this.refreshSequence) {
      return;
    }
    this.destroyDetailCards();
    host.empty();

    if (this.memos.length === 0) {
      const empty = host.createDiv({ cls: "obsidian-memos-detail-empty" });
      empty.createEl("h2", { text: this.showTrash ? "回收站为空" : "暂无 Memo" });
      if (!this.showTrash) empty.createEl("p", { text: "在上方输入框开始记录。" });
      return;
    }

    for (const memo of this.memos) {
      if (sequence !== this.refreshSequence) return;
      const item = host.createDiv({ cls: `obsidian-memos-feed-item${memo.file.path === this.selectedPath ? " is-selected" : ""}` });
      item.dataset.memoPath = memo.file.path;
      if (this.showTrash) {
        const restoreButton = item.createEl("button", {
          cls: "obsidian-memos-mobile-restore",
          attr: { type: "button", "aria-label": "还原 Memo", title: "还原 Memo" },
        });
        setIcon(restoreButton, "rotate-ccw");
        this.registerDomEvent(restoreButton, "click", async (event: MouseEvent) => {
          event.stopPropagation();
          await this.plugin.repository.restoreMemo(memo.file);
          await this.refresh();
        });
      }
      const card = new MemoCard(this.app, this, item, this.plugin.repository, memo, {
        onChanged: () => this.refresh(memo.file.path),
        attachmentService: this.plugin.attachmentService,
        onEditingChange: (editing) => {
          this.editingPath = editing ? memo.file.path : undefined;
        },
        getPopularTags: () => this.getPopularTags(3),
        isMobileLayout: () => this.isMobileLayout(),
        trashMode: this.showTrash,
        onMove: () => this.openMoveMenu(memo),
      });
      this.detailCards.push(card);
      await card.render();
    }
  }

  private selectMemo(memo: MemoRecord): void {
    this.selectedPath = memo.file.path;
    this.mobileDetail = true;
    this.memoList?.setMemos(this.memos, this.selectedPath);
    this.updateLayoutState();
    this.updateSelectedFeedItem();
    this.scrollSelectedIntoView(true);
  }

  private async applyCurrentFilters(preferredPath?: string, sequence = this.refreshSequence): Promise<void> {
    const query = this.searchQuery.trim().toLocaleLowerCase();
    const selectedTag = this.plugin.settings.selectedTag;
    const selectedFilter = this.plugin.settings.selectedFilter;
    const activeNotebookId = this.plugin.settings.activeMemoNotebookId;
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
      const haystack = [memo.content, memo.file.basename, ...memo.tags, ...memo.attachments.map((attachment) => attachment.name)]
        .join("\n")
        .toLocaleLowerCase();
      return haystack.includes(query);
    });

    const requestedPath = preferredPath ?? this.selectedPath;
    this.selectedPath = this.memos.some((memo) => memo.file.path === requestedPath) ? requestedPath : this.memos[0]?.file.path;
    if (!this.selectedPath && this.mobileDetail && !this.searchQuery.trim()) {
      this.mobileDetail = false;
    }
    this.listCountLabel?.setText(this.memos.length === this.allMemos.length ? String(this.memos.length) : `${this.memos.length}/${this.allMemos.length}`);
    this.memoList?.setMemos(this.memos, this.selectedPath);
    this.updateLayoutState();
    await this.renderDetail(sequence);
  }

  private updateTagOptions(): void {
    if (!this.tagSelect) {
      return;
    }
    const tagFrequency = this.getTagFrequency();
    const tags = Array.from(tagFrequency.keys()).sort((left, right) => {
      const countDifference = (tagFrequency.get(right) ?? 0) - (tagFrequency.get(left) ?? 0);
      return countDifference || left.localeCompare(right);
    });
    const selected = this.plugin.settings.selectedTag;
    this.tagSelect.empty();
    addSelectOption(this.tagSelect, "", "全部标签");
    for (const tag of tags) {
      addSelectOption(this.tagSelect, tag, `${tag} (${tagFrequency.get(tag) ?? 0})`);
    }
    if (selected && tags.includes(selected)) {
      this.tagSelect.value = selected;
    } else {
      this.plugin.settings.selectedTag = null;
      this.tagSelect.value = "";
    }
    const activeTag = this.plugin.settings.selectedTag;
    this.mobileTagButton?.toggleClass("has-active-tag", Boolean(activeTag));
    this.mobileTagButton?.setAttr("aria-label", activeTag ? `当前标签：${activeTag}` : "按标签筛选");
    this.mobileTagButton?.setAttr("title", activeTag ? `当前标签：${activeTag}` : "按标签筛选");
  }

  private openMobileTagMenu(event: MouseEvent): void {
    const menu = new Menu();
    const selectedTag = this.plugin.settings.selectedTag;
    menu.addItem((item) => item
      .setTitle("全部标签")
      .setIcon("list-filter")
      .setChecked(!selectedTag)
      .onClick(() => void this.selectMobileTag(null)));

    const frequency = this.getTagFrequency();
    const tags = Array.from(frequency.keys()).sort((left, right) => {
      const countDifference = (frequency.get(right) ?? 0) - (frequency.get(left) ?? 0);
      return countDifference || left.localeCompare(right);
    });
    for (const tag of tags) {
      menu.addItem((item) => item
        .setTitle(`${tag} (${frequency.get(tag) ?? 0})`)
        .setIcon("hash")
        .setChecked(tag === selectedTag)
        .onClick(() => void this.selectMobileTag(tag)));
    }
    menu.showAtMouseEvent(event);
  }

  private async selectMobileTag(tag: string | null): Promise<void> {
    this.plugin.settings.selectedTag = tag;
    if (this.tagSelect) this.tagSelect.value = tag ?? "";
    this.mobileTagButton?.toggleClass("has-active-tag", Boolean(tag));
    this.mobileTagButton?.setAttr("aria-label", tag ? `当前标签：${tag}` : "按标签筛选");
    this.mobileTagButton?.setAttr("title", tag ? `当前标签：${tag}` : "按标签筛选");
    await this.plugin.saveSettings();
    await this.applyCurrentFilters();
  }

  private getTagFrequency(): Map<string, number> {
    const frequency = new Map<string, number>();
    for (const memo of this.allMemos) {
      const occurrences = extractMemoTagOccurrences(memo.content);
      for (const tag of occurrences) frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
      for (const tag of memo.tags) {
        if (!occurrences.includes(tag)) frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
      }
    }
    return frequency;
  }

  private getPopularTags(limit: number): string[] {
    const frequency = this.getTagFrequency();
    return Array.from(frequency.keys())
      .sort((left, right) => (frequency.get(right) ?? 0) - (frequency.get(left) ?? 0) || left.localeCompare(right))
      .slice(0, limit);
  }

  private sortMemos(memos: MemoRecord[]): MemoRecord[] {
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

  private openListContextMenu(memo: MemoRecord, event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("移动").setIcon("folder-input").onClick(() => this.openMoveMenu(memo)));
    if (!this.isMobileLayout()) {
      menu.addItem((item) => item.setTitle(memo.pinned ? "取消置顶" : "置顶").setIcon("pin").onClick(() => void this.togglePinnedFromList(memo)));
      menu.addItem((item) => item.setTitle("#").setIcon("hash").onClick(() => this.addTagFromList(memo)));
      menu.addItem((item) => item.setTitle("删除").setIcon("trash-2").onClick(() => void this.deleteMemoFromList(memo)));
    }
    menu.showAtMouseEvent(event);
  }

  private openMoveMenu(memo: MemoRecord): void {
    const notebooks = this.plugin.settings.memoNotebooks.filter((notebook) => notebook.id !== memo.notebookId);
    if (notebooks.length === 0) {
      new Notice("没有可移动的备忘录");
      return;
    }
    const menu = new Menu();
    for (const notebook of notebooks) {
      menu.addItem((item) => item.setTitle(notebook.name).setIcon(notebook.private ? "lock" : "notebook-tabs")
        .onClick(() => void this.moveMemoToNotebook(memo, notebook)));
    }
    menu.showAtPosition({ x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) });
  }

  private async moveMemoToNotebook(memo: MemoRecord, notebook: MemoNotebook): Promise<void> {
    if (notebook.private && !this.unlockedNotebookIds.has(notebook.id)) {
      await this.selectNotebook(notebook);
      if (!this.unlockedNotebookIds.has(notebook.id)) return;
    }
    try {
      await this.plugin.repository.moveMemoToNotebook(memo.file, notebook.id);
      await this.refresh(memo.file.path);
      new Notice(`已移动到“${notebook.name}”`);
    } catch (error) {
      console.error("[Markdown Memos] 移动 Memo 失败。", error);
      new Notice("移动失败");
    }
  }

  private addTagFromList(memo: MemoRecord): void {
    this.selectMemo(memo);
    void this.detailCards.find((card) => card.path === memo.file.path)?.addTag("#");
  }

  private async togglePinnedFromList(memo: MemoRecord): Promise<void> {
    try {
      await this.plugin.repository.togglePinned(memo.file);
      await this.refresh(memo.file.path);
    } catch (error) {
      console.error("[Markdown Memos] 更新置顶失败。", error);
      new Notice("更新置顶失败");
    }
  }

  private async deleteMemoFromList(memo: MemoRecord, keepMobileListOpen = false): Promise<void> {
    const mobile = this.isMobileLayout();
    if (!mobile && !(await confirmMemoDeletion(this.app, memo))) return;
    try {
      if (mobile) await this.plugin.repository.trashMemo(memo.file);
      else await this.plugin.repository.deleteMemo(memo.file);
      if (keepMobileListOpen && mobile) {
        this.mobileDetail = false;
      }
      await this.refresh();
    } catch (error) {
      console.error("[Markdown Memos] 删除失败。", error);
      new Notice("删除失败");
    }
  }

  private async toggleTaskFromList(memo: MemoRecord): Promise<void> {
    try {
      await this.plugin.repository.toggleTaskCompleted(memo.file);
      await this.refresh(memo.file.path);
    } catch (error) {
      console.error("[Markdown Memos] 更新任务失败。", error);
      new Notice("更新任务失败，请查看开发者控制台");
    }
  }

  private handleKeyboard(event: KeyboardEvent): void {
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

  private composerFocus(): void {
    window.setTimeout(() => {
      const selector = this.isMobileLayout() ? ".obsidian-memos-composer__input" : ".obsidian-memos-composer__title";
      this.detailContentEl?.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.focus();
    }, 0);
  }

  private destroyDetailCards(): void {
    for (const card of this.detailCards) card.destroy();
    this.detailCards = [];
  }

  private updateSelectedFeedItem(): void {
    const items = this.detailContentEl?.querySelectorAll<HTMLElement>(".obsidian-memos-feed-item");
    items?.forEach((item) => item.toggleClass("is-selected", item.dataset.memoPath === this.selectedPath));
  }

  private scrollSelectedIntoView(smooth: boolean): void {
    if (!this.selectedPath) return;
    const items = this.detailContentEl?.querySelectorAll<HTMLElement>(".obsidian-memos-feed-item");
    const selected = Array.from(items ?? []).find((item) => item.dataset.memoPath === this.selectedPath);
    const host = this.detailContentEl?.querySelector<HTMLElement>(".obsidian-memos-detail-card-host");
    if (!selected || !host) return;
    const top = Math.max(0, selected.offsetTop - host.offsetTop);
    host.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }

  private async toggleListPane(): Promise<void> {
    if (this.isMobileLayout()) {
      this.mobileDetail = !this.mobileDetail;
      this.updateLayoutState();
      return;
    }
    this.plugin.settings.listPaneCollapsed = !this.plugin.settings.listPaneCollapsed;
    await this.plugin.saveSettings();
    this.updateLayoutState();
  }

  private updateLayoutState(): void {
    if (!this.splitEl) {
      return;
    }
    this.contentEl.toggleClass("is-list-right", this.plugin.settings.listPanePosition === "right");
    this.contentEl.toggleClass("is-list-collapsed", this.plugin.settings.listPaneCollapsed);
    this.contentEl.toggleClass("is-mobile", this.isMobileLayout());
    this.containerEl.toggleClass("is-mobile", this.isMobileLayout());
    this.contentEl.toggleClass("is-mobile-detail", this.mobileDetail);
    this.contentEl.toggleClass("is-trash-mode", this.showTrash);
    this.mobileTrashToolbar?.toggleClass("is-visible", this.showTrash);
    this.mobileDrawerButton?.toggleClass("is-visible", this.isMobileLayout() && this.mobileDetail);
    this.splitEl.setCssProps({ "--memos-list-width": `${this.plugin.settings.listPaneWidth}px` });
  }

  private isMobileLayout(): boolean {
    // The app-level flag follows `this.app.emulateMobile(true)` in the
    // developer console. Platform.isMobile covers physical mobile builds while
    // keeping narrow desktop panes in the desktop layout.
    const appIsMobile = (this.app as unknown as { isMobile?: boolean }).isMobile;
    return appIsMobile === true || Platform.isMobile;
  }

  private startDividerDrag(event: PointerEvent): void {
    if (this.isMobileLayout() || this.plugin.settings.listPaneCollapsed) {
      return;
    }
    event.preventDefault();
    this.isDraggingDivider = true;
    this.contentEl.addClass("is-dragging-divider");
  }

  private moveDivider(event: PointerEvent): void {
    if (!this.isDraggingDivider || !this.splitEl) {
      return;
    }
    const bounds = this.splitEl.getBoundingClientRect();
    const width = this.plugin.settings.listPanePosition === "right" ? bounds.right - event.clientX : event.clientX - bounds.left;
    const nextWidth = Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, Math.round(width)));
    this.plugin.settings.listPaneWidth = nextWidth;
    this.splitEl.setCssProps({ "--memos-list-width": `${nextWidth}px` });
  }

  private stopDividerDrag(): void {
    if (!this.isDraggingDivider) {
      return;
    }
    this.isDraggingDivider = false;
    this.contentEl.removeClass("is-dragging-divider");
    void this.plugin.saveSettings();
  }

}

function addSelectOption(select: HTMLSelectElement, value: string, label: string): void {
  select.createEl("option", { text: label, attr: { value } });
}

function getMemoTagCount(memo: MemoRecord): number {
  return new Set([...memo.tags, ...extractMemoTagOccurrences(memo.content)]).size;
}

function isMemoSort(value: string | undefined): value is MemoSort {
  return value === "modified-desc"
    || value === "modified-asc"
    || value === "name-asc"
    || value === "name-desc"
    || value === "tags-desc"
    || value === "tags-asc";
}

function isFilterValue(value: string): value is "all" | "note" | "task-open" | "task-completed" | "archived" {
  return value === "all" || value === "note" || value === "task-open" || value === "task-completed" || value === "archived";
}

async function hashNotebookPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

class NotebookNameModal extends Modal {
  private submitted = false;

  public constructor(
    app: App,
    private readonly heading: string,
    private readonly resolveName: (name: string | null) => void,
    private readonly initial: string,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.titleEl.setText(this.heading);
    const input = this.contentEl.createEl("input", {
      cls: "obsidian-memos-modal-input",
      attr: { type: "text", placeholder: "备忘录名称", value: this.initial },
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
    const confirm = actions.createEl("button", { text: "确定", cls: "mod-cta", attr: { type: "button" } });
    const submit = (): void => {
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

  public override onClose(): void {
    if (!this.submitted) this.resolveName(null);
    this.contentEl.empty();
  }
}

class ConfirmActionModal extends Modal {
  private resolved = false;

  public constructor(
    app: App,
    private readonly message: string,
    private readonly resolveResult: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.titleEl.setText("确认操作");
    this.contentEl.createEl("p", { text: this.message });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
    const confirm = actions.createEl("button", { text: "确定", cls: "mod-cta", attr: { type: "button" } });
    cancel.addEventListener("click", () => this.finish(false));
    confirm.addEventListener("click", () => this.finish(true));
    confirm.focus();
  }

  public override onClose(): void {
    this.contentEl.empty();
    if (this.resolved) return;
    this.resolved = true;
    this.resolveResult(false);
  }

  private finish(confirmed: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveResult(confirmed);
    this.close();
  }
}

function confirmAction(app: App, message: string): Promise<boolean> {
  return new Promise((resolve) => new ConfirmActionModal(app, message, resolve).open());
}

class TextInputModal extends Modal {
  private resolved = false;

  public constructor(
    app: App,
    private readonly heading: string,
    private readonly placeholder: string,
    private readonly inputType: "text" | "password",
    private readonly resolveValue: (value: string | null) => void,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.titleEl.setText(this.heading);
    const input = this.contentEl.createEl("input", {
      cls: "obsidian-memos-modal-input",
      attr: { type: this.inputType, placeholder: this.placeholder },
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
    const confirm = actions.createEl("button", { text: "确定", cls: "mod-cta", attr: { type: "button" } });
    const submit = (): void => {
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

  public override onClose(): void {
    this.contentEl.empty();
    if (this.resolved) return;
    this.resolved = true;
    this.resolveValue(null);
  }
}

function requestText(
  app: App,
  heading: string,
  placeholder: string,
  inputType: "text" | "password" = "text",
): Promise<string | null> {
  return new Promise((resolve) => new TextInputModal(app, heading, placeholder, inputType, resolve).open());
}
