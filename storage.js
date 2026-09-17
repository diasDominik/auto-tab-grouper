// storage.js
// Promise wrappers around chrome.storage.sync that surface
// `chrome.runtime.lastError` instead of silently swallowing it.
//
// `domainGroups` is stored as a single item, so it is bounded by
// QUOTA_BYTES_PER_ITEM (8192 bytes). Without these checks a user with enough
// rules would see saves fail with no feedback at all.

/**
 * @param {object} defaults - keys to read, with their fallback values.
 * @returns {Promise<object>}
 */
export function getSettings(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(defaults, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

/**
 * @param {object} items
 * @returns {Promise<void>}
 */
export function setSettings(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

/**
 * Persists the rule map.
 * @param {object} domainGroups
 * @returns {Promise<void>} Rejects when the write fails, e.g. over quota.
 */
export function saveRules(domainGroups) {
  return setSettings({ domainGroups });
}

/**
 * Turns a storage failure into something worth showing a user.
 * @param {Error} error
 * @returns {string}
 */
export function describeSaveError(error) {
  const message = error?.message || "Unknown error";
  if (/QUOTA_BYTES/i.test(message)) {
    return "Could not save — rule storage is full. Remove some rules, or export them and trim the list.";
  }
  return `Could not save: ${message}`;
}
