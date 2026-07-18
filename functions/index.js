import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { recordInviteAttempt } from "./invite-rate-limit.js";
import { isInviteCode, normalizeInviteCode, validateInvite } from "./invite-validation.js";
import { canDeleteFamily, hasRecentAuthentication, isAnonymousSignIn, linkedAccountUids, validateAccountDisconnect, validateLeave, validateOwnershipTransfer } from "./membership-validation.js";

initializeApp();

const callableOptions = {
  region: "asia-northeast3",
  minInstances: 0,
  maxInstances: 2,
  enforceAppCheck: true,
};

const INVITE_NETWORK_ATTEMPT_LIMIT = 20;

function inviteNetworkKey(request) {
  const rawRequest = request.rawRequest;
  if (!rawRequest) return null;
  const forwarded = rawRequest.headers && rawRequest.headers["x-forwarded-for"];
  const address = rawRequest.ip || (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0].trim());
  if (!address) return null;
  return createHash("sha256").update(`podoal-invite:${address}`).digest("hex");
}

async function consumeInviteAttempt(database, path, limit) {
  let allowed = false;
  const result = await database.ref(path).transaction(previous => {
    const decision = recordInviteAttempt(previous, Date.now(), limit);
    allowed = decision.allowed;
    return decision.state;
  }, undefined, false);
  return result.committed && allowed;
}

export const joinFamily = onCall(callableOptions, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  if (!isAnonymousSignIn(request.auth.token)) {
    throw new HttpsError("failed-precondition", "초대 코드 참여는 앱에서 만든 익명 참여 계정으로만 가능합니다.");
  }

  const uid = request.auth.uid;
  const code = normalizeInviteCode(request.data && request.data.code);
  if (!isInviteCode(code)) throw new HttpsError("invalid-argument", "초대 코드 형식이 올바르지 않습니다.");

  const database = getDatabase();
  const currentFamilyId = (await database.ref(`users/${uid}/familyId`).get()).val();
  if (currentFamilyId) throw new HttpsError("failed-precondition", "이미 가족에 가입된 계정입니다.");

  const accountAttemptAllowed = await consumeInviteAttempt(database, `inviteAttempts/${uid}`);
  const networkKey = inviteNetworkKey(request);
  const networkAttemptAllowed = !networkKey || await consumeInviteAttempt(
    database,
    `inviteNetworkAttempts/${networkKey}`,
    INVITE_NETWORK_ATTEMPT_LIMIT,
  );
  if (!accountAttemptAllowed || !networkAttemptAllowed) {
    throw new HttpsError("resource-exhausted", "초대 코드 확인 횟수가 너무 많습니다. 15분 후 다시 시도해 주세요.");
  }

  const invite = (await database.ref(`invites/${code}`).get()).val();
  if (!invite || typeof invite !== "object" || !invite.familyId) {
    throw new HttpsError("failed-precondition", "유효하지 않거나 만료된 초대 코드입니다.");
  }

  const familyRef = database.ref(`families/${invite.familyId}`);
  let failureReason = "not-found";
  const result = await familyRef.transaction(family => {
    const validation = validateInvite({ code, invite, family });
    if (!validation.ok) { failureReason = validation.reason; return; }
    if (!family.auth) family.auth = {};
    family.auth[uid] = code;
    return family;
  }, undefined, false);

  if (!result.committed) {
    throw new HttpsError("failed-precondition", "유효하지 않거나 만료된 초대 코드입니다.");
  }

  try {
    await database.ref(`users/${uid}`).set({ familyId: invite.familyId });
  } catch (error) {
    await familyRef.child(`auth/${uid}`).remove();
    throw new HttpsError("internal", "가족 가입 정보를 저장하지 못했습니다.");
  }

  await database.ref(`inviteAttempts/${uid}`).remove();
  return { familyId: invite.familyId };
});

