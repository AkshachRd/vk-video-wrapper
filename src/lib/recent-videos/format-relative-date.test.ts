import { describe, expect, it } from "vitest";

import { formatRelativeDate } from "./format-relative-date";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeDate", () => {
  it("returns 'только что' for very recent times", () => {
    expect(formatRelativeDate(1000, 1000 + 30_000)).toBe("только что");
  });

  it("returns minutes", () => {
    expect(formatRelativeDate(0, 5 * MINUTE)).toBe("5 мин. назад");
  });

  it("returns hours", () => {
    expect(formatRelativeDate(0, 3 * HOUR)).toBe("3 ч. назад");
  });

  it("returns 'вчера' within the previous day", () => {
    expect(formatRelativeDate(0, 30 * HOUR)).toBe("вчера");
  });

  it("returns days", () => {
    expect(formatRelativeDate(0, 3 * DAY)).toBe("3 дн. назад");
  });

  it("formats an absolute date past a week", () => {
    const ms = Date.UTC(2026, 0, 15);
    const result = formatRelativeDate(ms, ms + 30 * DAY);

    expect(result).toContain("2026");
    expect(result).not.toContain("назад");
  });
});
