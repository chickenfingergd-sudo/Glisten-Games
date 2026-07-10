const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const gamesDir = path.join(root, "games");
const manifestPath = path.join(gamesDir, "manifest.json");
const ignoredDirectoryNames = new Set([".html-game-fixer-backups", "node_modules", ".git"]);

function titleFromFile(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function encodeGameUrl(relativePath) {
  return `games/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

function scanGames() {
  if (!fs.existsSync(gamesDir)) {
    fs.mkdirSync(gamesDir, { recursive: true });
  }

  const games = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirectoryNames.has(entry.name)) continue;
        walk(absolute);
        continue;
      }

      if (!/\.html?$/i.test(entry.name)) continue;

      const relative = path.relative(gamesDir, absolute).replace(/\\/g, "/");
      const stats = fs.statSync(absolute);
      games.push({
        id: relative.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        title: titleFromFile(entry.name),
        file: relative,
        url: encodeGameUrl(relative),
        size: stats.size,
        updated: stats.mtime.toISOString()
      });
    }
  }

  walk(gamesDir);
  return games.sort((a, b) => a.title.localeCompare(b.title));
}

const manifest = {
  generatedAt: new Date().toISOString(),
  games: scanGames()
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifest.games.length} games to ${path.relative(root, manifestPath)}`);