export const leaveFamily = onCall(callableOptions, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const uid = request.auth.uid;
  const deleteAnonymousAccount = request.data && request.data.deleteAnonymousAccount === true;
  if (deleteAnonymousAccount && !isAnonymousSignIn(request.auth.token)) {
    throw new HttpsError("invalid-argument", "익명 참여 계정만 기기 연결과 함께 삭제할 수 있습니다.");
  }
  const database = getDatabase();
  const familyId = (await database.ref(`users/${uid}/familyId`).get()).val();
  if (!familyId) throw new HttpsError("failed-precondition", "가입된 가족이 없습니다.");

  const family = (await database.ref(`families/${familyId}`).get()).val();
  const deleteFamily = request.data && request.data.deleteFamily === true;
  if (family && family.meta && family.meta.owner === uid && deleteFamily) {
    if (request.data.confirmation !== "DELETE_FAMILY") {
      throw new HttpsError("invalid-argument", "가족 삭제 확인이 필요합니다.");
    }
    if (!isAnonymousSignIn(request.auth.token) && !hasRecentAuthentication(request.auth.token.auth_time)) {
      throw new HttpsError("failed-precondition", "가족 삭제 전에 다시 로그인해 주세요.");
    }
    const deletion = canDeleteFamily({ uid, family });
    if (!deletion.ok) throw new HttpsError("failed-precondition", "다른 구성원이 남아 있어 가족을 삭제할 수 없습니다.");
    const updates = { [`families/${familyId}`]: null };
    if (family.meta.inviteCode) updates[`invites/${family.meta.inviteCode}`] = null;
    for (const memberUid of [uid, ...linkedAccountUids(family, uid)]) {
      updates[`users/${memberUid}`] = null;
      updates[`inviteAttempts/${memberUid}`] = null;
    }
    await database.ref().update(updates);
    return { left: true, familyDeleted: true };
  }
  const validation = validateLeave({ uid, family });
  if (!validation.ok) {
    const message = validation.reason === "owner" ? "가족 소유자는 소유권을 이전한 뒤 탈퇴할 수 있습니다." : "가족 정보를 확인할 수 없습니다.";
    throw new HttpsError("failed-precondition", message);
  }

  const memberId = family.memberOf && family.memberOf[uid];
  const updates = {
    [`families/${familyId}/auth/${uid}`]: null,
    [`families/${familyId}/memberOf/${uid}`]: null,
    [`families/${familyId}/pendingClaims/${uid}`]: null,
    [`users/${uid}`]: null,
    [`inviteAttempts/${uid}`]: null,
  };
  if (memberId && family.memberClaims && family.memberClaims[memberId] === uid) {
    updates[`families/${familyId}/memberClaims/${memberId}`] = null;
  }
  await database.ref().update(updates);

  if (deleteAnonymousAccount) {
    try {
      await getAuth().deleteUser(uid);
    } catch (error) {
      if (error && error.code !== "auth/user-not-found") throw error;
    }
  }

  return { left: true, authDeleted: deleteAnonymousAccount };
});

export const transferOwnership = onCall(callableOptions, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = request.auth.uid;
  const successorUid = String((request.data && request.data.successorUid) || "");
  const database = getDatabase();
  const familyId = (await database.ref(`users/${uid}/familyId`).get()).val();
  if (!familyId) throw new HttpsError("failed-precondition", "가입된 가족이 없습니다.");

  let failureReason = "not-owner";
  const result = await database.ref(`families/${familyId}`).transaction(family => {
    const validation = validateOwnershipTransfer({ uid, successorUid, family });
    if (!validation.ok) { failureReason = validation.reason; return; }
    family.meta.owner = successorUid;
    return family;
  }, undefined, false);
  if (!result.committed) {
    const message = failureReason === "adult-required" ? "소유권은 연결된 어른에게만 이전할 수 있습니다." : "소유권을 이전할 수 없습니다.";
    throw new HttpsError("failed-precondition", message);
  }
  return { transferred: true };
});

