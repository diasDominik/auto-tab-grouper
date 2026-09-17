// theme.js

document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("theme-toggle");
  const body = document.body;

  // SVG icons for the button
  const icons = {
    system:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19ZM12 20a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-5-8a5 5 0 0 0 5 5V7a5 5 0 0 0-5 5Z"/></svg>',
    light:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Z"/></svg>',
    dark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Zm0-1.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z"/></svg>',
  };

  const applyTheme = (theme) => {
    // All three states are expressible in CSS: "light" and "dark" pin the
    // palette, "system" removes both classes and lets the
    // prefers-color-scheme block in style.css decide. That is what keeps the
    // popup from rendering light for a frame before this code runs.
    body.classList.toggle("dark-theme", theme === "dark");
    body.classList.toggle("light-theme", theme === "light");
    // Update icon and title
    themeToggle.innerHTML = icons[theme];
    themeToggle.setAttribute(
      "title",
      `Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`
    );
  };

  themeToggle.addEventListener("click", () => {
    chrome.storage.sync.get({ theme: "system" }, (data) => {
      let currentTheme = data.theme;
      let nextTheme;

      if (currentTheme === "system") {
        nextTheme = "light";
      } else if (currentTheme === "light") {
        nextTheme = "dark";
      } else {
        nextTheme = "system";
      }

      chrome.storage.sync.set({ theme: nextTheme }, () => {
        applyTheme(nextTheme);
      });
    });
  });

  // Initial theme setup on load
  chrome.storage.sync.get({ theme: "system" }, (data) => {
    applyTheme(data.theme);
  });

  // System theme changes need no listener: with no class on <body>,
  // the prefers-color-scheme block in style.css follows the OS on its own.
});
