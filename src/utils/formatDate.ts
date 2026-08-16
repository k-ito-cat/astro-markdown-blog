const formatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export const toIsoDate = (date: Date) =>
  new Date(date).toISOString().split("T")[0];

export const formatJapaneseDate = (date: Date) => formatter.format(new Date(date));
