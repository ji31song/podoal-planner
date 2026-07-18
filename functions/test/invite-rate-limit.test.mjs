import test from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_ATTEMPT_BLOCK_MS,
  INVITE_ATTEMPT_LIMIT,
  recordInviteAttempt,
} from "../invite-rate-limit.js";

test("10분 안에는 초대 코드 확인을 5회까지 허용한다", () => {
  let state = null;
  for (let count = 1; count <= INVITE_ATTEMPT_LIMIT; count += 1) {
    const decision = recordInviteAttempt(state, 1_000_000 + count);
    assert.equal(decision.allowed, true);
    state = decision.state;
  }
});

test("여섯 번째 실패부터 15분 동안 차단한다", () => {
  let state = null;
  for (let count = 1; count <= INVITE_ATTEMPT_LIMIT + 1; count += 1) {
    state = recordInviteAttempt(state, 1_000_000 + count).state;
  }
  assert.equal(state.blockedUntil, 1_000_000 + INVITE_ATTEMPT_LIMIT + 1 + INVITE_ATTEMPT_BLOCK_MS);
  assert.equal(recordInviteAttempt(state, state.blockedUntil - 1).allowed, false);
});

test("차단 시간이 지나면 다시 확인할 수 있다", () => {
  const blocked = {
    windowStartedAt: 1_000_000,
    count: INVITE_ATTEMPT_LIMIT + 1,
    blockedUntil: 1_000_000 + INVITE_ATTEMPT_BLOCK_MS,
  };
  const decision = recordInviteAttempt(blocked, blocked.blockedUntil + 1);
  assert.equal(decision.allowed, true);
  assert.equal(decision.state.count, 1);
  assert.equal(decision.state.blockedUntil, 0);
});

test("네트워크 보조 제한처럼 별도의 허용 횟수를 적용할 수 있다", () => {
  let state = null;
  for (let count = 1; count <= 20; count += 1) {
    const decision = recordInviteAttempt(state, 1_000_000 + count, 20);
    assert.equal(decision.allowed, true);
    state = decision.state;
  }
  assert.equal(recordInviteAttempt(state, 1_000_021, 20).allowed, false);
});
