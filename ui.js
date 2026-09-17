// ui.js
// Shared DOM helpers for the popup and options pages.

import { isRuleEnabled } from "./rules.js";

/**
 * Fills a label element with a rule's description.
 *
 * Built from text nodes rather than innerHTML: rule keys and titles are
 * arbitrary user input that syncs across devices, and these pages run with the
 * extension's tabs/tabGroups/storage permissions.
 *
 * @param {HTMLElement} label
 * @param {string} domain - the rule key
 * @param {object} info - the rule body
 * @param {{strongTitle?: boolean}} [options]
 */
export function renderRuleLabel(label, domain, info, options = {}) {
  label.textContent = "";

  if (info.isRegex) {
    const marker = document.createElement("span");
    marker.className = "rule-type";
    marker.textContent = "(regex)";
    label.appendChild(marker);
    label.appendChild(document.createTextNode(" "));
  }

  label.appendChild(document.createTextNode(`${domain} → `));

  const title = info.title ?? "";
  if (options.strongTitle) {
    const strong = document.createElement("strong");
    strong.textContent = title;
    label.appendChild(strong);
  } else {
    label.appendChild(document.createTextNode(title));
  }
}

/**
 * Shows or clears an inline status message.
 * @param {HTMLElement} element
 * @param {string} message - empty string hides the element.
 * @param {"error"|"info"} [kind]
 */
export function setStatus(element, message, kind = "error") {
  if (!element) return;
  element.textContent = message;
  element.className = `status-message status-${kind}`;
  element.hidden = !message;
}

/**
 * Applies the strikethrough/faded treatment for a disabled rule.
 * @param {HTMLElement} element
 * @param {object} info
 */
export function markDisabledState(element, info) {
  element.classList.toggle("disabled-rule", !isRuleEnabled(info));
}
