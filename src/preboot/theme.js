(() => {
  try {
    const keys = [
      "onion_theme",
      "onion:theme",
      "theme"
    ];

    let theme = null;

    for (const key of keys) {
      const value =
        localStorage.getItem(key);

      if (
        value === "dark" ||
        value === "light"
      ) {
        theme = value;
        break;
      }
    }

    if (!theme) {
      theme =
        window.matchMedia &&
        window.matchMedia(
          "(prefers-color-scheme: light)"
        ).matches
          ? "light"
          : "dark";
    }

    document.documentElement.setAttribute(
      "data-theme",
      theme
    );
  } catch {
    document.documentElement.setAttribute(
      "data-theme",
      "dark"
    );
  }
})();
