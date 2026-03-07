export function getReadingTimeMinutes(
  text: string,
  wordsPerMinute = 200,
): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const words = trimmed.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

export function formatReadingTimeMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (hours > 0) {
    return `${hours} h ${remainingMinutes} min`;
  }
  return `${remainingMinutes} min`;
}
