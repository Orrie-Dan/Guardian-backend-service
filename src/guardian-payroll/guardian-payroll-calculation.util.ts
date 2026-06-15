const MS_PER_HOUR = 1000 * 60 * 60;

export function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / MS_PER_HOUR);
}

/** Payable hours for guardian hourly pay: actual on-site time capped by job scheduled window. */
export function computePayableHours(
  scheduledStart: Date,
  scheduledEnd: Date,
  arrivedAt: Date,
  completedAt: Date,
): number {
  const scheduledHours = hoursBetween(scheduledStart, scheduledEnd);
  const actualHours = hoursBetween(arrivedAt, completedAt);
  return Math.min(scheduledHours, actualHours);
}
