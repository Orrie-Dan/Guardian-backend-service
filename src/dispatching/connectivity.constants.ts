/** No heartbeat → mark STALE (still eligible for active assignment alerts). */
export const HEARTBEAT_STALE_MS = 60_000;

/** Mid-assignment disconnect → admin escalation threshold. */
export const HEARTBEAT_ESCALATE_MS = 5 * 60_000;
