import { notFound } from "next/navigation";
import GameSlot from "@/components/games/GameSlot";

/** Dev/CI-only Sudoku surface for Playwright smoke tests — not linked in production nav. */
export default function SudokuE2eHarnessPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.E2E_HARNESS !== "1"
  ) {
    notFound();
  }

  return (
    <main style={{ maxWidth: "32rem", margin: "2rem auto", padding: "0 1rem" }}>
      <GameSlot gameType="sudoku" difficulty="easy" persistCloud={false} />
    </main>
  );
}
