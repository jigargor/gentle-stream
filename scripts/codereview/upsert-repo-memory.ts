import { promises as fs } from "fs";
import path from "path";
import { upsertRepoMemoryFact } from "@/lib/codereview/repo-memory";
import type { RepoMemoryFact } from "@/lib/codereview/types";

function parseArgs(): { repository: string; inputPath: string } {
  const repoArg = process.argv.find((arg) => arg.startsWith("--repository="));
  const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
  if (!repoArg) throw new Error("Missing --repository=<owner/name>");
  if (!inputArg) throw new Error("Missing --input=/path/to/fact.json");
  return {
    repository: repoArg.slice("--repository=".length),
    inputPath: inputArg.slice("--input=".length),
  };
}

async function main() {
  const args = parseArgs();
  const absolutePath = path.isAbsolute(args.inputPath)
    ? args.inputPath
    : path.join(process.cwd(), args.inputPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const fact = JSON.parse(raw) as RepoMemoryFact;
  await upsertRepoMemoryFact({
    repository: args.repository,
    fact: {
      ...fact,
      updatedAtIso: new Date().toISOString(),
    },
  });
  console.log(`Updated repo memory fact ${fact.id} for ${args.repository}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
