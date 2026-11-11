import { Platform } from "obsidian";

export interface DesktopDialog {
  showSaveDialog(options: { defaultPath: string; properties: string[] }): Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog(options: {
    title: string;
    properties: string[];
    defaultPath?: string;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export async function getDesktopDialog(): Promise<DesktopDialog | undefined> {
  if (!Platform.isDesktopApp) return;
  try {
    const remote = (await import("electron")).remote ?? await import("@electron/remote");
    return remote.dialog;
  } catch {
    return undefined;
  }
}
