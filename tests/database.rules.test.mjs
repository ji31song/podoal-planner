import { readFile } from "node:fs/promises";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, remove, set, update } from "firebase/database";

const PROJECT_ID = "podoal-planner-rules-test";
let testEnv;

const family = (ownerUid, adultUid, childUid, siblingUid) => ({
  meta: { owner: ownerUid, inviteCode: "ABC234", inviteExpiresAt: Date.now() + 172800000, inviteActive: true, createdAt: 1 },
  auth: {
    [ownerUid]: "ABC234",
    [adultUid]: "ABC234",
    [childUid]: "ABC234",
    [siblingUid]: "ABC234",
  },
  family: {
    name: "테스트 가족",
    members: [
      { id: "ownerMember", name: "소유자", role: "adult" },
      { id: "adultMember", name: "어른", role: "adult" },
      { id: "childMember", name: "아이", role: "child" },
      { id: "siblingMember", name: "형제", role: "child" },
    ],
  },
  memberRoles: {
    ownerMember: "adult",
    adultMember: "adult",
    childMember: "child",
    siblingMember: "child",
  },
  memberClaims: {
    ownerMember: ownerUid,
    adultMember: adultUid,
    childMember: childUid,
    siblingMember: siblingUid,
  },
  memberOf: {
    [ownerUid]: "ownerMember",
    [adultUid]: "adultMember",
    [childUid]: "childMember",
    [siblingUid]: "siblingMember",
  },
  people: {
    ownerMember: { schedule: { "2026-07-17": [{ time: "09:00", text: "소유자 일정" }] } },
    adultMember: { schedule: { "2026-07-17": [{ time: "10:00", text: "어른 일정" }] } },
    childMember: {
      items: { "2026-07-17": [{ id: "i1", text: "숙제" }] },
      schedule: { "2026-07-17": [{ time: "11:00", text: "아이 일정" }] },
      phonebook: [{ name: "학원", phone: "000-0000-0000" }],
    },
    siblingMember: { schedule: { "2026-07-17": [{ time: "12:00", text: "형제 일정" }] } },
  },
});

function db(uid) {
  return testEnv.authenticatedContext(uid).database();
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async context => {
    const adminDb = context.database();
    await set(ref(adminDb), {
      families: {
        familyA: family("ownerA", "adultA", "childA", "siblingA"),
        familyB: family("ownerB", "adultB", "childB", "siblingB"),
      },
      users: {},
      invites: { ABC234: { familyId: "familyA", expiresAt: Date.now() + 172800000 } },
    });
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules: await readFile("database.rules.json", "utf8") },
  });
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

describe("가족 간 데이터 분리", () => {
  test("가족 구성원은 자기 가족 전체를 읽을 수 있다", async () => {
    await assertSucceeds(get(ref(db("childA"), "families/familyA")));
  });

  test("다른 가족 데이터는 읽을 수 없다", async () => {
    await assertFails(get(ref(db("adultA"), "families/familyB")));
  });

  test("일반 구성원은 가족 전체를 삭제할 수 없다", async () => {
    await assertFails(remove(ref(db("adultA"), "families/familyA")));
  });
});

describe("가족 설정 권한", () => {
  test("소유자는 가족 설정을 수정할 수 있다", async () => {
    await assertSucceeds(update(ref(db("ownerA"), "families/familyA/family"), { name: "변경된 가족" }));
  });

  test("일반 어른은 가족 설정을 수정할 수 없다", async () => {
    await assertFails(update(ref(db("adultA"), "families/familyA/family"), { name: "권한 없음" }));
  });
});

describe("역할별 일정과 체크리스트 권한", () => {
  test("가족 구성원은 다른 아이의 일정을 읽을 수 있다", async () => {
    await assertSucceeds(get(ref(db("childA"), "families/familyA/people/siblingMember/schedule")));
  });

  test("어른은 아이의 일정과 체크리스트를 수정할 수 있다", async () => {
    await assertSucceeds(set(ref(db("adultA"), "families/familyA/people/childMember/schedule/2026-07-18"), [{ time: "13:00", text: "새 일정" }]));
    await assertSucceeds(set(ref(db("adultA"), "families/familyA/people/childMember/items/2026-07-18"), [{ id: "i2", text: "독서" }]));
  });

  test("아이는 자신의 일정은 수정할 수 있다", async () => {
    await assertSucceeds(set(ref(db("childA"), "families/familyA/people/childMember/schedule/2026-07-18"), [{ time: "14:00", text: "내 일정" }]));
  });

  test("아이는 다른 아이의 일정을 수정할 수 없다", async () => {
    await assertFails(set(ref(db("childA"), "families/familyA/people/siblingMember/schedule/2026-07-18"), [{ time: "15:00", text: "변조" }]));
  });

  test("일반 어른은 다른 어른의 일정을 수정할 수 없다", async () => {
    await assertFails(set(ref(db("adultA"), "families/familyA/people/ownerMember/schedule/2026-07-18"), [{ time: "16:00", text: "변조" }]));
  });
});

