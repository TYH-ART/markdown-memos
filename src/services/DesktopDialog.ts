interface DesktopDialog {
  showSaveDialog(options: { defaultPath: string; properties: string[] }): Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog(options: {
    title: string;
    properties: string[];
    defaultPath?: string;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export function getDesktopDialog(): DesktopDialog | undefined {
  try {
    const remote = require("electron").remote ?? require("@electron/remote");
    return remote.dialog;
  } catch {
    return undefined;
  }
}
