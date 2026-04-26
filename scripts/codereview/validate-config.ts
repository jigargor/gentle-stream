import { promises as fs } from "fs";
import path from "path";

const requiredFragments = [
  "modes:",
  "max:",
  "reviewers:",
  "adjudicator:",
  "tieBreakPriority:",
  "audit:",
  "contextPackaging:",
];

async function main() {
  const configPath = path.join(process.cwd(), ".codereview.yml");
  const raw = await fs.readFile(configPath, "utf8");
  const missing = requiredFragments.filter((fragment) => !raw.includes(fragment));
  if (missing.length > 0) {
    throw new Error(`.codereview.yml is missing required sections: ${missing.join(", ")}`);
  }
  console.log("Code review config looks valid.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
