/**
 * Logs wall time for database (or any async) work. Use for spotting slow paths in server logs.
 */
export async function withDbTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - start;
    if (ms > 8) console.info(`[db-timing] ${label} ${ms}ms`);
  }
}
