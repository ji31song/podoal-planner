import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { normalizeInviteCode, validateInvite } from "./invite-validation.js";
import { canDeleteFamily, hasRecentAuthentication, validateLeave, validateOwnershipTransfer } from "./membership-validation.js";

initializeApp();

export const joinFamily = onCall({ region: "asia-northeast3" }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const uid = request.auth.uid;
  const code = normalizeInviteCode(request.data && request.data.code);
  if (code.length !== 6) throw new HttpsError("invalid-argument", "초대 코드 형식이 올바르지 않습니다.");

  const database = getDatabase();
  const currentFamilyId = (await database.ref(`users/${uid}/familyId`).get()).val();
  if (currentFamilyId) throw new HttpsError("failed-precondition", "이미 가족에 가입된 계정입니다.");

  const invite = (await database.ref(`invites/${code}`).get()).val();
  if (!invite || typeof invite !== "object" || !invite.familyId) {
    throw new HttpsError("not-found", "초대 코드를 찾을 수 없습니다.");
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
    const message = failureReason === "expired" ? "만료된 초대 코드입니다." : "사용할 수 없는 초대 코드입니다.";
    throw new HttpsError("failed-precondition", message);
  }

  try {
    await database.ref(`users/${uid}`).set({ familyId: invite.familyId });
  } catch (error) {
    await familyRef.child(`auth/${uid}`).remove();
    throw new HttpsError("internal", "가족 가입 정보를 저장하지 못했습니다.");
  }

  return { familyId: invite.familyId };
});

export const leaveFamily = onCall({ region: "asia-northeast3" }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const uid = request.auth.uid;
  const database = getDatabase();
  const familyId = (await database.ref(`users/${uid}/familyId`).get()).val();
  if (!familyId) throw new HttpsError("failed-precondition", "가입된 가족이 없습니다.");

  const family = (await database.ref(`families/${familyId}`).get()).val();
  const deleteFamily = request.data && request.data.deleteFamily === true;
  if (family && family.meta && family.meta.owner === uid && deleteFamily) {
    const deletion = canDeleteFamily({ uid, family });
    if (!deletion.ok) throw new HttpsError("failed-precondition", "다른 구성원이 남아 있어 가족을 삭제할 수 없습니다.");
    const updates = { [`families/${familyId}`]: null };
    if (family.meta.inviteCode) updates[`invites/${family.meta.inviteCode}`] = null;
    for (const memberUid of Object.keys(family.auth || {})) updates[`users/${memberUid}`] = null;
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
  };
  if (memberId && family.memberClaims && family.memberClaims[memberId] === uid) {
    updates[`families/${familyId}/memberClaims/${memberId}`] = null;
  }
  await database.ref().update(updates);

  return { left: true };
});

export const transferOwnership = onCall({ region: "asia-northeast3" }, async request => {
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

export const deleteAccount = onCall({ region: "asia-northeast3" }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = request.auth.uid;
  if (!hasRecentAuthentication(request.auth.token.auth_time)) {
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
      for (const memberUid of Object.keys(family.auth || {})) updates[`users/${memberUid}`] = null;
      await database.ref().update(updates);
    } else if (family) {
      const memberId = family.memberOf && family.memberOf[uid];
      const updates = {
        [`families/${familyId}/auth/${uid}`]: null,
        [`families/${familyId}/memberOf/${uid}`]: null,
        [`families/${familyId}/pendingClaims/${uid}`]: null,
        [`users/${uid}`]: null,
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
    await database.ref(`users/${uid}`).remove();
  }

  await getAuth().deleteUser(uid);
  return { deleted: true };
});
