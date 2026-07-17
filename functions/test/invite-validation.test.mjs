import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInviteCode, validateInvite } from "../invite-validation.js";

const now = 1_000_000;
const valid = () => ({
  code: "ABC234",
  invite: { familyId: "familyA", expiresAt: now + 1000 },
  family: { meta: { inviteCode: "ABC234", inviteExpiresAt: now + 1000, inviteActive: true } },
  now,
});

test("초대 코드 입력을 정규화한다", () => {
  assert.equal(normalizeInviteCode(" ab-c234 "), "ABC234");
});

test("유효한 초대 코드를 승인한다", () => {
  assert.deepEqual(validateInvite(valid()), { ok: true, familyId: "familyA" });
});

test("48시간이 지난 초대 코드를 거부한다", () => {
  const input = valid();
  input.invite.expiresAt = now;
  assert.equal(validateInvite(input).reason, "expired");
});

test("폐기된 초대 코드를 거부한다", () => {
  const input = valid();
  input.family.meta.inviteActive = false;
  assert.equal(validateInvite(input).reason, "revoked");
});

test("재발급으로 교체된 이전 코드를 거부한다", () => {
  const input = valid();
  input.family.meta.inviteCode = "NEW234";
  assert.equal(validateInvite(input).reason, "replaced");
});
