import { api } from "./api.js";
import {
  loadNotificationBadge,
  setupFlash,
  setupLogout,
  setupShortcuts,
  setupSidebar,
  updateStorageWidget,
} from "./ui.js";

setupSidebar();
setupLogout();
setupFlash();
setupShortcuts();

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-password-toggle]");
  if (!button) return;

  const input = button.closest(".password-input")?.querySelector("input");
  if (!input) return;

  const showPassword = input.type === "password";
  input.type = showPassword ? "text" : "password";
  button.setAttribute("aria-pressed", String(showPassword));
  button.setAttribute(
    "aria-label",
    showPassword ? "Sembunyikan password" : "Tampilkan password",
  );
  button
    .querySelector("use")
    ?.setAttribute("href", showPassword ? "#icon-eye-off" : "#icon-eye");
});

const body = document.body;
const authed = body?.dataset.authed === "true";

if (authed) {
  const searchInput = document.querySelector(
    '.topbar-search input[type="search"]',
  );
  if (searchInput && body.dataset.page === "items") {
    const query = new URLSearchParams(window.location.search).get("q");
    if (query && !searchInput.value) searchInput.value = query;
  }

  api("/api/me")
    .then((data) => {
      updateStorageWidget(data?.storage);
    })
    .catch(() => {});

  loadNotificationBadge();
}
