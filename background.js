// --- Custom Logger ---
let debugMode = false;
const logger = {
  log: (...args) => {
    if (debugMode) console.log("[Auto Tab Grouper]", ...args);
  },
  warn: (...args) => {
    if (debugMode) console.warn("[Auto Tab Grouper]", ...args);
  },
  error: (...args) => console.error("[Auto Tab Grouper]", ...args),
};

async function updateDebugState() {
  const result = await chrome.storage.sync.get({ debugModeEnabled: false });
  debugMode = result.debugModeEnabled;
  logger.log("Debug mode is now:", debugMode ? "ENABLED" : "DISABLED");
}
updateDebugState();
chrome.storage.onChanged.addListener((changes) => {
  if (changes.debugModeEnabled) {
    debugMode = changes.debugModeEnabled.newValue;
    logger.log("Debug mode updated to:", debugMode ? "ENABLED" : "DISABLED");
  }
});

// --- Queuing system ---
let tabQueue = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || tabQueue.length === 0) return;
  isProcessingQueue = true;
  logger.log(`[processQueue] Started processing ${tabQueue.length} tabs.`);
  while (tabQueue.length > 0) {
    const tabInfo = tabQueue.shift();
    logger.log("[processQueue] Processing next tab:", tabInfo);
    try {
      await handleTab(tabInfo);
    } catch (error) {
      logger.error(
        `[processQueue] Error processing tab ${tabInfo.tabId}:`,
        error
      );
    }
  }
  isProcessingQueue = false;
  logger.log("[processQueue] Finished processing queue.");
}
function getDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname;
  } catch (err) {
    logger.warn(`[getDomain] Invalid URL: ${url}`, err);
    return null;
  }
}
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ domainGroups: {} }, (result) => {
      resolve(result.domainGroups);
    });
  });
}
async function handleTab({ tabId, url, windowId }, retryCount = 0) {
  logger.log(
    `[handleTab] Checking Tab ID: ${tabId}, Attempt: ${retryCount + 1}`
  );
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    logger.log(`[handleTab] Tab not found: ${tabId}, likely closed.`);
    return;
  }
  if (tab.pinned) {
    logger.log(`[handleTab] Tab ${tabId} is pinned. Skipping.`);
    return;
  }
  if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    logger.log(`[handleTab] Tab ${tabId} is already in a group. Skipping.`);
    return;
  }
  const domain = getDomain(tab.url);
  if (!domain) return;
  const domainGroups = await getConfig();
  let groupInfo = null;
  for (const [key, info] of Object.entries(domainGroups)) {
    if (info.isRegex) {
      try {
        const regex = new RegExp(key);
        if (regex.test(tab.url)) {
          groupInfo = info;
          break;
        }
      } catch (e) {
        logger.warn(`[handleTab] Invalid regex '${key}':`, e);
      }
    } else {
      const ruleDomain = key.startsWith("*.") ? key.slice(2) : key;
      if (domain === ruleDomain || domain.endsWith(`.${ruleDomain}`)) {
        groupInfo = info;
        break;
      }
    }
  }
  if (!groupInfo || groupInfo.enabled === false) return;
  logger.log(`[handleTab] Matched rule for ${tab.url}:`, groupInfo);
  const targetWindowId = windowId || tab.windowId;
  let groups;
  try {
    groups = await chrome.tabGroups.query({ windowId: targetWindowId });
  } catch (err) {
    logger.error(
      `[handleTab] Failed to query tab groups for window ${targetWindowId}`,
      err
    );
    return;
  }
  let targetGroup = groups.find((g) => g.title === groupInfo.title);
  if (!targetGroup) {
    logger.log(
      `[handleTab] Creating new group in window ${targetWindowId}: ${groupInfo.title}`
    );
    try {
      const newGroupId = await chrome.tabs.group({ tabIds: tab.id });
      await chrome.tabGroups.update(newGroupId, {
        title: groupInfo.title,
        color: groupInfo.color,
      });
      logger.log(`[handleTab] Group created with ID: ${newGroupId}`);
    } catch (err) {
      if (
        err.message.includes("Tabs cannot be edited right now") &&
        retryCount < 4
      ) {
        const delay = 250 * Math.pow(2, retryCount);
        logger.warn(`[handleTab] Tab is locked. Retrying in ${delay}ms...`);
        return new Promise((resolve) =>
          setTimeout(
            () => resolve(handleTab({ tabId, url, windowId }, retryCount + 1)),
            delay
          )
        );
      } else {
        logger.error("[handleTab] Failed to create new group:", err);
      }
    }
  } else {
    logger.log(
      `[handleTab] Adding tab ${tabId} to existing group '${groupInfo.title}'`
    );
    try {
      await chrome.tabs.group({ groupId: targetGroup.id, tabIds: tab.id });
    } catch (err) {
      if (
        err.message.includes("Tabs cannot be edited right now") &&
        retryCount < 4
      ) {
        const delay = 250 * Math.pow(2, retryCount);
        logger.warn(`[handleTab] Tab is locked. Retrying in ${delay}ms...`);
        return new Promise((resolve) =>
          setTimeout(
            () => resolve(handleTab({ tabId, url, windowId }, retryCount + 1)),
            delay
          )
        );
      } else {
        logger.error(`[handleTab] Failed to add tab to group:`, err);
      }
    }
  }
}

