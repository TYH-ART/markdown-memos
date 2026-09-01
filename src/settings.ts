import { App, PluginSettingTab, Setting } from "obsidian";
import type ObsidianMemosPlugin from "./main";
import { normalizeMemoFolder } from "./utils";

export class ObsidianMemosSettingTab extends PluginSettingTab {
  public constructor(
    app: App,
    private readonly plugin: ObsidianMemosPlugin,
  ) {
    super(app, plugin);
  }

  public override display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Markdown Memos" });

    new Setting(this.containerEl)
      .setName("Memo 保存文件夹")
      .setDesc("新 Memo 将写入此目录。修改路径不会移动或删除旧目录中的文件。")
      .addText((text) => {
        text.setPlaceholder("Memos").setValue(this.plugin.settings.memoFolder);
        text.onChange(async (value) => {
          this.plugin.settings.memoFolder = normalizeMemoFolder(value);
          await this.plugin.saveSettings();
          this.plugin.scheduleViewRefresh();
        });
      });

    new Setting(this.containerEl)
      .setName("附件保存位置")
      .setDesc("留空时使用 <Memo 保存文件夹>/_attachments。该目录位于 Vault 内，可同步并支持标准 Obsidian 链接。")
      .addText((text) => {
        text.setPlaceholder("Memos/_attachments").setValue(this.plugin.settings.attachmentFolder);
        text.onChange(async (value) => {
          this.plugin.settings.attachmentFolder = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setName("新建 Memo 默认类型")
      .setDesc("Composer 打开时默认创建普通 Memo 或任务。")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("note", "普通 Memo")
          .addOption("task", "任务")
          .setValue(this.plugin.settings.defaultMemoType)
          .onChange(async (value) => {
            this.plugin.settings.defaultMemoType = value === "task" ? "task" : "note";
            await this.plugin.saveSettings();
            this.plugin.scheduleViewRefresh();
          });
      });

    new Setting(this.containerEl)
      .setName("缩略列表位置")
      .setDesc("Apple Notes 风格的 Memo 列表显示在详情区左侧或右侧。")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("right", "右侧（默认）")
          .addOption("left", "左侧")
          .setValue(this.plugin.settings.listPanePosition)
          .onChange(async (value) => {
            this.plugin.settings.listPanePosition = value === "left" ? "left" : "right";
            await this.plugin.saveSettings();
            this.plugin.scheduleViewRefresh();
          });
      });

    new Setting(this.containerEl)
      .setName("列表默认展开")
      .setDesc("控制 Memos View 首次打开时是否显示缩略列表。")
      .addToggle((toggle) => {
        toggle.setValue(!this.plugin.settings.listPaneCollapsed).onChange(async (expanded) => {
          this.plugin.settings.listPaneCollapsed = !expanded;
          await this.plugin.saveSettings();
          this.plugin.scheduleViewRefresh();
        });
      });

    new Setting(this.containerEl)
      .setName("缩略列表宽度")
      .setDesc("桌面端列表栏宽度，范围 240–420 px。")
      .addSlider((slider) => {
        slider
          .setLimits(240, 420, 10)
          .setValue(this.plugin.settings.listPaneWidth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.listPaneWidth = Math.round(value);
            await this.plugin.saveSettings();
            this.plugin.scheduleViewRefresh();
          });
      });

    this.containerEl.createEl("p", {
      cls: "setting-item-description",
      text: `当前读取目录：${this.plugin.repository.folder}`,
    });
  }
}
