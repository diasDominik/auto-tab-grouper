// popup.js

import { deriveRuleFromHostname, isRuleEnabled } from "./rules.js";
import { getSettings, saveRules, describeSaveError } from "./storage.js";
import { renderRuleLabel, setStatus, markDisabledState } from "./ui.js";

const statusEl = document.getElementById("status");

function renderDomains(domainGroups) {
  const container = document.getElementById("domainList");
  container.textContent = "";
  container.classList.toggle(
    "is-empty",
    Object.keys(domainGroups).length === 0
  );

  if (Object.keys(domainGroups).length === 0) {
    container.textContent = "No rules yet. Add one in Settings!";
    return;
  }

  for (const [domain, info] of Object.entries(domainGroups)) {
    const div = document.createElement("div");
    div.className = "domain-item popup-rule";
    div.title = `Click to ${isRuleEnabled(info) ? "disable" : "enable"} this rule`;
    markDisabledState(div, info);

    const colorBox = document.createElement("div");
    colorBox.className = "color-box";
    colorBox.style.backgroundColor = info.color || "grey";

    const label = document.createElement("span");
    label.className = "domain-name";
    renderRuleLabel(label, domain, info);

    div.onclick = async () => {
      const next = {
        ...domainGroups,
        [domain]: { ...info, enabled: !isRuleEnabled(info) },
      };
      try {
        await saveRules(next);
        setStatus(statusEl, "");
        renderDomains(next);
      } catch (err) {
        setStatus(statusEl, describeSaveError(err));
      }
    };

    div.appendChild(colorBox);
    div.appendChild(label);
    container.appendChild(div);
  }
}

/**
 * Wires a button that sends one message to the service worker, keeping it
 * disabled until a response arrives so a failure cannot strand the label.
 */
function wireActionButton(id, { busyLabel, message, onSuccess }) {
  const btn = document.getElementById(id);
  const idleLabel = btn.textContent;

  btn.addEventListener("click", async () => {
    btn.textContent = busyLabel;
    btn.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (response?.status === "error") {
        setStatus(statusEl, response.message || "Something went wrong.");
        btn.textContent = idleLabel;
      } else {
        setStatus(statusEl, "");
        btn.textContent = onSuccess?.(response) ?? "Done!";
        setTimeout(() => {
          btn.textContent = idleLabel;
        }, 1500);
      }
    } catch (err) {
      setStatus(statusEl, err?.message ?? String(err));
      btn.textContent = idleLabel;
    } finally {
      btn.disabled = false;
    }
  });
}

wireActionButton("consolidateTabsBtn", {
  busyLabel: "Working...",
  message: { action: "consolidateTabs" },
});

wireActionButton("mergeGroupsBtn", {
  busyLabel: "Merging...",
  message: { action: "mergeGroups" },
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("addCurrent").addEventListener("click", async () => {
  const btn = document.getElementById("addCurrent");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("http")) {
    setStatus(statusEl, "This tab cannot be grouped.");
    return;
  }

  btn.disabled = true;
  try {
    const { hostname } = new URL(tab.url);
    const { ruleKey, title } = deriveRuleFromHostname(hostname);
    const { domainGroups } = await getSettings({ domainGroups: {} });

    if (domainGroups[ruleKey]) {
      setStatus(statusEl, `A rule for ${ruleKey} already exists.`);
      return;
    }

    domainGroups[ruleKey] = {
      title,
      color: "blue",
      enabled: true,
      isRegex: false,
    };
    await saveRules(domainGroups);
    setStatus(statusEl, "");
    await chrome.runtime.sendMessage({
      action: "processSpecificTab",
      tabInfo: { tabId: tab.id, url: tab.url, windowId: tab.windowId },
    });
  } catch (err) {
    setStatus(statusEl, describeSaveError(err));
  } finally {
    btn.disabled = false;
  }
});

// Keep the popup in sync with the options page.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.domainGroups) {
    renderDomains(changes.domainGroups.newValue ?? {});
  }
});

// Initial load
getSettings({ domainGroups: {} })
  .then((result) => renderDomains(result.domainGroups))
  .catch((err) => setStatus(statusEl, `Could not load rules: ${err.message}`));
