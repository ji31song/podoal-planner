export const INVITE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
export const INVITE_ATTEMPT_BLOCK_MS = 15 * 60 * 1000;
export const INVITE_ATTEMPT_LIMIT = 5;

export function recordInviteAttempt(previous, now = Date.now(), limit = INVITE_ATTEMPT_LIMIT) {
  const current = previous && typeof previous === "object" ? previous : {};
  const blockedUntil = Number(current.blockedUntil || 0);
  if (blockedUntil > now) {
    return {
      allowed: false,
      state: { ...current, blockedUntil, lastAttemptAt: now },
    };
  }

  const previousWindow = Number(current.windowStartedAt || 0);
  const windowStartedAt = previousWindow > 0 && now - previousWindow < INVITE_ATTEMPT_WINDOW_MS
    ? previousWindow
    : now;
  const previousCount = windowStartedAt === previousWindow ? Number(current.count || 0) : 0;
  const count = previousCount + 1;

  if (count > limit) {
    return {
      allowed: false,
      state: { windowStartedAt, count, blockedUntil: now + INVITE_ATTEMPT_BLOCK_MS, lastAttemptAt: now },
    };
  }

  return {
    allowed: true,
    state: { windowStartedAt, count, blockedUntil: 0, lastAttemptAt: now },
  };
}
