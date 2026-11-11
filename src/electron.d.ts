declare module "electron" {
  export const remote: { dialog: import("./services/DesktopDialog").DesktopDialog } | undefined;
  export const webUtils: { getPathForFile(file: File): string } | undefined;
  export const shell: { openPath(path: string): Promise<string> };
}
declare module "@electron/remote" {
  export const dialog: import("./services/DesktopDialog").DesktopDialog;
}
