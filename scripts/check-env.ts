import { ZodError } from "zod";
import { parseEnv } from "@/lib/env";

function main() {
  try {
    parseEnv(process.env);
    console.log("[env:check] Environment schema validation passed.");
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("[env:check] Invalid environment variables:");
      for (const issue of error.issues) {
        const key = issue.path.join(".") || "(root)";
        console.error(`- ${key}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw error;
  }
}

main();
