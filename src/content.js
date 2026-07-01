// Content script: injects a control panel into a supported AI chat site and
// performs UI-driven batch deletion of conversations. No private APIs, no
// token access, no manual sidebar DOM removal.
(function () {
  "use strict";

  const { PLATFORMS, detectPlatform, parseConversationId, dedupeConversations } = window.CGBD;

  const platformKey = detectPlatform(location.hostname);
  if (!platformKey) {
    return;
  }
  const platform = PLATFORMS[platformKey];
  const SELECTORS = platform.selectors;

  const PANEL_ID = "cgbd-panel";
  const DEFAULT_DELAY_MS = 1200;
  // ChatGPT's sidebar is slow to drop deleted rows; wait longer before rescanning.
  const RESCAN_DELAY_MS = 2500;

  // Localized string lookup via the extension's _locales messages.
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
  const statusLabel = (status) =>
    t({ deleted: "statusDeleted", failed: "statusFailed", skipped: "statusSkipped" }[status] || status);

  const state = {
    queue: [],
    running: false,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function $(selector, root = document) {
    return root.querySelector(selector);
  }
  function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  // Dispatch a full pointer/mouse sequence. Synthetic .click() alone does not
  // reliably activate Angular Material (Gemini) buttons.
  function realClick(el) {
    if (!el) return false;
    if (typeof el.focus === "function") {
      el.focus();
    }
    if (typeof el.click === "function") {
      el.click();
    } else {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }
    return true;
  }

  // Poll for an element until it appears or the timeout elapses.
  async function waitFor(selector, timeout = 3000, interval = 100) {
    const start = Date.now();
    let el = $(selector);
    while (!el && Date.now() - start < timeout) {
      await sleep(interval);
      el = $(selector);
    }
    return el;
  }

  // Buttons can stay disabled for a moment while a dialog's open transition
  // runs (e.g. Claude); a disabled button silently ignores .click().
  function isDisabled(el) {
    return !!(el.disabled || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled"));
  }

  // Poll until an element is no longer disabled or the timeout elapses.
  async function waitUntilEnabled(el, timeout = 3000, interval = 100) {
    const start = Date.now();
    while (el && isDisabled(el) && Date.now() - start < timeout) {
      await sleep(interval);
    }
    return el;
  }

  // -- Scanning ------------------------------------------------------------

  // Some platforms (e.g. Claude) duplicate the label in a visually-hidden
  // .sr-only span alongside the visible one; strip it before reading text.
  function extractTitle(a) {
    const clone = a.cloneNode(true);
    $$(".sr-only", clone).forEach((el) => el.remove());
    return (clone.textContent || "").trim();
  }

  function scanConversations() {
    const links = $$(SELECTORS.conversationLink);
    const raw = links.map((a) => {
      const href = a.getAttribute("href") || "";
      return {
        id: parseConversationId(href, platformKey),
        href,
        title: extractTitle(a),
      };
    });
    return dedupeConversations(raw, platformKey);
  }

  // -- Deletion of a single conversation -----------------------------------

  function findLink(id) {
    return $$(SELECTORS.conversationLink).find(
      (a) => parseConversationId(a.getAttribute("href") || "", platformKey) === id
    );
  }

  function findOptionsTrigger(linkEl) {
    // The options button usually lives in the same row as the link.
    const row =
      linkEl.closest('[data-test-id="conversation"]') ||
      linkEl.closest("li") ||
      linkEl.parentElement;
    if (!row) return null;
    // Gemini reveals the actions button only on hover/focus.
    row.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    return row.querySelector(SELECTORS.optionsTrigger) || row;
  }

  async function clickDeleteMenuItem() {
    const menu = await waitFor(SELECTORS.menu, 2000);
    if (!menu) return false;
    const items = $$(SELECTORS.deleteMenuItem, menu);
    if (items.length === 0) return false;
    // Delete is the last item in the conversation options menu.
    realClick(items[items.length - 1]);
    return true;
  }

  async function confirmDeletion() {
    // Wait for the confirm button itself to avoid matching a stale dialog root.
    let confirm = SELECTORS.confirmDeleteButton
      ? await waitFor(SELECTORS.confirmDeleteButton, 3000)
      : null;
    if (!confirm) {
      const dialog = await waitFor(SELECTORS.confirmDialog, 3000);
      if (!dialog) return false;
      // Fall back to the dialog's last button (Cancel left, Delete right).
      const buttons = $$("button", dialog);
      confirm = buttons[buttons.length - 1];
    }
    if (!confirm) return false;
    // The button can still be disabled during the dialog's open transition;
    // clicking it then would silently no-op.
    await waitUntilEnabled(confirm, 3000);
    if (isDisabled(confirm)) return false;
    realClick(confirm);
    return true;
  }

  async function deleteOne(conv) {
    // Re-locate the link, it may have re-rendered after previous deletions.
    const link = findLink(conv.id);
    if (!link) {
      return { id: conv.id, status: "skipped", reason: "link not found" };
    }
    link.scrollIntoView({ block: "center" });
    const trigger = findOptionsTrigger(link);
    if (!trigger) {
      return { id: conv.id, status: "failed", reason: "options trigger not found" };
    }
    realClick(trigger);
    const opened = await clickDeleteMenuItem();
    if (!opened) {
      return { id: conv.id, status: "failed", reason: "delete menu item not found" };
    }
    const confirmed = await confirmDeletion();
    if (!confirmed) {
      return { id: conv.id, status: "failed", reason: "confirm dialog not found" };
    }
    return { id: conv.id, status: "deleted" };
  }

  // -- Batch runner --------------------------------------------------------

  async function runDeletion(delayMs, log) {
    state.running = true;
    const results = { deleted: 0, failed: 0, skipped: 0 };

    for (let i = 0; i < state.queue.length; i++) {
      const conv = state.queue[i];
      let res;
      try {
        res = await deleteOne(conv);
      } catch (e) {
        res = { id: conv.id, status: "failed", reason: String(e && e.message) };
      }
      results[res.status] = (results[res.status] || 0) + 1;
      const line = t("logLine", [
        String(i + 1),
        String(state.queue.length),
        statusLabel(res.status),
        conv.title || conv.id,
      ]);
      log(`${line}${res.reason ? ` (${res.reason})` : ""}`);
      await sleep(delayMs);
    }

    state.running = false;
    log(t("done", [String(results.deleted), String(results.failed), String(results.skipped)]));
    return results;
  }

  // -- Panel UI ------------------------------------------------------------

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="cgbd-header">
        <span>${escapeHtml(t("appName"))} &middot; ${platform.label}</span>
        <button class="cgbd-close" title="${escapeHtml(t("close"))}">&times;</button>
      </div>
      <div class="cgbd-body">
        <div class="cgbd-row">
          <button class="cgbd-scan">${escapeHtml(t("scan"))}</button>
        </div>
        <div class="cgbd-count">${escapeHtml(t("noScanned"))}</div>
        <label class="cgbd-row cgbd-selectbar" style="display:none">
          <input type="checkbox" class="cgbd-select-all-toggle" />
          <span>${escapeHtml(t("selectAll"))}</span>
        </label>
        <div class="cgbd-list"></div>
        <div class="cgbd-row">
          <button class="cgbd-delete" disabled>${escapeHtml(t("deleteSelected"))}</button>
        </div>
        <pre class="cgbd-log"></pre>
      </div>
    `;
    document.body.appendChild(panel);
    wirePanel(panel);
  }

  function wirePanel(panel) {
    const elCount = $(".cgbd-count", panel);
    const elList = $(".cgbd-list", panel);
    const btnScan = $(".cgbd-scan", panel);
    const btnDelete = $(".cgbd-delete", panel);
    const elLog = $(".cgbd-log", panel);
    const elSelectBar = $(".cgbd-selectbar", panel);
    const selectAllToggle = $(".cgbd-select-all-toggle", panel);

    let scanned = [];

    const log = (msg) => {
      elLog.textContent += `${msg}\n`;
      elLog.scrollTop = elLog.scrollHeight;
    };

    const getCheckboxes = () => $$(".cgbd-check", elList);

    const selectedIds = () =>
      getCheckboxes().filter((cb) => cb.checked).map((cb) => cb.dataset.id);

    const refreshDeleteEnabled = () => {
      const count = selectedIds().length;
      btnDelete.textContent = count > 0 ? t("deleteSelectedCount", [String(count)]) : t("deleteSelected");
      btnDelete.disabled = !(count > 0 && !state.running);
    };

    const doScan = () => {
      scanned = scanConversations();
      elCount.textContent = t("foundCount", [String(scanned.length)]);
      elSelectBar.style.display = scanned.length > 0 ? "flex" : "none";
      selectAllToggle.checked = false;
      elList.innerHTML = scanned
        .map(
          (c) =>
            `<label class="cgbd-item" title="${c.id}">` +
            `<input type="checkbox" class="cgbd-check" data-id="${c.id}" />` +
            `<span class="cgbd-title">${escapeHtml(c.title || c.id)}</span></label>`
        )
        .join("");
      getCheckboxes().forEach((cb) => cb.addEventListener("change", refreshDeleteEnabled));
      refreshDeleteEnabled();
    };

    btnScan.addEventListener("click", doScan);

    selectAllToggle.addEventListener("change", () => {
      getCheckboxes().forEach((cb) => (cb.checked = selectAllToggle.checked));
      refreshDeleteEnabled();
    });

    btnDelete.addEventListener("click", async () => {
      const ids = new Set(selectedIds());
      state.queue = scanned.filter((c) => ids.has(c.id));
      if (state.queue.length === 0) return;
      btnDelete.disabled = true;
      btnScan.disabled = true;
      log(t("deleting", [String(state.queue.length)]));
      await runDeletion(DEFAULT_DELAY_MS, log);
      btnScan.disabled = false;
      // Let the sidebar settle, then refresh so deleted conversations drop off.
      await sleep(RESCAN_DELAY_MS);
      doScan();
      log(t("rescanned"));
    });

    $(".cgbd-close", panel).addEventListener("click", () => {
      panel.remove();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // Toggle the panel on/off; built on demand when the extension icon is clicked.
  function togglePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.remove();
    } else {
      buildPanel();
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "toggle-panel") {
      togglePanel();
    }
  });
})();