describe("보상·댓글·전화번호부 권한", () => {
  test("어른은 아이에게 포도알과 댓글을 줄 수 있다", async () => {
    await assertSucceeds(set(ref(db("adultA"), "families/familyA/people/childMember/grapes/2026-07-17"), true));
    await assertSucceeds(set(ref(db("adultA"), "families/familyA/people/childMember/comments/2026-07-17"), [{ who: "어른", text: "잘했어" }]));
  });

  test("아이는 포도알·댓글·전화번호부를 수정할 수 없다", async () => {
    await assertFails(set(ref(db("childA"), "families/familyA/people/childMember/grapes/2026-07-17"), true));
    await assertFails(set(ref(db("childA"), "families/familyA/people/childMember/comments/2026-07-17"), [{ who: "아이", text: "변조" }]));
    await assertFails(set(ref(db("childA"), "families/familyA/people/childMember/phonebook"), []));
  });

  test("어른은 전화번호부를 수정할 수 있다", async () => {
    await assertSucceeds(set(ref(db("adultA"), "families/familyA/people/childMember/phonebook"), [{ name: "학교", phone: "000" }]));
  });
});

describe("구성원 연결 승인", () => {
  test("신규 사용자는 연결 요청만 만들 수 있다", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await set(ref(context.database(), "families/familyA/auth/newUser"), "ABC234");
    });
    await assertSucceeds(set(ref(db("newUser"), "families/familyA/pendingClaims/newUser"), "childMember"));
    await assertFails(set(ref(db("newUser"), "families/familyA/memberOf/newUser"), "childMember"));
  });

  test("소유자는 비어 있는 구성원 연결을 승인할 수 있다", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await update(ref(context.database(), "families/familyA"), {
        "auth/newUser": "ABC234",
        "family/members/4": { id: "newChild", name: "새 아이", role: "child" },
        "memberRoles/newChild": "child",
        "pendingClaims/newUser": "newChild",
      });
    });
    await assertSucceeds(set(ref(db("ownerA"), "families/familyA/memberClaims/newChild"), "newUser"));
    await assertSucceeds(set(ref(db("ownerA"), "families/familyA/memberOf/newUser"), "newChild"));
    await assertSucceeds(remove(ref(db("ownerA"), "families/familyA/pendingClaims/newUser")));
  });
});

describe("48시간 초대 코드", () => {
  test("유효한 코드라도 브라우저가 가입 권한을 직접 부여할 수 없다", async () => {
    await assertFails(set(ref(db("newUser"), "families/familyA/auth/newUser"), "ABC234"));
  });

  test("만료된 초대 코드는 보안 규칙에서 거부된다", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await update(ref(context.database()), {
        "families/familyA/meta/inviteCode": "OLD234",
        "families/familyA/meta/inviteExpiresAt": Date.now() - 1000,
        "invites/OLD234": { familyId: "familyA", expiresAt: Date.now() - 1000 },
      });
    });
    await assertFails(set(ref(db("newUser"), "families/familyA/auth/newUser"), "OLD234"));
  });

  test("소유자가 폐기한 초대 코드는 거부된다", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await set(ref(context.database(), "families/familyA/meta/inviteActive"), false);
    });
    await assertFails(set(ref(db("newUser"), "families/familyA/auth/newUser"), "ABC234"));
  });

  test("소유자는 새 코드를 등록하고 이전 코드를 삭제할 수 있다", async () => {
    await assertSucceeds(set(ref(db("ownerA"), "invites/NEW234"), { familyId: "familyA", expiresAt: Date.now() + 172800000 }));
    await assertSucceeds(remove(ref(db("ownerA"), "invites/ABC234")));
  });

  test("일반 구성원은 초대 코드를 발급하거나 폐기할 수 없다", async () => {
    await assertFails(set(ref(db("adultA"), "invites/NEW234"), { familyId: "familyA", expiresAt: Date.now() + 172800000 }));
    await assertFails(remove(ref(db("adultA"), "invites/ABC234")));
  });
});
