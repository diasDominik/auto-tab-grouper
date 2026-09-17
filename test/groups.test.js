import test from "node:test";
import assert from "node:assert/strict";

import { groupKey, planGroupMerges, partitionMovableTabs } from "../groups.js";

const group = (id, title, windowId, extra = {}) => ({
  id,
  title,
  windowId,
  color: "blue",
  ...extra,
});

test("groupKey trims and rejects untitled groups", () => {
  assert.equal(groupKey({ title: "Work" }), "Work");
  assert.equal(groupKey({ title: "  Work  " }), "Work");
  assert.equal(groupKey({ title: "" }), null);
  assert.equal(groupKey({ title: "   " }), null);
  assert.equal(groupKey({}), null);
  assert.equal(groupKey(undefined), null);
});

test("no groups, or a single group, produces no plans", () => {
  assert.deepEqual(planGroupMerges([]), []);
  assert.deepEqual(planGroupMerges(undefined), []);
  assert.deepEqual(planGroupMerges([group(1, "Work", 1)]), []);
});

test("duplicates in one window merge, and need no cross-window move", () => {
  // The state Chrome leaves behind after two windows are combined.
  const plans = planGroupMerges([group(1, "Work", 1), group(2, "Work", 1)], {
    scope: "window",
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].targetGroupId, 1);
  assert.deepEqual(plans[0].sourceGroupIds, [2]);
  assert.equal(plans[0].sameWindow, true);
  assert.equal(plans[0].title, "Work");
});

test('"window" scope never reaches across windows', () => {
  const plans = planGroupMerges([group(1, "Work", 1), group(2, "Work", 2)], {
    scope: "window",
  });
  assert.deepEqual(plans, []);
});

test('"all" scope merges across windows and flags the move', () => {
  const plans = planGroupMerges([group(1, "Work", 1), group(2, "Work", 2)], {
    scope: "all",
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].sameWindow, false);
  assert.deepEqual(plans[0].sourceGroupIds, [2]);
});

test("the focused window keeps its group as the survivor", () => {
  const plans = planGroupMerges(
    [group(1, "Work", 1), group(2, "Work", 2), group(3, "Work", 2)],
    { scope: "all", focusedWindowId: 2 }
  );
  assert.equal(plans.length, 1);
  assert.equal(plans[0].targetGroupId, 2);
  assert.equal(plans[0].targetWindowId, 2);
  assert.deepEqual(plans[0].sourceGroupIds.sort(), [1, 3]);
  assert.equal(plans[0].sameWindow, false);
});

test("with no focused window the lowest group id survives", () => {
  const plans = planGroupMerges([group(7, "Work", 1), group(3, "Work", 1)], {
    scope: "window",
  });
  assert.equal(plans[0].targetGroupId, 3);
  assert.deepEqual(plans[0].sourceGroupIds, [7]);
});

test("the survivor does not depend on input order", () => {
  const a = planGroupMerges([group(9, "Work", 1), group(4, "Work", 1)], {
    scope: "window",
  });
  const b = planGroupMerges([group(4, "Work", 1), group(9, "Work", 1)], {
    scope: "window",
  });
  assert.deepEqual(a, b);
});

test("three duplicates collapse into one survivor and two sources", () => {
  const plans = planGroupMerges(
    [group(1, "Work", 1), group(2, "Work", 1), group(3, "Work", 1)],
    { scope: "window" }
  );
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].sourceGroupIds, [2, 3]);
});

test("untitled groups are never merged", () => {
  const plans = planGroupMerges(
    [group(1, "", 1), group(2, "", 1), group(3, undefined, 1)],
    { scope: "window" }
  );
  assert.deepEqual(plans, []);
});

test("titles match after trimming but remain case sensitive", () => {
  const trimmed = planGroupMerges(
    [group(1, "Work", 1), group(2, "  Work ", 1)],
    { scope: "window" }
  );
  assert.equal(trimmed.length, 1);

  // "Work" and "work" look like two different groups to the user.
  const cased = planGroupMerges([group(1, "Work", 1), group(2, "work", 1)], {
    scope: "window",
  });
  assert.deepEqual(cased, []);
});

test("different titles each get their own plan", () => {
  const plans = planGroupMerges(
    [
      group(1, "Work", 1),
      group(2, "Work", 1),
      group(3, "Mail", 1),
      group(4, "Mail", 1),
    ],
    { scope: "window" }
  );
  assert.equal(plans.length, 2);
  assert.deepEqual(plans.map((p) => p.title).sort(), ["Mail", "Work"]);
});

test("only the window that actually has duplicates is planned", () => {
  const plans = planGroupMerges(
    [group(1, "Work", 1), group(2, "Work", 1), group(3, "Work", 2)],
    { scope: "window" }
  );
  assert.equal(plans.length, 1);
  assert.equal(plans[0].targetWindowId, 1);
  assert.deepEqual(plans[0].sourceGroupIds, [2]);
});

test("a title containing the key separator is not confused with another window", () => {
  // The bucket key packs window id and title together; a title that looks like
  // that packing must not collide with a real group in another window.
  const plans = planGroupMerges(
    [group(1, '2","Work', 1), group(2, "Work", 2)],
    { scope: "window" }
  );
  assert.deepEqual(plans, []);
});

test("groups without a usable id are ignored", () => {
  const plans = planGroupMerges(
    [group(1, "Work", 1), { title: "Work", windowId: 1 }],
    { scope: "window" }
  );
  assert.deepEqual(plans, []);
});

test("groups differing only by colour still merge", () => {
  const plans = planGroupMerges(
    [
      group(1, "Work", 1, { color: "blue" }),
      group(2, "Work", 1, { color: "red" }),
    ],
    { scope: "window" }
  );
  assert.equal(plans.length, 1);
});

test("partitionMovableTabs holds back pinned tabs", () => {
  const { movable, skipped } = partitionMovableTabs([
    { id: 1 },
    { id: 2, pinned: true },
    { id: 3, pinned: false },
  ]);
  assert.deepEqual(movable, [1, 3]);
  assert.deepEqual(skipped, [2]);
});

test("partitionMovableTabs tolerates empty and malformed input", () => {
  assert.deepEqual(partitionMovableTabs([]), { movable: [], skipped: [] });
  assert.deepEqual(partitionMovableTabs(undefined), {
    movable: [],
    skipped: [],
  });
  assert.deepEqual(partitionMovableTabs([null, {}, { id: "x" }, { id: 5 }]), {
    movable: [5],
    skipped: [],
  });
});
