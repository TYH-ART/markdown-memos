# Markdown Memos

Markdown Memos is a local-first quick-capture plugin that stores every memo as a plain Markdown file. It provides a fast memo composer, a searchable card timeline, tags, tasks, and file attachments without requiring a database or a remote service.

## Features

- Capture notes and tasks with a persistent quick composer.
- Store one memo per Markdown file with standard YAML frontmatter.
- Search, filter by tags, pin, edit, archive, and safely delete memos.
- Attach images, video, audio, and other files inside your vault.
- Use desktop and mobile layouts with light and dark themes.

The plugin is designed for Obsidian vaults and keeps your data portable as ordinary Markdown files.

## 中文说明

一个以 Obsidian Vault 为唯一数据源的快速记录插件。它提供 Memos 风格的顶部输入框与单列卡片流，同时坚持“一条 Memo 一个 Markdown 文件”。插件 ID 为 `markdown-memos`，不会与社区插件 Thino（旧 `obsidian-memos` ID）冲突。

## MVP 功能

- 独立 Memos View、Ribbon 入口和 `Open memos view` 命令
- 点击 `NOTE` 或按 `Cmd/Ctrl + Enter` 发布
- 每条 Memo 保存为 `YYYYMMDD-HHmmss.md`，同秒写入自动添加唯一后缀
- 标准 YAML Frontmatter：`created`、`modified`、`pinned`、`source`
- Markdown 原生渲染与 Obsidian 标签 Chip
- 编辑原文件、在 Obsidian 中打开原文件、通过 Obsidian 回收站安全删除
- 监听 Vault 的创建、修改、删除、重命名，以及 MetadataCache 标签变化
- 可配置保存目录，默认 `Memos`
- 跟随 Obsidian 深色/浅色主题，支持桌面端与移动端布局
- Apple Notes 风格双栏浏览，列表可左右切换、折叠和拖动调宽
- 标签筛选、即时搜索、置顶与日期分组
- 普通 Memo / 任务切换和任务完成状态
- 外部附件导入、Vault 文件链接，以及图片、视频、音频和通用文件卡
- Memos 风格右键菜单：复制、引用、分享、归档、发送到文件等

## 数据格式

```markdown
---
created: 2026-08-30T15:03:01+08:00
modified: 2026-08-30T15:03:01+08:00
pinned: false
source: markdown-memos
---

谷歌账号
abc@gmail.com
#账号
```

插件不使用数据库，也不依赖 Memos 服务端。卸载插件后，所有内容仍是普通的 Obsidian Markdown 文件。

附件默认由插件统一保存到 `Memos/_attachments/`。该目录位于 Vault 内，可由 Obsidian 索引、使用标准 `[[链接]]`，并能随 Vault 同步；设置页可以指定其他 Vault 相对目录。附件不存放在 `.obsidian/plugins/` 中，因为该目录在移动端、同步和插件更新时不适合作为用户数据目录。

## 开发

需要 Node.js 18 或更高版本。

```bash
npm install
npm run dev
npm run build
```

`npm run dev` 会监听源码变化，`npm run build` 会执行 TypeScript 检查并在项目根目录生成 `main.js`。开发测试时，将项目目录（或 `main.js`、`manifest.json`、`styles.css`）放入：

```text
<Vault>/.obsidian/plugins/markdown-memos/
```

然后在 Obsidian 的社区插件设置中启用。

## 设计参考与许可

交互信息层级参考了 [usememos/memos](https://github.com/usememos/memos) 的快速记录体验；本插件未复制或依赖其后端、RPC、数据库或用户系统，也未直接复用其前端源代码。Memos 本身以 MIT License 发布。

本项目采用 [MIT License](LICENSE)。
