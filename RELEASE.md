# Release checklist

1. Update package.json, package-lock.json, manifest.json and versions.json to the same version.
2. Run `npm ci`, `npm test` and `npm run build`.
3. Commit the source and generated main.js, then push the commit and matching version tag (without a `v` prefix).
4. Create a GitHub Release named `Markdown Memos <version>` for that tag.
5. Attach **main.js**, **manifest.json** and **styles.css** individually as release assets. Source archives and files committed to the repository do not satisfy this requirement.
6. Verify the uploaded asset sizes and hashes against the tagged files before publishing.
7. The Obsidian community review is separate. Check its result after publishing; a successful local build does not prove acceptance.

Reference: https://docs.obsidian.md/plugins/releasing/submit-plugin

## 0.2.35 compatibility review

- Set the minimum Obsidian version to 1.8.7: upload/download directory preferences use App.loadLocalStorage and App.saveLocalStorage, introduced in 1.8.7. Older installations must upgrade Obsidian before installing this version.
- Replace source-level require calls with typed dynamic imports. Load Node/Electron modules only on desktop; retain desktop file dialogs, external attachment opening, binary download verification and remembered directories.
- Handle the mobile open-link callback asynchronously without returning a Promise to a void callback. Keep existing native-link and browser fallback behavior.
- Replace control-character regex ranges with explicit character-code checks, preserving URL validation and attachment filename sanitization.
- Keep existing layout, memo data and notebook move ordering.

Behavior notices remain intentional: filesystem access is needed for user-selected desktop imports/exports outside the vault; clipboard access supports user copy/paste; vault enumeration lists notes and attachments; device-local directory preferences must not sync desktop paths onto mobile devices. Deprecated WebView fallbacks and existing CSS warnings are not the API-version failure. Artifact attestations are a release recommendation and are not supplied by a local build. Official acceptance requires a new community-directory scan; local tests do not prove acceptance.
