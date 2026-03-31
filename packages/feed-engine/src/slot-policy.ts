export function shouldBeGame(sectionIndex: number, gameRatio: number): boolean {
  if (gameRatio <= 0) return false;
  if (gameRatio >= 1) return true;
  const period = Math.round(1 / gameRatio);
  return sectionIndex % period === period - 1;
}
