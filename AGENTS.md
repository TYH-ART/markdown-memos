# Project workflow

- Preserve existing icon positions when changing interactions unless the user requests layout changes.
- After completing each requested version, run the relevant checks and build, commit the source and bundled plugin files, then push to the configured upstream. The user has explicitly requested this workflow.
- Never commit deployment backups, vault notes, attachment samples, or credentials. If a push fails, report the local commit and the actual error; do not report an upload as successful.
- The user also requested installing completed versions into their active Obsidian vault. Preserve plugin data.json and vault contents when replacing main.js, styles.css and manifest.json.
- Do not operate the user's desktop for routine work. Copy plugin files through the filesystem; let the user restart the plugin. Publish releases through the GitHub API or CLI with main.js, manifest.json and styles.css attached individually.
