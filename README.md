# Glisten Games

A glossy local launcher for HTML games with a customizable library, fullscreen player, and browser-style proxy panel.

## Run Locally

```powershell
npm install
npm start
```

Then open:

```text
http://localhost:4173
```

## Add Games

Drop `.html` game files, plus any assets they need, into the `games` folder. Subfolders work too.

For the local Node version, refresh the site or click the refresh button and the server rescans the folder automatically.

## GitHub Pages

GitHub Pages is static hosting, so it can serve the site and games, but it cannot run `server.js`, `/api/games`, `/api/proxy`, or the live proxy backend.

To update the static game list before publishing:

```powershell
npm run build:static
```

This writes `games/manifest.json`, which lets the GitHub Pages version show the games in the library.

## Publish With GitHub Desktop

1. Open this folder in GitHub Desktop.
2. Publish the repository to GitHub.
3. On GitHub, open the repository settings.
4. Go to **Pages**.
5. Set **Source** to **GitHub Actions**.
6. Push to `main`; the included workflow will deploy the static site.

## Vercel Services

The Vercel deployment uses two services in one project: the website at `/`, and the live proxy backend for `/uv/`, `/baremux/`, `/epoxy/`, `/service/`, `/wisp/`, `/sw.js`, and `/api/proxy`.

Before deploying, open the Vercel project settings and set **Framework Preset** to **Services**. Both that dashboard setting and the `services` block in `vercel.json` are required.

After that, push commits to `main`. Vercel will rebuild the game manifest, publish the static site, and deploy the proxy backend together.
