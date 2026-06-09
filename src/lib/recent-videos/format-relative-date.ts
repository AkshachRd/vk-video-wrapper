const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeDate(ms: number, nowMs: number): string {
  const diff = nowMs - ms;

  if (diff < MINUTE) {
    return "только что";
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)} мин. назад`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} ч. назад`;
  }
  if (diff < 2 * DAY) {
    return "вчера";
  }
  if (diff < 7 * DAY) {
    return `${Math.floor(diff / DAY)} дн. назад`;
  }

  return new Intl.DateTimeFormat("ru-RU").format(new Date(ms));
}
