(() => {
  const key = "fastappunti-theme";
  const system = matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try { preference = localStorage.getItem(key); } catch {}
  // Local HTML pages can have separate storage; carry the choice across workspace links.
  const url = new URL(location.href);
  const incoming = url.searchParams.get("theme");
  if (["light", "dark"].includes(incoming)) {
    preference = incoming;
    try { localStorage.setItem(key, preference); } catch {}
    url.searchParams.delete("theme");
    history.replaceState(history.state, "", url.href);
  }
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll("[data-toggle-theme]").forEach(button => {
      button.textContent = theme === "dark" ? "Tema chiaro" : "Tema scuro";
      button.setAttribute("aria-label", `Passa al tema ${theme === "dark" ? "chiaro" : "scuro"}`);
    });
    if (location.protocol === "file:") document.querySelectorAll("[data-workspace]").forEach(link => {
      const destination = new URL(link.href);
      destination.searchParams.set("theme", theme);
      link.href = destination.href;
    });
    document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  }
  const current = () => ["light", "dark"].includes(preference) ? preference : system.matches ? "dark" : "light";
  apply(current());
  document.addEventListener("DOMContentLoaded", () => apply(current()));
  document.addEventListener("click", event => {
    if (!event.target.closest("[data-toggle-theme]")) return;
    preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(key, preference); } catch {}
    apply(preference);
  });
  system.addEventListener("change", () => apply(current()));
  window.addEventListener("storage", event => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue;
    apply(current());
  });
})();
