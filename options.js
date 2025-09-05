// options.js

// DOM Elements
const domainInput = document.getElementById("domain");
const titleInput = document.getElementById("title");
const colorSelect = document.getElementById("color");
const isRegexCheckbox = document.getElementById("isRegex");
const existingGroupsDropdown = document.getElementById("existingGroups");
const saveRuleBtn = document.getElementById("saveRuleBtn");
const domainListContainer = document.getElementById("domainList");
const debugModeCheckbox = document.getElementById("debugModeCheckbox");

/**
 * Resets the main form used for adding new rules.
 */
function resetAddForm() {
  domainInput.value = "";
  titleInput.value = "";
  isRegexCheckbox.checked = false;
  colorSelect.value = "grey";
  existingGroupsDropdown.selectedIndex = 0;
}

/**
 * Creates an in-place form to edit an existing rule.
 * @param {HTMLElement} container - The <div> element of the rule to be edited.
 * @param {string} originalKey - The original domain/regex key for the rule.
 * @param {object} info - The rule's configuration object {title, color, ...}.
 * @param {object} domainGroups - The complete set of all domain groups.
 */
function createInPlaceEditForm(container, originalKey, info, domainGroups) {
  container.innerHTML = ""; // Clear the static content
  container.style.flexWrap = "wrap"; // Allow inputs to wrap if needed

  // --- Create and configure input elements ---
  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.value = originalKey;
  keyInput.placeholder = "Domain or Regex";
  keyInput.style.flex = "2 1 150px"; // Grow and shrink, base width 150px

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = info.title;
  titleInput.placeholder = "Group Title";
  titleInput.style.flex = "1 1 120px";

  const editColorSelect = document.createElement("select");
  const colors = [
    "grey",
    "blue",
    "red",
    "yellow",
    "green",
    "pink",
    "purple",
    "cyan",
    "orange",
  ];
  colors.forEach((color) => {
    const option = document.createElement("option");
    option.value = color;
    option.textContent = color.charAt(0).toUpperCase() + color.slice(1);
    if (color === info.color) option.selected = true;
    editColorSelect.appendChild(option);
  });

  const regexLabel = document.createElement("label");
  regexLabel.className = "checkbox-label";
  const regexCheckbox = document.createElement("input");
  regexCheckbox.type = "checkbox";
  regexCheckbox.checked = info.isRegex || false;
  regexLabel.appendChild(regexCheckbox);
  regexLabel.append(" Regex");

  // --- Create action buttons ---
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.className = "btn-primary";
  saveBtn.onclick = () => {
    const newKey = keyInput.value.trim();
    const newTitle = titleInput.value.trim();
    if (!newKey || !newTitle) return; // Basic validation

    // If the key has changed, we must remove the old one.
    if (originalKey !== newKey) {
      delete domainGroups[originalKey];
    }

    // Update or create the new entry, preserving the enabled state
    domainGroups[newKey] = {
      title: newTitle,
      color: editColorSelect.value,
      isRegex: regexCheckbox.checked,
      enabled: info.enabled,
    };

    chrome.storage.sync.set({ domainGroups }, () =>
      renderDomains(domainGroups)
    );
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.className = "btn-secondary";
  cancelBtn.onclick = () => {
    // Just re-render the list to cancel the edit
    renderDomains(domainGroups);
  };

  const buttonWrapper = document.createElement("div");
  buttonWrapper.style.marginLeft = "auto";
  buttonWrapper.style.display = "flex";
  buttonWrapper.style.gap = "6px";
  buttonWrapper.appendChild(saveBtn);
  buttonWrapper.appendChild(cancelBtn);

  // --- Append all new elements to the container ---
  container.appendChild(keyInput);
  container.appendChild(titleInput);
  container.appendChild(editColorSelect);
  container.appendChild(regexLabel);
  container.appendChild(buttonWrapper);
}

/**
 * Renders the list of configured domain rules.
 * @param {object} domainGroups - The object containing all grouping rules.
 */
async function renderDomains(domainGroups) {
  domainListContainer.innerHTML = "";

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
  while (existingGroupsDropdown.options.length > 1)
    existingGroupsDropdown.remove(1);
  [...uniqueTitles].sort().forEach((title) => {
    const option = document.createElement("option");
    option.value = title;
    option.textContent = title;
    existingGroupsDropdown.appendChild(option);
  });

  // Render each rule item
  for (const [domain, info] of Object.entries(domainGroups)) {
    const div = document.createElement("div");
    div.className = "domain-item";

    const colorBox = document.createElement("div");
    colorBox.className = "color-box";
    colorBox.style.backgroundColor = info.color;

    const label = document.createElement("span");
    label.className = "domain-name";
    if (info.enabled === false) {
      label.style.opacity = "0.5";
      label.style.textDecoration = "line-through";
    }
    const ruleType = info.isRegex
      ? `<span class="rule-type">(regex)</span> `
      : "";
    label.innerHTML = `${ruleType}${domain} &rarr; <strong>${info.title}</strong>`;

    // --- Action Buttons (Toggle, Edit, Remove) ---
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn-secondary";
    toggleBtn.textContent = info.enabled === false ? "Enable" : "Disable";
    toggleBtn.onclick = () => {
      domainGroups[domain].enabled = !(info.enabled !== false);
      chrome.storage.sync.set({ domainGroups }, () =>
        renderDomains(domainGroups)
      );
    };

    const editBtn = document.createElement("button");
    editBtn.className = "btn-secondary";
    editBtn.textContent = "Edit";
    editBtn.onclick = (e) => {
      // Find the parent .domain-item and pass it to the form creation function
      const itemContainer = e.target.closest(".domain-item");
      createInPlaceEditForm(itemContainer, domain, info, domainGroups);
    };

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-remove";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = () => {
      delete domainGroups[domain];
      chrome.storage.sync.set({ domainGroups }, () =>
        renderDomains(domainGroups)
      );
    };

    const buttonsWrapper = document.createElement("div");
    buttonsWrapper.style.marginLeft = "auto";
    buttonsWrapper.style.display = "flex";
    buttonsWrapper.style.gap = "6px";
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

// Main "Add Rule" button logic
saveRuleBtn.addEventListener("click", () => {
  const newDomain = domainInput.value.trim();
  const newTitle = titleInput.value.trim();
  if (!newDomain || !newTitle) return;

  chrome.storage.sync.get({ domainGroups: {} }, (result) => {
    const domainGroups = result.domainGroups;

    // Create new rule entry
    domainGroups[newDomain] = {
      title: newTitle,
      color: colorSelect.value,
      enabled: true,
      isRegex: isRegexCheckbox.checked,
    };

    chrome.storage.sync.set({ domainGroups }, () => {
      renderDomains(domainGroups);
      resetAddForm();
    });
  });
});

// Dropdown selection logic
existingGroupsDropdown.addEventListener("change", (event) => {
  const selectedTitle = event.target.value;
  if (selectedTitle) {
    titleInput.value = selectedTitle;
  }
});

// Debug Mode Checkbox Logic
debugModeCheckbox.addEventListener("change", (event) => {
  chrome.storage.sync.set({ debugModeEnabled: event.target.checked });
});

// --- Initialization ---

// Function to initialize all settings from storage
function loadSettings() {
  chrome.storage.sync.get(
    { domainGroups: {}, debugModeEnabled: false },
    (result) => {
      renderDomains(result.domainGroups);
      debugModeCheckbox.checked = result.debugModeEnabled;
    }
  );
}

// Initial load
loadSettings();
