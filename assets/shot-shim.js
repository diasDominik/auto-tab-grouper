// assets/shot-shim.js
// A minimal chrome.* shim so the real popup.js / options.js / theme.js can run
// outside the extension host when capturing store screenshots. This keeps the
// screenshots honest: the production code paths and stylesheet do the
// rendering, only the storage and messaging backends are stubbed.

(function () {
  // Lets a screenshot page ask for a specific theme, e.g. ?theme=dark
  const requestedTheme =
    new URLSearchParams(location.search).get("theme") || "system";

  const store = {
    theme: requestedTheme,
    debugModeEnabled: false,
    domainGroups: {
      "*.google.com": {
        title: "Google",
        color: "blue",
        enabled: true,
        isRegex: false,
      },
      "mail.google.com": {
        title: "Mail",
        color: "red",
        enabled: true,
        isRegex: false,
      },
      "github.com": {
        title: "Code",
        color: "purple",
        enabled: true,
        isRegex: false,
      },
      "*.atlassian.net": {
        title: "Work",
        color: "green",
        enabled: true,
        isRegex: false,
      },
      "news.ycombinator.com": {
        title: "Reading",
        color: "orange",
        enabled: false,
        isRegex: false,
      },
      "^https://.*/docs/": {
        title: "Docs",
        color: "cyan",
        enabled: true,
        isRegex: true,
      },
    },
  };

  const listeners = [];

  window.chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: () => Promise.resolve({ status: "complete", tabsFound: 12 }),
      openOptionsPage: () => {},
      onMessage: { addListener: () => {} },
    },
    storage: {
      sync: {
        get(defaults, cb) {
          const out = {};
          for (const [k, v] of Object.entries(defaults)) {
            out[k] = k in store ? store[k] : v;
          }
          cb(out);
        },
        set(items, cb) {
          Object.assign(store, items);
          const changes = {};
          for (const [k, v] of Object.entries(items))
            changes[k] = { newValue: v };
          listeners.forEach((fn) => fn(changes, "sync"));
          cb();
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    tabs: {
      query: async () => [
        {
          id: 1,
          url: "https://github.com/anthropics",
          windowId: 1,
          active: true,
        },
      ],
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      query: async () => [
        { id: 1, title: "Google", color: "blue", windowId: 1 },
        { id: 2, title: "Code", color: "purple", windowId: 1 },
      ],
    },
  };
})();