// --- New Function to Merge Duplicate Groups ---
async function mergeDuplicateGroups() {
  logger.log("[mergeGroups] Starting group merge operation...");
  const allGroups = await chrome.tabGroups.query({});
  const currentWindow = await chrome.windows.getCurrent({});

  // 1. Organize all existing groups by their title
  const groupsByTitle = new Map();
  for (const group of allGroups) {
    if (!group.title) continue; // Skip unnamed groups
    if (!groupsByTitle.has(group.title)) {
      groupsByTitle.set(group.title, []);
    }
    groupsByTitle.get(group.title).push(group);
  }

  // 2. Iterate through the organized groups and find duplicates
  for (const [title, groups] of groupsByTitle.entries()) {
    if (groups.length <= 1) continue; // Not a duplicate

    logger.log(
      `[mergeGroups] Found ${groups.length} groups with title "${title}".`
    );

    // 3. Designate a target group (prioritize the one in the current window)
    let targetGroup = groups.find((g) => g.windowId === currentWindow.id);
    if (!targetGroup) {
      targetGroup = groups[0]; // Default to the first one found
    }
    logger.log(
      `[mergeGroups] Target group is ${targetGroup.id} in window ${targetGroup.windowId}.`
    );

    const sourceGroups = groups.filter((g) => g.id !== targetGroup.id);

    // 4. Get all tabs from all source groups
    const tabQueries = sourceGroups.map((g) =>
      chrome.tabs.query({ groupId: g.id })
    );
    const nestedTabs = await Promise.all(tabQueries);
    const tabsToMove = nestedTabs.flat();
    const tabIdsToMove = tabsToMove.map((t) => t.id);

    if (tabIdsToMove.length === 0) continue;

    // 5. Move tabs to the target window and add them to the target group
    logger.log(
      `[mergeGroups] Moving ${tabIdsToMove.length} tabs to group ${targetGroup.id}.`
    );
    await chrome.tabs.move(tabIdsToMove, {
      windowId: targetGroup.windowId,
      index: -1,
    });
    await chrome.tabs.group({ groupId: targetGroup.id, tabIds: tabIdsToMove });
  }
  logger.log("[mergeGroups] Merge operation complete.");
}

// --- Event Listeners ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE
  ) {
    tabQueue.push({ tabId, url: tab.url, windowId: tab.windowId });
    processQueue();
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url && tab.url !== "about:blank" && !tab.pendingUrl) {
    tabQueue.push({ tabId: tab.id, url: tab.url, windowId: tab.windowId });
    processQueue();
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  logger.log(
    `[onFocusChanged] Window focused: ${windowId}. Checking for ungrouped tabs.`
  );
  setTimeout(() => {
    chrome.tabs.query(
      { windowId: windowId, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE },
      (tabs) => {
        if (tabs && tabs.length > 0) {
          logger.log(
            `[onFocusChanged] Found ${tabs.length} ungrouped tabs to check.`
          );
          for (const tab of tabs) {
            if (tab.url && tab.url.startsWith("http")) {
              tabQueue.push({
                tabId: tab.id,
                url: tab.url,
                windowId: tab.windowId,
              });
            }
          }
          processQueue();
        }
      }
    );
  }, 250);
});

// Updated: Message listener now handles both actions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "consolidateTabs") {
    logger.log("[onMessage] Received request to consolidate tabs.");
    chrome.tabs.query(
      { groupId: chrome.tabGroups.TAB_GROUP_ID_NONE },
      (tabs) => {
        if (tabs && tabs.length > 0) {
          logger.log(
            `[onMessage] Found ${tabs.length} ungrouped tabs to check.`
          );
          for (const tab of tabs) {
            if (tab.url && tab.url.startsWith("http")) {
              tabQueue.push({
                tabId: tab.id,
                url: tab.url,
                windowId: tab.windowId,
              });
            }
          }
          processQueue();
        }
        sendResponse({ status: "complete", tabsFound: tabs ? tabs.length : 0 });
      }
    );
    return true;
  }

  if (message.action === "mergeGroups") {
    logger.log("[onMessage] Received request to merge groups.");
    mergeDuplicateGroups().then(() => {
      sendResponse({ status: "complete" });
    });
    return true;
  }

  if (message.action === "processSpecificTab" && message.tabInfo) {
    logger.log(
      `[onMessage] Received request to process specific tab: ${message.tabInfo.tabId}`
    );
    // Add the single tab to the processing queue and start processing.
    tabQueue.push(message.tabInfo);
    processQueue();
    sendResponse({ status: "queued" }); // Acknowledge receipt
    return true; // Indicate async response
  }
});
