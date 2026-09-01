import type { TFile } from "obsidian";

export interface ObsidianMemosSettings {
  memoFolder: string;
  attachmentFolder: string;
  listPanePosition: "left" | "right";
  listPaneCollapsed: boolean;
  listPaneWidth: number;
  defaultMemoType: MemoType;
  selectedFilter: MemoFilter;
  selectedTag: string | null;
}

export type MemoType = "note" | "task";

export type MemoFilter = "all" | "note" | "task-open" | "task-completed" | "archived";

export interface MemoAttachment {
  path: string;
  name: string;
  mime: string;
  size?: number;
  managed: boolean;
}

export interface CreateMemoOptions {
  type?: MemoType;
}

export interface MemoFrontmatter {
  [key: string]: unknown;
  created?: unknown;
  modified?: unknown;
  pinned?: unknown;
  source?: unknown;
}

export interface MemoRecord {
  file: TFile;
  content: string;
  created: Date;
  modified: Date;
  pinned: boolean;
  source?: string;
  tags: string[];
  type: MemoType;
  completed: boolean;
  completedAt?: Date;
  archived: boolean;
  attachments: MemoAttachment[];
  frontmatter: MemoFrontmatter;
}
