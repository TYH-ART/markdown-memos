import { normalizePath } from "obsidian";

export const DEFAULT_MEMO_FOLDER = "Memos";

export function normalizeMemoFolder(input: string): string {
  const segments = input
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");

  return normalizePath(segments.join("/") || DEFAULT_MEMO_FOLDER);
}

export function isPathInsideFolder(path: string, folder: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedFolder = normalizeMemoFolder(folder);
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatMemoBasename(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(
    date.getSeconds(),
  )}`;
}

export function formatLocalIso(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffset / 60));
  const offsetRemainder = pad(absoluteOffset % 60);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}${sign}${offsetHours}:${offsetRemainder}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface MemoContentParts {
  title: string;
  body: string;
}

export function splitMemoContent(content: string): MemoContentParts {
  const normalized = content.replace(/\r\n/g, "\n");
  const lineBreak = normalized.indexOf("\n");
  if (lineBreak === -1) {
    return { title: normalized, body: "" };
  }
  const title = normalized.slice(0, lineBreak);
  const remainder = normalized.slice(lineBreak + 1);
  return { title, body: remainder.startsWith("\n") ? remainder.slice(1) : remainder };
}

export function joinMemoContent(title: string, body: string): string {
  const normalizedTitle = title.replace(/[\r\n]+/g, " ");
  return body ? `${normalizedTitle}\n\n${body}` : normalizedTitle;
}

export function extractExternalUrls(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s<>()\x5B\x5D{}"']+/gi) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, ""))));
}

export function extractMemoTagOccurrences(content: string): string[] {
  const tags: string[] = [];
  const pattern = /#([\p{L}\p{N}_/-]+)/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const name = match[1];
    if (name) tags.push(`#${name}`);
  }
  return tags;
}

export function extractMemoTags(content: string): string[] {
  return Array.from(new Set(extractMemoTagOccurrences(content)));
}
