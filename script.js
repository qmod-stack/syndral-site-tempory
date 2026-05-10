const navToggle = document.querySelector("[data-nav-toggle]");
const navMenu = document.querySelector("[data-nav-menu]");
const header = document.querySelector("[data-header]");

function closeMenu() {
  if (!navToggle || !navMenu) return;
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Open navigation");
  navMenu.classList.remove("is-open");
}

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
    navMenu.classList.toggle("is-open", !isOpen);
  });

  navMenu.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      closeMenu();
    }
  });
}

document.addEventListener("click", (event) => {
  if (!header || !navMenu || !navToggle) return;
  if (!header.contains(event.target)) {
    closeMenu();
  }
});

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (event) => {
    const targetId = anchor.getAttribute("href");
    if (!targetId || targetId === "#") return;

    const target = document.querySelector(targetId);
    if (!target) return;

    event.preventDefault();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    history.pushState(null, "", targetId);
  });
});
