import { promises as fs } from "fs";
import path from "path";

interface RlsTableStatus {
  table: string;
  rlsEnabled: boolean;
  policyCount: number;
}

interface ServiceRoleRouteUsage {
  route: string;
  authSignals: string[];
}

async function listFiles(dir: string, filter: (file: string) => boolean): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(full, filter)));
      continue;
    }
    if (entry.isFile() && filter(full)) out.push(full);
  }
  return out;
}

function extractTableNames(sql: string): string[] {
  const names = new Set<string>();
  const tableRe = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(sql)) !== null) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}

async function main() {
  const repoRoot = process.cwd();
  const migrationDir = path.join(repoRoot, "lib", "db", "migrations");
  const migrations = await listFiles(migrationDir, (f) => f.endsWith(".sql"));
  const mergedSql = (
    await Promise.all(migrations.sort().map((file) => fs.readFile(file, "utf8")))
  ).join("\n\n");

  const tables = extractTableNames(mergedSql);
  const rlsStatuses: RlsTableStatus[] = tables
    .map((table) => {
      const rlsEnabled = new RegExp(
        `ALTER TABLE\\s+${table}\\s+ENABLE ROW LEVEL SECURITY`,
        "i"
      ).test(mergedSql);
      const policyCount = (mergedSql.match(
        new RegExp(`CREATE POLICY\\s+[^\\n]+\\s+ON\\s+${table}\\b`, "gi")
      ) || []).length;
      return { table, rlsEnabled, policyCount };
    })
    .sort((a, b) => a.table.localeCompare(b.table));

  const routeFiles = await listFiles(
    path.join(repoRoot, "app", "api"),
    (f) => f.endsWith(path.join("route.ts")) || f.endsWith("/route.ts")
  );

  const serviceRoleRoutes: ServiceRoleRouteUsage[] = [];
  for (const file of routeFiles) {
    const content = await fs.readFile(file, "utf8");
    if (!content.includes('from "@/lib/db/client"')) continue;

    const authSignals: string[] = [];
    if (content.includes("getSessionUserId(")) authSignals.push("session_user");
    if (content.includes("isAdmin(")) authSignals.push("admin_guard");
    if (content.includes("isAuthorizedCronRequest(")) authSignals.push("cron_secret");
    if (authSignals.length === 0) authSignals.push("none_detected");

    const rel = file.replace(/\\/g, "/").replace(`${repoRoot.replace(/\\/g, "/")}/app/api`, "");
    serviceRoleRoutes.push({
      route: `/api${rel.replace(/\/route\.ts$/, "")}`,
      authSignals,
    });
  }

  const outputDir = path.join(repoRoot, "security");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "rls-boundary-audit.json");
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary: {
          totalTables: rlsStatuses.length,
          tablesWithRlsEnabled: rlsStatuses.filter((t) => t.rlsEnabled).length,
          tablesWithPolicies: rlsStatuses.filter((t) => t.policyCount > 0).length,
          serviceRoleRouteCount: serviceRoleRoutes.length,
        },
        tableRlsStatus: rlsStatuses,
        serviceRoleRouteUsage: serviceRoleRoutes.sort((a, b) =>
          a.route.localeCompare(b.route)
        ),
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
