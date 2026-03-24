/**
 * External references for rules (stable, neutral). Opens in a new tab.
 */
export const GAME_HOW_TO_URL = {
  sudoku: "https://en.wikipedia.org/wiki/Sudoku",
  killer_sudoku: "https://en.wikipedia.org/wiki/Killer_sudoku",
  nonogram: "https://en.wikipedia.org/wiki/Nonogram",
} as const;

interface GameHowToPlayLinkProps {
  href: string;
}

export function GameHowToPlayLink({ href }: GameHowToPlayLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontFamily: "'IM Fell English', Georgia, serif",
        fontSize: "0.72rem",
        color: "#1a472a",
        textDecoration: "underline",
        textUnderlineOffset: "2px",
      }}
    >
      How to play
    </a>
  );
}
