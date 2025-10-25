// popup.js

function renderDomains(domainGroups) {
  const container = document.getElementById("domainList");
  container.innerHTML = "";

  if (Object.keys(domainGroups).length === 0) {
    container.style.textAlign = "center";
    container.style.color = "var(--text-secondary-color)";
    container.textContent = "No rules yet. Add one in Settings!";
    return;
  }

  for (const [domain, info] of Object.entries(domainGroups)) {
    const div = document.createElement("div");
    div.className = "domain-item popup-rule"; // Added a new class for specific styling
    div.title = `Click to ${info.enabled !== false ? "disable" : "enable"} this rule`;

    // Add a class to visually show the disabled state
    if (info.enabled === false) {
      div.classList.add("disabled-rule");
    }

    const colorBox = document.createElement("div");
    colorBox.className = "color-box";
    colorBox.style.backgroundColor = info.color || "grey";

    const label = document.createElement("span");
    label.className = "domain-name";

    const ruleType = info.isRegex
      ? `<span class="rule-type">(regex)</span> `
      : "";
    label.innerHTML = `${ruleType}${domain} &rarr; ${info.title}`;

    // Make the entire item clickable to toggle the rule
    div.onclick = () => {
      // Toggle the 'enabled' state (defaulting to true if undefined)
      info.enabled = !(info.enabled !== false);
      domainGroups[domain] = info;
      chrome.storage.sync.set({ domainGroups }, () => {
        renderDomains(domainGroups);
      });
    };

    div.appendChild(colorBox);
    div.appendChild(label);
    container.appendChild(div);
  }
}

// Event listener for the "Group All" button
document.getElementById("consolidateTabsBtn").addEventListener("click", () => {
  const btn = document.getElementById("consolidateTabsBtn");
  btn.textContent = "Working...";
  btn.disabled = true;

  chrome.runtime.sendMessage({ action: "consolidateTabs" }, () => {
    btn.textContent = "Done!";
    setTimeout(() => {
      btn.textContent = "Group All";
      btn.disabled = false;
    }, 1500);
  });
});

// Event listener for the "Merge Groups" button
document.getElementById("mergeGroupsBtn").addEventListener("click", () => {
  const btn = document.getElementById("mergeGroupsBtn");
  btn.textContent = "Merging...";
  btn.disabled = true;

  chrome.runtime.sendMessage({ action: "mergeGroups" }, () => {
    btn.textContent = "Done!";
    setTimeout(() => {
      btn.textContent = "Merge Groups";
      btn.disabled = false;
    }, 1500);
  });
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("addCurrent").addEventListener("click", async () => {
  const btn = document.getElementById("addCurrent");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.url || !tab.url.startsWith("http")) {
      return;
    }

    btn.disabled = true; // Disable button during processing

    const domain = new URL(tab.url).hostname.replace(/^www\./, "");
    const parts = domain.split(".");
    const ruleKey =
      parts.length > 2 ? "*." + parts.slice(-2).join(".") : domain;
    const title = parts.length > 1 ? parts.slice(-2).join(".") : domain;

    chrome.storage.sync.get({ domainGroups: {} }, (result) => {
      const domainGroups = result.domainGroups;
      const ruleAlreadyExists = !!domainGroups[ruleKey];

      if (!ruleAlreadyExists) {
        domainGroups[ruleKey] = {
          title,
          color: "blue",
          enabled: true,
          isRegex: false,
        };
        chrome.storage.sync.set({ domainGroups }, () => {
          const tabInfo = {
            tabId: tab.id,
            url: tab.url,
            windowId: tab.windowId,
          };
          chrome.runtime.sendMessage(
            { action: "processSpecificTab", tabInfo: tabInfo },
            () => {
              setTimeout(() => {
                btn.disabled = false;
              }, 500);
            }
          );
        });
      } else {
        btn.disabled = false; // Rule already exists, just re-enable the button
      }
    });
  } catch (e) {
    console.error("Could not add current tab as rule:", e);
    btn.disabled = false; // Re-enable button on error
  }
});

// Listen for storage changes to keep the popup in sync
chrome.storage.onChanged.addListener((changes) => {
  if (changes.domainGroups) {
    renderDomains(changes.domainGroups.newValue);
  }
});

// Initial load
chrome.storage.sync.get({ domainGroups: {} }, (result) => {
  renderDomains(result.domainGroups);
});
