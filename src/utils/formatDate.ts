const formatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export const toIsoDate = (date: Date) =>
  new Date(date).toISOString().split("T")[0];

/* 年は年の断層線が持つので、日付groupは月日だけを出す */
const monthDayFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export const formatJapaneseDate = (date: Date) =>
  formatter.format(new Date(date));

export const formatJapaneseMonthDay = (date: Date) =>
  monthDayFormatter.format(new Date(date));
