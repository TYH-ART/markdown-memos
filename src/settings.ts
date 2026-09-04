import { App, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type ObsidianMemosPlugin from "./main";
import { normalizeMemoFolder } from "./utils";

export class ObsidianMemosSettingTab extends PluginSettingTab {
  public constructor(
    app: App,
    private readonly plugin: ObsidianMemosPlugin,
  ) {
    super(app, plugin);
  }

  public override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Memo 保存文件夹",
        desc: "新 Memo 将写入此目录。修改路径不会移动或删除旧目录中的文件。",
        render: (setting) => {
          setting.addText((text) => {
            text.setPlaceholder("Memos").setValue(this.plugin.settings.memoFolder);
            text.onChange(async (value) => {
              this.plugin.settings.memoFolder = normalizeMemoFolder(value);
              await this.plugin.saveSettings();
              this.plugin.scheduleViewRefresh();
            });
          });
        },
      },
      {
        name: "附件保存位置",
        desc: "留空时使用 <Memo 保存文件夹>/_attachments。该目录位于 Vault 内，可同步并支持标准 Obsidian 链接。",
        render: (setting) => {
          setting.addText((text) => {
            text.setPlaceholder("Memos/_attachments").setValue(this.plugin.settings.attachmentFolder);
            text.onChange(async (value) => {
              this.plugin.settings.attachmentFolder = value.trim();
              await this.plugin.saveSettings();
            });
          });
        },
      },
      {
        name: "新建 Memo 默认类型",
        desc: "Composer 打开时默认创建普通 Memo 或任务。",
        render: (setting) => {
          setting.addDropdown((dropdown) => {
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
        },
      },
      {
        name: "缩略列表位置",
        desc: "Apple Notes 风格的 Memo 列表显示在详情区左侧或右侧。",
        render: (setting) => {
          setting.addDropdown((dropdown) => {
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
        },
      },
      {
        name: "列表默认展开",
        desc: "控制 Memos View 首次打开时是否显示缩略列表。",
        render: (setting) => {
          setting.addToggle((toggle) => {
            toggle.setValue(!this.plugin.settings.listPaneCollapsed).onChange(async (expanded) => {
              this.plugin.settings.listPaneCollapsed = !expanded;
              await this.plugin.saveSettings();
              this.plugin.scheduleViewRefresh();
            });
          });
        },
      },
      {
        name: "缩略列表宽度",
        desc: "桌面端列表栏宽度，范围 240–420 px。",
        render: (setting) => {
          setting.addSlider((slider) => {
            slider.setLimits(240, 420, 10).setValue(this.plugin.settings.listPaneWidth).onChange(async (value) => {
              this.plugin.settings.listPaneWidth = Math.round(value);
              await this.plugin.saveSettings();
              this.plugin.scheduleViewRefresh();
            });
          });
        },
      },
      {
        name: "输入区标签",
        desc: "设置输入区标签栏的三个标签及其顺序。留空时继续使用 Memo 中已有的常用标签。",
        render: (setting) => renderComposerTagControls(setting.controlEl, this.plugin),
      },
    ];
  }

  public override display(): void {
    this.containerEl.empty();

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
          .onChange(async (value) => {
            this.plugin.settings.listPaneWidth = Math.round(value);
            await this.plugin.saveSettings();
            this.plugin.scheduleViewRefresh();
          });
      });

    new Setting(this.containerEl)
      .setName("输入区标签")
      .setDesc("设置输入区标签栏的三个标签及其顺序。留空时继续使用 Memo 中已有的常用标签。");
    renderComposerTagControls(this.containerEl, this.plugin);

    this.containerEl.createEl("p", {
      cls: "setting-item-description",
      text: `当前读取目录：${this.plugin.repository.folder}`,
    });
  }
}

function renderComposerTagControls(container: HTMLElement, plugin: ObsidianMemosPlugin): void {
  const host = container.createDiv({ cls: "obsidian-memos-composer-tag-settings" });
  const values = Array.from({ length: 3 }, (_, index) => plugin.settings.composerTags[index] ?? "");

  const save = async (): Promise<void> => {
    plugin.settings.composerTags = values.map(normalizeComposerTag).filter(Boolean);
    await plugin.saveSettings();
    plugin.scheduleViewRefresh();
  };

  const render = (): void => {
    host.empty();
    values.forEach((value, index) => {
      const row = host.createDiv({ cls: "obsidian-memos-composer-tag-settings__row" });
      const input = row.createEl("input", {
        attr: { type: "text", value, placeholder: `标签 ${index + 1}（例如 #工作）`, "aria-label": `输入区标签 ${index + 1}` },
      });
      input.addEventListener("change", () => {
        values[index] = normalizeComposerTag(input.value);
        void save();
      });
      const up = row.createEl("button", { text: "↑", attr: { type: "button", "aria-label": "上移" } });
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        if (index === 0) return;
        [values[index - 1], values[index]] = [values[index], values[index - 1]];
        void save().then(render);
      });
      const down = row.createEl("button", { text: "↓", attr: { type: "button", "aria-label": "下移" } });
      down.disabled = index === values.length - 1;
      down.addEventListener("click", () => {
        if (index === values.length - 1) return;
        [values[index], values[index + 1]] = [values[index + 1], values[index]];
        void save().then(render);
      });
    });
  };

  render();
}

function normalizeComposerTag(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}
