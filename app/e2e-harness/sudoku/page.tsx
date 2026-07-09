import { notFound } from "next/navigation";
import SudokuCard from "@/components/games/SudokuCard";
import { generateSudoku } from "@/lib/games/sudokuGenerator";

/** Dev/CI-only Sudoku surface for Playwright smoke tests — not linked in production nav. */
export default function SudokuE2eHarnessPage() {
  if (process.env.E2E_HARNESS !== "1") {
    notFound();
  }

  const puzzle = generateSudoku("easy");

  return (
    <main style={{ maxWidth: "32rem", margin: "2rem auto", padding: "0 1rem" }}>
      <SudokuCard
        puzzle={puzzle}
        embedded
        cloudSaveEnabled={false}
        metricsEnabled={false}
      />
    </main>
  );
}
