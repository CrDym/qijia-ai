export function homeToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dueGroup(dueOn: string, today: string) {
  if (!dueOn) return "undated";
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  if (dueOn <= addDays(today, 7)) return "upcoming";
  return "later";
}
