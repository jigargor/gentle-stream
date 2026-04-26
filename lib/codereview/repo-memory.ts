import { promises as fs } from "fs";
import path from "path";
import type { RepoMemoryFact } from "./types";

interface RepoMemoryStore {
  repository: string;
  updatedAtIso: string;
  facts: RepoMemoryFact[];
}

function getMemoryPath(): string {
  return path.join(process.cwd(), ".cursor", "code-review", "repo-memory.json");
}

export async function readRepoMemory(repository: string): Promise<RepoMemoryStore> {
  const memoryPath = getMemoryPath();
  try {
    const raw = await fs.readFile(memoryPath, "utf8");
    const parsed = JSON.parse(raw) as RepoMemoryStore;
    if (parsed.repository === repository) return parsed;
  } catch {
    // fall through to init.
  }
  return {
    repository,
    updatedAtIso: new Date().toISOString(),
    facts: [],
  };
}

export async function upsertRepoMemoryFact(input: {
  repository: string;
  fact: RepoMemoryFact;
}): Promise<void> {
  const current = await readRepoMemory(input.repository);
  const nextFacts = current.facts.filter((fact) => fact.id !== input.fact.id);
  nextFacts.push(input.fact);
  const next: RepoMemoryStore = {
    repository: input.repository,
    updatedAtIso: new Date().toISOString(),
    facts: nextFacts.sort((left, right) => left.id.localeCompare(right.id)),
  };
  const memoryPath = getMemoryPath();
  await fs.mkdir(path.dirname(memoryPath), { recursive: true });
  await fs.writeFile(memoryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
