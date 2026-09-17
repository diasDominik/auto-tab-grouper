// options.js

import { GROUP_COLORS, isRuleEnabled, validateRule } from "./rules.js";
import {
  getSettings,
  setSettings,
  saveRules,
  describeSaveError,
} from "./storage.js";
import { renderRuleLabel, setStatus, markDisabledState } from "./ui.js";

// DOM Elements
const domainInput = document.getElementById("domain");
const titleInput = document.getElementById("title");
const colorSelect = document.getElementById("color");
const isRegexCheckbox = document.getElementById("isRegex");
const existingGroupsDropdown = document.getElementById("existingGroups");
const saveRuleBtn = document.getElementById("saveRuleBtn");
const domainListContainer = document.getElementById("domainList");
const debugModeCheckbox = document.getElementById("debugModeCheckbox");
const exportBtn = document.getElementById("exportRulesBtn");
const importBtn = document.getElementById("importRulesBtn");
const importFileInput = document.getElementById("importRulesFile");
const statusEl = document.getElementById("status");

/** Resets the main form used for adding new rules. */
function resetAddForm() {
  domainInput.value = "";
  titleInput.value = "";
  isRegexCheckbox.checked = false;
  colorSelect.value = "grey";
  existingGroupsDropdown.selectedIndex = 0;
}

/**
 * Persists rules and re-renders, reporting any storage failure to the user.
 * @param {object} domainGroups
 * @returns {Promise<boolean>} whether the save succeeded.
 */
async function persist(domainGroups) {
  try {
    await saveRules(domainGroups);
    setStatus(statusEl, "");
    await renderDomains(domainGroups);
    return true;
  } catch (err) {
    setStatus(statusEl, describeSaveError(err));
    return false;
  }
}

function buildColorSelect(selected) {
  const select = document.createElement("select");
  for (const color of GROUP_COLORS) {
    const option = document.createElement("option");
    option.value = color;
    option.textContent = color.charAt(0).toUpperCase() + color.slice(1);
    if (color === selected) option.selected = true;
    select.appendChild(option);
  }
  return select;
}

/**
 * Creates an in-place form to edit an existing rule.
 * @param {HTMLElement} container - The <div> element of the rule being edited.
 * @param {string} originalKey - The original domain/regex key for the rule.
 * @param {object} info - The rule's configuration object {title, color, ...}.
 * @param {object} domainGroups - The complete set of all domain groups.
 */
function createInPlaceEditForm(container, originalKey, info, domainGroups) {
  container.textContent = "";
  container.style.flexWrap = "wrap";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.value = originalKey;
  keyInput.placeholder = "Domain or Regex";
  keyInput.style.flex = "2 1 150px";

  const editTitleInput = document.createElement("input");
  editTitleInput.type = "text";
  editTitleInput.value = info.title;
  editTitleInput.placeholder = "Group Title";
  editTitleInput.style.flex = "1 1 120px";

  const editColorSelect = buildColorSelect(info.color);

  const regexLabel = document.createElement("label");
  regexLabel.className = "checkbox-label";
  const regexCheckbox = document.createElement("input");
  regexCheckbox.type = "checkbox";
  regexCheckbox.checked = info.isRegex || false;
  regexLabel.appendChild(regexCheckbox);
  regexLabel.append(" Regex");

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.className = "btn-primary";
  saveBtn.onclick = async () => {
    const newKey = keyInput.value.trim();
    const newTitle = editTitleInput.value.trim();

    const error = validateRule(newKey, newTitle, regexCheckbox.checked);
    if (error) {
      setStatus(statusEl, error);
      return;
    }
    // Renaming onto another rule's key would silently destroy that rule.
    if (newKey !== originalKey && domainGroups[newKey]) {
      setStatus(statusEl, `A rule for "${newKey}" already exists.`);
      return;
    }

    const next = { ...domainGroups };
    if (originalKey !== newKey) delete next[originalKey];
    next[newKey] = {
      title: newTitle,
      color: editColorSelect.value,
      isRegex: regexCheckbox.checked,
      enabled: info.enabled,
    };

    await persist(next);
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.className = "btn-secondary";
  cancelBtn.onclick = () => {
    setStatus(statusEl, "");
    renderDomains(domainGroups);
  };

  const buttonWrapper = document.createElement("div");
  buttonWrapper.className = "item-actions";
  buttonWrapper.appendChild(saveBtn);
  buttonWrapper.appendChild(cancelBtn);

  container.appendChild(keyInput);
  container.appendChild(editTitleInput);
  container.appendChild(editColorSelect);
  container.appendChild(regexLabel);
  container.appendChild(buttonWrapper);
}

/**
 * Renders the list of configured domain rules.
 * @param {object} domainGroups - The object containing all grouping rules.
 */
async function renderDomains(domainGroups) {
  domainListContainer.textContent = "";

  // Populate the "Select Existing" dropdown
  const uniqueTitles = new Set();
  Object.values(domainGroups).forEach((info) => uniqueTitles.add(info.title));
  try {
    const activeGroups = await chrome.tabGroups.query({});
    activeGroups.forEach(
      (group) => group.title && uniqueTitles.add(group.title)
    );
  } catch (error) {
    console.error("Could not query tab groups:", error);
  }
  while (existingGroupsDropdown.options.length > 1) {
    existingGroupsDropdown.remove(1);
  }
  [...uniqueTitles].sort().forEach((title) => {
    const option = document.createElement("option");
    option.value = title;
    option.textContent = title;
    existingGroupsDropdown.appendChild(option);
  });

  for (const [domain, info] of Object.entries(domainGroups)) {
    const div = document.createElement("div");
    div.className = "domain-item";

    const colorBox = document.createElement("div");
    colorBox.className = "color-box";
    colorBox.style.backgroundColor = info.color;

    const label = document.createElement("span");
    label.className = "domain-name";
    markDisabledState(label, info);
    renderRuleLabel(label, domain, info, { strongTitle: true });

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn-secondary";
    toggleBtn.textContent = isRuleEnabled(info) ? "Disable" : "Enable";
    toggleBtn.onclick = () =>
      persist({
        ...domainGroups,
        [domain]: { ...info, enabled: !isRuleEnabled(info) },
      });

    const editBtn = document.createElement("button");
    editBtn.className = "btn-secondary";
    editBtn.textContent = "Edit";
    editBtn.onclick = (e) => {
      const itemContainer = e.target.closest(".domain-item");
      createInPlaceEditForm(itemContainer, domain, info, domainGroups);
    };

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-remove";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = () => {
      const next = { ...domainGroups };
      delete next[domain];
      persist(next);
    };

    const buttonsWrapper = document.createElement("div");
    buttonsWrapper.className = "item-actions";
    buttonsWrapper.appendChild(toggleBtn);
    buttonsWrapper.appendChild(editBtn);
    buttonsWrapper.appendChild(removeBtn);

    div.appendChild(colorBox);
    div.appendChild(label);
    div.appendChild(buttonsWrapper);
    domainListContainer.appendChild(div);
  }
}

