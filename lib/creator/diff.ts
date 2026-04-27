/**
 * Myers diff (word-level) for "before vs after" display in the Improve suggestion card.
 * Returns an array of { text, type } tokens where type is "equal" | "insert" | "delete".
 */

export interface DiffToken {
  text: string;
  type: "equal" | "insert" | "delete";
}

type EditOp = "eq" | "ins" | "del";

function lcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return dp;
}

function backtrack(dp: number[][], a: string[], b: string[], i: number, j: number): Array<[EditOp, string]> {
  if (i === 0 && j === 0) return [];
  if (i === 0) return [...backtrack(dp, a, b, i, j - 1), ["ins", b[j - 1]!]];
  if (j === 0) return [...backtrack(dp, a, b, i - 1, j), ["del", a[i - 1]!]];
  if (a[i - 1] === b[j - 1]) return [...backtrack(dp, a, b, i - 1, j - 1), ["eq", a[i - 1]!]];
  if (dp[i - 1]![j]! >= dp[i]![j - 1]!) return [...backtrack(dp, a, b, i - 1, j), ["del", a[i - 1]!]];
  return [...backtrack(dp, a, b, i, j - 1), ["ins", b[j - 1]!]];
}

export function diffWords(before: string, after: string): DiffToken[] {
  const splitWords = (s: string) => s.match(/\S+|\s+/g) ?? [];
  const aWords = splitWords(before);
  const bWords = splitWords(after);

  // Cap size to avoid quadratic blowup on very long texts
  const A = aWords.slice(0, 600);
  const B = bWords.slice(0, 600);

  const dp = lcs(A, B);
  const ops = backtrack(dp, A, B, A.length, B.length);

  const tokens: DiffToken[] = ops.map(([op, word]) => ({
    text: word,
    type: op === "eq" ? "equal" : op === "ins" ? "insert" : "delete",
  }));

  return tokens;
}
