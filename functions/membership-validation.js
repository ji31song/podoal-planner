export function validateLeave({ uid, family }) {
  if (!uid || !family || !family.meta || !family.auth || !family.auth[uid]) {
    return { ok: false, reason: "not-member" };
  }
  if (family.meta.owner === uid) return { ok: false, reason: "owner" };
  return { ok: true };
}

export function approvedMemberUids(family, excludingUid) {
  return Object.keys((family && family.memberOf) || {}).filter(uid => uid !== excludingUid);
}

export function validateOwnershipTransfer({ uid, successorUid, family }) {
  if (!family || !family.meta || family.meta.owner !== uid) return { ok: false, reason: "not-owner" };
  if (!successorUid || successorUid === uid || !family.auth || !family.auth[successorUid]) return { ok: false, reason: "invalid-successor" };
  const successorMemberId = family.memberOf && family.memberOf[successorUid];
  if (!successorMemberId || !family.memberRoles || family.memberRoles[successorMemberId] !== "adult") {
    return { ok: false, reason: "adult-required" };
  }
  return { ok: true, successorMemberId };
}

export function canDeleteFamily({ uid, family }) {
  if (!family || !family.meta || family.meta.owner !== uid) return { ok: false, reason: "not-owner" };
  if (approvedMemberUids(family, uid).length) return { ok: false, reason: "members-remain" };
  return { ok: true };
}

export function hasRecentAuthentication(authTimeSeconds, now = Date.now()) {
  const authTime = Number(authTimeSeconds || 0) * 1000;
  return authTime > 0 && now - authTime <= 5 * 60 * 1000;
}
