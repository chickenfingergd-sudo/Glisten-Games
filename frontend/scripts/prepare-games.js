const fs = require("fs");
const path = require("path");

const frontendRoot = path.resolve(__dirname, "..");
const repositoryGames = path.resolve(frontendRoot, "..", "games");
const frontendGames = path.join(frontendRoot, "games");

if (!fs.existsSync(repositoryGames)) {
  throw new Error(`Publish games folder not found: ${repositoryGames}`);
}

fs.rmSync(frontendGames, { recursive: true, force: true });
fs.cpSync(repositoryGames, frontendGames, { recursive: true });
require("./generate-games-manifest.js");
