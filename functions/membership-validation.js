export function validateLeave({ uid, family }) {
  if (!uid || !family || !family.meta || !family.auth || !family.auth[uid]) {
    return { ok: false, reason: "not-member" };
  }
  if (family.meta.owner === uid) return { ok: false, reason: "owner" };
  return { ok: true };
}

export function linkedAccountUids(family, excludingUid) {
  const linked = new Set([
    ...Object.keys((family && family.auth) || {}),
    ...Object.keys((family && family.memberOf) || {}),
  ]);
  if (excludingUid) linked.delete(excludingUid);
  return [...linked];
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

export function validateAccountDisconnect({ uid, targetUid, family }) {
  if (!family || !family.meta || family.meta.owner !== uid) return { ok: false, reason: "not-owner" };
  if (!targetUid || targetUid === uid || family.meta.owner === targetUid) return { ok: false, reason: "invalid-target" };
  const isLinked = !!(
    (family.auth && family.auth[targetUid]) ||
    (family.memberOf && family.memberOf[targetUid]) ||
    (family.pendingClaims && family.pendingClaims[targetUid])
  );
  if (!isLinked) return { ok: false, reason: "not-linked" };
  return { ok: true, memberId: family.memberOf && family.memberOf[targetUid] };
}

export function canDeleteFamily({ uid, family }) {
  if (!family || !family.meta || family.meta.owner !== uid) return { ok: false, reason: "not-owner" };
  if (linkedAccountUids(family, uid).length) return { ok: false, reason: "members-remain" };
  return { ok: true };
}

export function hasRecentAuthentication(authTimeSeconds, now = Date.now()) {
  const authTime = Number(authTimeSeconds || 0) * 1000;
  return authTime > 0 && now - authTime <= 5 * 60 * 1000;
}

export function isAnonymousSignIn(token) {
  return !!(token && token.firebase && token.firebase.sign_in_provider === "anonymous");
}
