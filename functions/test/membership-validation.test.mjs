import test from "node:test";
import assert from "node:assert/strict";
import { canDeleteFamily, hasRecentAuthentication, isAnonymousSignIn, linkedAccountUids, validateAccountDisconnect, validateLeave, validateOwnershipTransfer } from "../membership-validation.js";

const family = {
  meta: { owner: "ownerA" },
  auth: { ownerA: "ABC234", adultA: "ABC234" },
  memberOf: { ownerA: "ownerMember", adultA: "adultMember" },
  memberRoles: { ownerMember: "adult", adultMember: "adult" },
};

test("일반 구성원은 가족을 탈퇴할 수 있다", () => {
  assert.deepEqual(validateLeave({ uid: "adultA", family }), { ok: true });
});

test("가족 소유자는 바로 탈퇴할 수 없다", () => {
  assert.equal(validateLeave({ uid: "ownerA", family }).reason, "owner");
});

test("가족 구성원이 아닌 계정은 탈퇴할 수 없다", () => {
  assert.equal(validateLeave({ uid: "other", family }).reason, "not-member");
});

test("가족 데이터가 없으면 안전하게 거부한다", () => {
  assert.equal(validateLeave({ uid: "adultA", family: null }).reason, "not-member");
});

test("소유권은 연결된 어른에게 이전할 수 있다", () => {
  assert.equal(validateOwnershipTransfer({ uid: "ownerA", successorUid: "adultA", family }).ok, true);
});

test("아이에게는 소유권을 이전할 수 없다", () => {
  const withChild = structuredClone(family);
  withChild.auth.childA = "ABC234";
  withChild.memberOf.childA = "childMember";
  withChild.memberRoles.childMember = "child";
  assert.equal(validateOwnershipTransfer({ uid: "ownerA", successorUid: "childA", family: withChild }).reason, "adult-required");
});

test("가족 소유자는 연결된 다른 구성원의 기기 연결을 끊을 수 있다", () => {
  assert.deepEqual(validateAccountDisconnect({ uid: "ownerA", targetUid: "adultA", family }), { ok: true, memberId: "adultMember" });
});

test("일반 구성원은 다른 계정의 연결을 끊을 수 없다", () => {
  assert.equal(validateAccountDisconnect({ uid: "adultA", targetUid: "ownerA", family }).reason, "not-owner");
});

test("가족 소유자는 자기 연결을 관리 기능으로 끊을 수 없다", () => {
  assert.equal(validateAccountDisconnect({ uid: "ownerA", targetUid: "ownerA", family }).reason, "invalid-target");
});

test("다른 구성원이 남아 있으면 가족 전체를 삭제할 수 없다", () => {
  assert.equal(canDeleteFamily({ uid: "ownerA", family }).reason, "members-remain");
});

test("소유자만 남았으면 가족 전체를 삭제할 수 있다", () => {
  const ownerOnly = structuredClone(family);
  ownerOnly.auth = { ownerA: "ABC234" };
  ownerOnly.memberOf = { ownerA: "ownerMember" };
  assert.equal(canDeleteFamily({ uid: "ownerA", family: ownerOnly }).ok, true);
});

test("프로필을 고르지 않은 가입 계정도 남은 구성원으로 확인한다", () => {
  const pendingAccount = structuredClone(family);
  delete pendingAccount.memberOf.adultA;
  assert.deepEqual(linkedAccountUids(pendingAccount, "ownerA"), ["adultA"]);
  assert.equal(canDeleteFamily({ uid: "ownerA", family: pendingAccount }).reason, "members-remain");
});

test("계정 삭제는 최근 5분 이내 로그인만 허용한다", () => {
  const now = 1_000_000;
  assert.equal(hasRecentAuthentication((now - 60_000) / 1000, now), true);
  assert.equal(hasRecentAuthentication((now - 301_000) / 1000, now), false);
});

test("익명 참여 계정과 Google 계정을 로그인 제공자로 구분한다", () => {
  assert.equal(isAnonymousSignIn({ firebase: { sign_in_provider: "anonymous" } }), true);
  assert.equal(isAnonymousSignIn({ firebase: { sign_in_provider: "google.com" } }), false);
  assert.equal(isAnonymousSignIn({}), false);
});