// --- Event Listeners ---

saveRuleBtn.addEventListener("click", async () => {
  const newDomain = domainInput.value.trim();
  const newTitle = titleInput.value.trim();

  const error = validateRule(newDomain, newTitle, isRegexCheckbox.checked);
  if (error) {
    setStatus(statusEl, error);
    return;
  }

  let domainGroups;
  try {
    ({ domainGroups } = await getSettings({ domainGroups: {} }));
  } catch (err) {
    setStatus(statusEl, `Could not load rules: ${err.message}`);
    return;
  }

  if (domainGroups[newDomain]) {
    setStatus(
      statusEl,
      `A rule for "${newDomain}" already exists. Edit it below.`
    );
    return;
  }

  domainGroups[newDomain] = {
    title: newTitle,
    color: colorSelect.value,
    enabled: true,
    isRegex: isRegexCheckbox.checked,
  };

  if (await persist(domainGroups)) resetAddForm();
});

existingGroupsDropdown.addEventListener("change", (event) => {
  if (event.target.value) titleInput.value = event.target.value;
});

debugModeCheckbox.addEventListener("change", async (event) => {
  try {
    await setSettings({ debugModeEnabled: event.target.checked });
  } catch (err) {
    setStatus(statusEl, describeSaveError(err));
  }
});

// --- Import / Export ---
// Also the escape hatch for the 8KB chrome.storage.sync per-item ceiling.

exportBtn.addEventListener("click", async () => {
  try {
    const { domainGroups } = await getSettings({ domainGroups: {} });
    const blob = new Blob([JSON.stringify(domainGroups, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "auto-tab-grouper-rules.json";
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    setStatus(statusEl, `Could not export: ${err.message}`);
  }
});

importBtn.addEventListener("click", () => importFileInput.click());

/**
 * Accepts only the rule shape this extension writes, so a hand-edited or
 * unrelated JSON file cannot poison storage.
 * @param {unknown} parsed
 * @returns {object} the sanitized rule map
 */
function sanitizeImportedRules(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object of rules.");
  }
  const clean = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key || !value || typeof value !== "object") continue;
    if (typeof value.title !== "string" || !value.title) continue;
    const isRegex = value.isRegex === true;
    if (validateRule(key, value.title, isRegex)) continue;
    clean[key] = {
      title: value.title,
      color: GROUP_COLORS.includes(value.color) ? value.color : "grey",
      enabled: value.enabled !== false,
      isRegex,
    };
  }
  if (Object.keys(clean).length === 0) {
    throw new Error("No valid rules found in that file.");
  }
  return clean;
}

importFileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const imported = sanitizeImportedRules(JSON.parse(await file.text()));
    const { domainGroups } = await getSettings({ domainGroups: {} });
    const merged = { ...domainGroups, ...imported };
    if (await persist(merged)) {
      setStatus(
        statusEl,
        `Imported ${Object.keys(imported).length} rules.`,
        "info"
      );
    }
  } catch (err) {
    setStatus(statusEl, `Could not import: ${err.message}`);
  } finally {
    // Allow re-importing the same file.
    event.target.value = "";
  }
});

// --- Initialization ---
async function loadSettings() {
  try {
    const result = await getSettings({
      domainGroups: {},
      debugModeEnabled: false,
    });
    await renderDomains(result.domainGroups);
    debugModeCheckbox.checked = result.debugModeEnabled;
  } catch (err) {
    setStatus(statusEl, `Could not load settings: ${err.message}`);
  }
}

loadSettings();
