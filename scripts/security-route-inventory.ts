import { promises as fs } from "fs";
import path from "path";

interface RouteInventoryItem {
  route: string;
  methods: string[];
  authModel:
    | "cron_secret"
    | "admin_guard"
    | "session_user"
    | "public"
    | "mixed_or_unknown";
  usesServiceRoleDbClient: boolean;
  p0Flags: string[];
}

async function listRouteFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listRouteFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") out.push(full);
  }
  return out;
}

function detectAuthModel(content: string): RouteInventoryItem["authModel"] {
  const hasCron = content.includes("isAuthorizedCronRequest(");
  const hasAdmin = content.includes("isAdmin(");
  const hasSession = content.includes("getSessionUserId(");
  if (hasCron) return "cron_secret";
  if (hasAdmin) return "admin_guard";
  if (hasSession) return "session_user";
  if (hasCron || hasAdmin || hasSession) return "mixed_or_unknown";
  return "public";
}

function detectMethods(content: string): string[] {
  const candidates = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
  return candidates.filter((m) =>
    new RegExp(`export\\s+async\\s+function\\s+${m}\\s*\\(`).test(content)
  );
}

function buildP0Flags(route: string, content: string): string[] {
  const flags: string[] = [];
  if (route === "/api/feed" && content.includes("searchParams.get(\"userId\")")) {
    flags.push("query-user-id-present");
  }
  if (content.includes("runIngestAgent(") && !content.includes("isAuthorizedCronRequest(")) {
    flags.push("public-expensive-ingest-path");
  }
  if (content.includes("error instanceof Error ? error.message")) {
    flags.push("raw-error-message-exposed");
  }
  return flags;
}

async function main() {
  const repoRoot = process.cwd();
  const apiRoot = path.join(repoRoot, "app", "api");
  const routeFiles = await listRouteFiles(apiRoot);
  const items: RouteInventoryItem[] = [];

  for (const file of routeFiles.sort()) {
    const content = await fs.readFile(file, "utf8");
    const rel = file.replace(/\\/g, "/").replace(`${repoRoot.replace(/\\/g, "/")}/app/api`, "");
    const route = `/api${rel.replace(/\/route\.ts$/, "")}`;
    items.push({
      route,
      methods: detectMethods(content),
      authModel: detectAuthModel(content),
      usesServiceRoleDbClient: content.includes('from "@/lib/db/client"'),
      p0Flags: buildP0Flags(route, content),
    });
  }

  const outputDir = path.join(repoRoot, "security");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "route-inventory.json");
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalRoutes: items.length,
        items,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
