import { promises as fs } from "fs";
import path from "path";
import { buildContextPackage } from "@/lib/codereview/context-package";

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readRuleFiles(rootPath: string): Promise<Array<{ path: string; content: string }>> {
  const rulesPath = path.join(rootPath, ".cursor", "rules");
  try {
    const entries = await fs.readdir(rulesPath, { withFileTypes: true });
    const rows: Array<{ path: string; content: string }> = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absolutePath = path.join(rulesPath, entry.name);
      const content = await fs.readFile(absolutePath, "utf8");
      rows.push({ path: absolutePath, content });
    }
    return rows;
  } catch {
    return [];
  }
}

async function main() {
  const rootPath = process.cwd();
  const trustedSections: Array<{
    sectionId: string;
    trustZone: "trusted";
    sourcePath: string;
    content: string;
  }> = [];
  const untrustedSections: Array<{
    sectionId: string;
    trustZone: "untrusted";
    sourcePath: string;
    content: string;
  }> = [];

  const trustedFiles = [
    path.join(rootPath, "AGENTS.md"),
    path.join(rootPath, "API.md"),
    path.join(rootPath, "README.md"),
  ];

  for (const absolutePath of trustedFiles) {
    const content = await readIfExists(absolutePath);
    if (!content) continue;
    trustedSections.push({
      sectionId: path.basename(absolutePath),
      trustZone: "trusted",
      sourcePath: absolutePath,
      content,
    });
  }

  const ruleFiles = await readRuleFiles(rootPath);
  for (const ruleFile of ruleFiles) {
    trustedSections.push({
      sectionId: `rule:${path.basename(ruleFile.path)}`,
      trustZone: "trusted",
      sourcePath: ruleFile.path,
      content: ruleFile.content,
    });
  }

  const prSummaryPath = path.join(rootPath, ".cursor", "code-review", "latest-pr-summary.md");
  const prSummary = await readIfExists(prSummaryPath);
  if (prSummary) {
    untrustedSections.push({
      sectionId: "pr-summary",
      trustZone: "untrusted",
      sourcePath: prSummaryPath,
      content: prSummary,
    });
  }

  const packageId = `ctx-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const contextPackage = buildContextPackage({
    packageId,
    trustedSections,
    untrustedSections,
  });

  const outputDir = path.join(rootPath, ".cursor", "code-review", "context-packages");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${contextPackage.packageId}.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(contextPackage, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
