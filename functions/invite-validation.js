export function normalizeInviteCode(value) {
  return String(value || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function isInviteCode(value) {
  return /^[A-HJKMNP-Z2-9]{6}$/.test(value);
}

export function validateInvite({ code, invite, family, now = Date.now() }) {
  if (!isInviteCode(code)) return { ok: false, reason: "invalid-code" };
  if (!invite || typeof invite !== "object" || !invite.familyId) return { ok: false, reason: "not-found" };
  if (!Number.isFinite(invite.expiresAt) || invite.expiresAt <= now) return { ok: false, reason: "expired" };
  if (!family || !family.meta) return { ok: false, reason: "not-found" };
  if (family.meta.inviteActive !== true) return { ok: false, reason: "revoked" };
  if (family.meta.inviteCode !== code) return { ok: false, reason: "replaced" };
  if (!Number.isFinite(family.meta.inviteExpiresAt) || family.meta.inviteExpiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true, familyId: invite.familyId };
}
