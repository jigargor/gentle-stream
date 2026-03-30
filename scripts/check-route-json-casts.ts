import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_ROOT = path.join(ROOT, "app", "api");
const FORBIDDEN_PATTERNS = [/request\.json\(\)\s+as\s+\{/g, /request\.json\(\)\)\s+as\s+\{/g];

function collectRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") files.push(fullPath);
  }
  return files;
}

function main() {
  const files = collectRouteFiles(API_ROOT);
  const offenders: string[] = [];

  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text))) offenders.push(filePath);
  }

  if (offenders.length > 0) {
    console.error("Found forbidden route body cast patterns. Use Zod parse helpers instead:");
    for (const filePath of offenders) {
      console.error(`- ${path.relative(ROOT, filePath)}`);
    }
    process.exit(1);
  }

  console.log("[validation:route-json-casts] No forbidden route JSON cast patterns found.");
}

main();
