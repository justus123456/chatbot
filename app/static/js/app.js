const chatForm = document.querySelector("[data-chat-form]");
const chatFeed = document.querySelector("#chat-feed");
const notificationsList = document.querySelector("[data-notifications-list]");
const shell = document.querySelector("[data-shell]");
const shellStorageKey = "veritas-shell-collapsed";
const inspectorStorageKey = "veritas-chat-inspector-tab";
const notesStorageKey = "veritas-chat-notes";

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function appendMessage(role, content, sourceLabel = "") {
  if (!chatFeed) return;
  const article = document.createElement("article");
  article.className = `message message--${role}`;

  let html = "";
  if (role === "assistant" && sourceLabel) {
    html += `<div class="message__meta"><span>${escapeHtml(sourceLabel)}</span></div>`;
  }
  html += `<div class="message__bubble">${content}</div>`;
  article.innerHTML = html;
  chatFeed.appendChild(article);
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const textarea = document.querySelector("#message-input");
  const languageInput = document.querySelector("#language-input");
  const message = textarea.value.trim();
  if (!message) return;

  appendMessage("user", escapeHtml(message));
  textarea.value = "";

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, language: languageInput.value }),
  });

  const payload = await response.json();
  if (!response.ok) {
    appendMessage("assistant", escapeHtml(payload.error || "Unable to send message."), "System");
    return;
  }

  const label = payload.labels[payload.source] || payload.labels.openai_fallback;
  appendMessage("assistant", payload.response.replace(/\n/g, "<br>"), label);
}

async function refreshNotifications() {
  if (!notificationsList) return;
  const response = await fetch("/api/notifications");
  if (!response.ok) return;
  const items = await response.json();
  notificationsList.innerHTML = "";
  if (!items.length) {
    notificationsList.innerHTML = '<p class="empty-state">No notifications available.</p>';
    return;
  }
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "stack-item";
    card.innerHTML = `
      <div class="stack-item__row">
        <strong>${escapeHtml(item.type)}</strong>
        <span>${escapeHtml(item.date)}</span>
      </div>
      <p>${escapeHtml(item.message)}</p>
    `;
    notificationsList.appendChild(card);
  });
}

async function handleAdminSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const endpoint = form.dataset.adminForm;
  const targetSelector = form.dataset.target;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    alert(data.error || "Request failed");
    return;
  }
  form.reset();
  const target = document.querySelector(targetSelector);
  if (target) {
    const card = document.createElement("article");
    card.className = "stack-item";
    card.innerHTML = `<strong>${escapeHtml(data.title || data.name || data.question)}</strong><p>${escapeHtml(data.content || data.answer || data.message || data.email || data.file_url)}</p>`;
    target.prepend(card);
  }
}

if (chatForm) {
  chatForm.addEventListener("submit", handleChatSubmit);

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = document.querySelector("#message-input");
      textarea.value = button.dataset.prompt;
      textarea.focus();
    });
  });

  document.querySelectorAll("[data-language-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      const language = button.dataset.languageSwitch;
      document.querySelector("#language-input").value = language;
      document.querySelectorAll("[data-language-switch]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

document.querySelectorAll("[data-admin-form]").forEach((form) => {
  form.addEventListener("submit", handleAdminSubmit);
});

if (notificationsList) {
  refreshNotifications();
  window.setInterval(refreshNotifications, 30000);
}

function applyShellState() {
  if (!shell) return;
  const isCollapsed = window.localStorage.getItem(shellStorageKey) === "true";
  shell.classList.toggle("workspace-shell--collapsed", isCollapsed);
}

if (shell) {
  applyShellState();
  document.querySelectorAll("[data-shell-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextCollapsed = !shell.classList.contains("workspace-shell--collapsed");
      shell.classList.toggle("workspace-shell--collapsed", nextCollapsed);
      window.localStorage.setItem(shellStorageKey, String(nextCollapsed));
    });
  });
}

const inspectorTabs = document.querySelectorAll("[data-inspector-tab]");
const inspectorPanels = document.querySelectorAll("[data-inspector-panel]");

function setInspectorTab(nextTab) {
  if (!inspectorTabs.length) return;
  inspectorTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.inspectorTab === nextTab);
  });
  inspectorPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.inspectorPanel === nextTab);
  });
  window.localStorage.setItem(inspectorStorageKey, nextTab);
}

if (inspectorTabs.length) {
  const storedTab = window.localStorage.getItem(inspectorStorageKey) || "main";
  setInspectorTab(storedTab);
  inspectorTabs.forEach((button) => {
    button.addEventListener("click", () => setInspectorTab(button.dataset.inspectorTab));
  });
}

const inspectorLanguage = document.querySelector("[data-inspector-language]");
if (inspectorLanguage) {
  inspectorLanguage.addEventListener("change", () => {
    const language = inspectorLanguage.value;
    const hiddenInput = document.querySelector("#language-input");
    if (hiddenInput) hiddenInput.value = language;
    document.querySelectorAll("[data-language-switch]").forEach((item) => {
      item.classList.toggle("active", item.dataset.languageSwitch === language);
    });
  });
}

const notesField = document.querySelector("[data-chat-notes]");
if (notesField) {
  notesField.value = window.localStorage.getItem(notesStorageKey) || "";
  notesField.addEventListener("input", () => {
    window.localStorage.setItem(notesStorageKey, notesField.value);
  });
}
