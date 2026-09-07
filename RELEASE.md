# Release checklist

1. Update package.json, package-lock.json, manifest.json and versions.json to the same version.
2. Run `npm ci`, `npm test` and `npm run build`.
3. Commit the source and generated main.js, then push the commit and matching version tag (without a `v` prefix).
4. Create a GitHub Release named `Markdown Memos <version>` for that tag.
5. Attach **main.js**, **manifest.json** and **styles.css** individually as release assets. Source archives and files committed to the repository do not satisfy this requirement.
6. Verify the uploaded asset sizes and hashes against the tagged files before publishing.
7. The Obsidian community review is separate. Check its result after publishing; a successful local build does not prove acceptance.

Reference: https://docs.obsidian.md/plugins/releasing/submit-plugin
