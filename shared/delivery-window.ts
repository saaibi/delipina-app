export const deliveryDay = (value: string | Date) =>
  new Date(+new Date(value) - 5 * 3600000).toISOString().slice(0, 10);
export function deliverySchedule(settings: any, day: string) {
  const weekday = new Date(day + "T12:00:00Z").getUTCDay() || 7;
  const base = settings?.weeklySchedule?.[weekday];
  return {
    enabled: base?.enabled ?? true,
    open: base?.open ?? `${String(settings?.open ?? 6).padStart(2, "0")}:00`,
    close:
      base?.close ?? `${String(settings?.close ?? 18).padStart(2, "0")}:00`,
    leadHours: base?.leadHours ?? settings?.leadHours ?? 2,
  };
}
export function deliveryClosing(settings: any, start: string) {
  if (!start || !Number.isFinite(+new Date(start))) return "";
  const day = deliveryDay(start);
  const schedule = deliverySchedule(settings, day);
  return new Date(
    +new Date(`${day}T${schedule.close}:00-05:00`) -
      schedule.leadHours * 3600000,
  ).toISOString();
}
export function suggestedDelivery(
  settings: any,
  business: any,
  now = new Date(),
) {
  const today = deliveryDay(now);
  for (let offset = 0; offset < 45; offset++) {
    const date = new Date(today + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.toISOString().slice(0, 10),
      schedule = deliverySchedule(settings, day);
    if (
      !schedule.enabled ||
      (business?.closedAt && business.day === day) ||
      (business?.intakeClosedAt && business.day === day)
    )
      continue;
    const open = +new Date(`${day}T${schedule.open}:00-05:00`),
      close =
        +new Date(`${day}T${schedule.close}:00-05:00`) -
        schedule.leadHours * 3600000;
    // Round up to the next minute so the suggestion survives opening/submitting the form.
    const earliest =
      (Math.floor((+now + schedule.leadHours * 3600000) / 60000) + 1) * 60000;
    const start = Math.max(open + schedule.leadHours * 3600000, earliest);
    if (start >= close) continue;
    return {
      start: new Date(start).toISOString(),
      end: new Date(close).toISOString(),
    };
  }
  return { start: "", end: "" };
}
