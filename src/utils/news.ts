export function sortNewsByDateDesc<T extends { data: { date: Date } }>(
  entries: T[],
): T[] {
  return [...entries].sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
}

export function getLatestNews<T extends { data: { date: Date } }>(
  entries: T[],
): T | undefined {
  return entries.reduce<T | undefined>((latest, entry) => {
    if (!latest) return entry;
    return entry.data.date > latest.data.date ? entry : latest;
  }, undefined);
}
