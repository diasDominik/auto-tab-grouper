// groups.js
// Pure planning logic for consolidating duplicate tab groups. Kept free of
// chrome.* so it can be tested directly under `node --test`; background.js
// supplies the real groups and executes the plans.

/**
 * @typedef {{id: number, title?: string, color?: string, windowId: number}} TabGroup
 * @typedef {{
 *   title: string,
 *   targetGroupId: number,
 *   targetWindowId: number,
 *   sourceGroupIds: number[],
 *   sameWindow: boolean
 * }} MergePlan
 */

/**
 * Groups only count as duplicates when their titles match exactly after
 * trimming. Case is deliberately significant: "Work" and "work" look like two
 * different groups to the user, so silently collapsing them would be wrong.
 * @param {TabGroup} group
 * @returns {string|null} null when the group has no usable title.
 */
export function groupKey(group) {
  const title = typeof group?.title === "string" ? group.title.trim() : "";
  return title || null;
}

/**
 * Works out which duplicate groups should be folded into which survivor.
 *
 * `scope` decides how far a merge may reach:
 *  - "window" only ever merges groups that already share a window. This is the
 *    safe, automatic case: two groups with the same title in one window is
 *    never something the user asked for, and it is exactly what Chrome leaves
 *    behind after two windows are merged.
 *  - "all" also merges across windows, pulling tabs into the focused window.
 *    That moves tabs between windows, so it stays behind the explicit
 *    "Merge Groups" action rather than running on its own.
 *
 * @param {TabGroup[]} groups
 * @param {{scope?: "window"|"all", focusedWindowId?: number|null}} [options]
 * @returns {MergePlan[]}
 */
export function planGroupMerges(groups, options = {}) {
  const { scope = "all", focusedWindowId = null } = options;
  const titled = (Array.isArray(groups) ? groups : []).filter(
    (g) => g && groupKey(g) !== null && Number.isInteger(g.id)
  );

  // Sort by id so the chosen survivor is stable run to run.
  const ordered = [...titled].sort((a, b) => a.id - b.id);

  const buckets = new Map();
  for (const group of ordered) {
    // In "window" scope a group's window is part of its identity, so groups in
    // different windows never land in the same bucket. JSON keeps the window id
    // and the title unambiguously separated whatever the title contains.
    const key =
      scope === "window"
        ? JSON.stringify([group.windowId, groupKey(group)])
        : JSON.stringify([null, groupKey(group)]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(group);
  }

  const plans = [];
  for (const bucket of buckets.values()) {
    if (bucket.length <= 1) continue;

    // Prefer a survivor the user is already looking at, so tabs move towards
    // the focused window rather than away from it.
    const target =
      (focusedWindowId !== null &&
        bucket.find((g) => g.windowId === focusedWindowId)) ||
      bucket[0];

    const sources = bucket.filter((g) => g.id !== target.id);
    if (sources.length === 0) continue;

    plans.push({
      title: groupKey(target),
      targetGroupId: target.id,
      targetWindowId: target.windowId,
      sourceGroupIds: sources.map((g) => g.id),
      // Tabs only need moving between windows when a source sits elsewhere.
      sameWindow: sources.every((g) => g.windowId === target.windowId),
    });
  }

  return plans;
}

/**
 * Splits a group's tabs into the ones that can join another group and the ones
 * that cannot. Pinned tabs are refused by chrome.tabs.group, and a pinned tab
 * is a deliberate user choice we should not undo.
 * @param {{id: number, pinned?: boolean}[]} tabs
 * @returns {{movable: number[], skipped: number[]}}
 */
export function partitionMovableTabs(tabs) {
  const movable = [];
  const skipped = [];
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    if (!tab || !Number.isInteger(tab.id)) continue;
    (tab.pinned ? skipped : movable).push(tab.id);
  }
  return { movable, skipped };
}