export const disconnectMemberAccount = onCall(callableOptions, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = request.auth.uid;
  const targetUid = String((request.data && request.data.targetUid) || "");
  const database = getDatabase();
  const familyId = (await database.ref(`users/${uid}/familyId`).get()).val();
  if (!familyId) throw new HttpsError("failed-precondition", "가입된 가족이 없습니다.");

  const family = (await database.ref(`families/${familyId}`).get()).val();
  const validation = validateAccountDisconnect({ uid, targetUid, family });
  if (!validation.ok) {
    const message = validation.reason === "not-owner"
      ? "가족 소유자만 기기 연결을 관리할 수 있습니다."
      : "연결된 구성원 계정을 확인할 수 없습니다.";
    throw new HttpsError("failed-precondition", message);
  }

  const updates = {
    [`families/${familyId}/auth/${targetUid}`]: null,
    [`families/${familyId}/memberOf/${targetUid}`]: null,
    [`families/${familyId}/pendingClaims/${targetUid}`]: null,
    [`users/${targetUid}`]: null,
    [`inviteAttempts/${targetUid}`]: null,
  };
  if (validation.memberId && family.memberClaims && family.memberClaims[validation.memberId] === targetUid) {
    updates[`families/${familyId}/memberClaims/${validation.memberId}`] = null;
  }
  await database.ref().update(updates);
  return { disconnected: true };
});

export const deleteAccount = onCall(callableOptions, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = request.auth.uid;
  if (!request.data || request.data.confirmation !== "DELETE_ACCOUNT") {
    throw new HttpsError("invalid-argument", "계정 삭제 확인이 필요합니다.");
  }
  if (!isAnonymousSignIn(request.auth.token) && !hasRecentAuthentication(request.auth.token.auth_time)) {
    throw new HttpsError("failed-precondition", "계정 삭제 전에 다시 로그인해 주세요.");
  }

  const database = getDatabase();
  const familyId = (await database.ref(`users/${uid}/familyId`).get()).val();
  if (familyId) {
    const family = (await database.ref(`families/${familyId}`).get()).val();
    if (family && family.meta && family.meta.owner === uid) {
      const deletion = canDeleteFamily({ uid, family });
      if (!deletion.ok) throw new HttpsError("failed-precondition", "다른 어른에게 소유권을 이전한 뒤 계정을 삭제해 주세요.");
      const updates = { [`families/${familyId}`]: null };
      if (family.meta.inviteCode) updates[`invites/${family.meta.inviteCode}`] = null;
      for (const memberUid of [uid, ...linkedAccountUids(family, uid)]) {
        updates[`users/${memberUid}`] = null;
        updates[`inviteAttempts/${memberUid}`] = null;
      }
      await database.ref().update(updates);
    } else if (family) {
      const memberId = family.memberOf && family.memberOf[uid];
      const updates = {
        [`families/${familyId}/auth/${uid}`]: null,
        [`families/${familyId}/memberOf/${uid}`]: null,
        [`families/${familyId}/pendingClaims/${uid}`]: null,
        [`users/${uid}`]: null,
        [`inviteAttempts/${uid}`]: null,
      };
      if (memberId && family.memberClaims && family.memberClaims[memberId] === uid) {
        updates[`families/${familyId}/memberClaims/${memberId}`] = null;
      }
      if (memberId) {
        updates[`families/${familyId}/memberRoles/${memberId}`] = null;
        updates[`families/${familyId}/people/${memberId}`] = null;
        const remainingMembers = Array.isArray(family.family && family.family.members)
          ? family.family.members.filter(member => member && member.id !== memberId)
          : Object.values((family.family && family.family.members) || {}).filter(member => member && member.id !== memberId);
        updates[`families/${familyId}/family/members`] = remainingMembers;
      }
      await database.ref().update(updates);
    } else {
      await database.ref(`users/${uid}`).remove();
    }
  } else {
    await database.ref().update({ [`users/${uid}`]: null, [`inviteAttempts/${uid}`]: null });
  }

  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    if (error && error.code !== "auth/user-not-found") throw error;
  }
  return { deleted: true };
});
