declare module "electron" {
  export const remote: {
    dialog: {
      showSaveDialog(options: { defaultPath: string; properties: string[] }): Promise<{ canceled: boolean; filePath?: string }>;
    };
  };
}
