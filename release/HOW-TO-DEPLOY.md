# Deploy Room 214 on Vercel Drop

Two files are in this folder:

- `room214-vercel-static.zip` (2.0 MB): the finished build. `index.html`, `favicon.svg` and
  the `assets/` folder sit directly at the root of the zip. **Use this one.** Vercel has
  nothing to build, it just serves the files.
- `room214-vercel-source.zip` (0.1 MB): the project source with `vercel.json`. Vercel runs
  `npm run build` and serves `dist/`. Only use it if you want Vercel to build the game.

## Steps

1. Go to **https://vercel.com/drop**.
2. Drag `room214-vercel-static.zip` onto the page (or click to pick it).
3. Sign in if asked (GitHub, GitLab, Bitbucket or email all work).
4. Pick a project name (for example `room214`).
5. Click **Deploy**. When it finishes, open the link Vercel shows you.

The game needs nothing else: every file (code, styles, fonts, icon) is inside the zip and
loads from relative paths, nothing comes from a CDN.

## If you see a 404

- **404 on the home page:** the zip had a folder around the files. Drop the static zip as it is (`index.html` must be at the zip root), or re-zip the *contents* of `dist/`, not the folder.
- **Blank page, 404s for `assets/...`:** files were renamed or moved. Keep `assets/` next to `index.html` and don't rename anything inside it (the names in `index.html` must match).
- **Source zip deployed but 404 everywhere:** the build was skipped. In the project settings set Framework = Vite, Build Command = `npm run build`, Output Directory = `dist` (the included `vercel.json` sets these), then redeploy.
- **Old version or 404 after a redeploy:** your browser kept the previous files. Hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) or open the link in a private window.
