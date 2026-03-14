import fs from "node:fs/promises";
import path from "node:path";

const [,, inputPath, outputPath, releaseNotes = "", pubDate = new Date().toISOString()] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/generate-updater-json.mjs <input-latest.json> <output-json> [notes] [pubDate]");
}

const raw = await fs.readFile(inputPath, "utf8");
const parsed = JSON.parse(raw);

const payload = {
  version: parsed.version,
  notes: releaseNotes,
  pub_date: pubDate,
  platforms: parsed.platforms,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
