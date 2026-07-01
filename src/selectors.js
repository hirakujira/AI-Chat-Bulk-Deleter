// Central place for per-platform UI selectors and pure helper logic.
// Kept dependency-free so it can be unit tested under Node.

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CGBD = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Per-platform config. Selectors are grouped so they are easy to patch
  // when a provider changes its UI.
  const PLATFORMS = {
    chatgpt: {
      label: "ChatGPT",
      origin: "https://chatgpt.com",
      // Conversation id from /c/<id>.
      hrefPattern: /^\/c\/([0-9a-zA-Z-]+)/,
      selectors: {
        conversationLink: 'nav a[href^="/c/"]',
        optionsTrigger: 'button[aria-haspopup="menu"], button[data-testid$="-options"]',
        menu: '[role="menu"]',
        deleteMenuItem: '[role="menuitem"]',
        confirmDialog: '[role="dialog"]',
        // Language-independent confirm button for "Delete chat?" dialog.
        confirmDeleteButton: '[data-testid="delete-conversation-confirm-button"]',
      },
    },
    gemini: {
      label: "Gemini",
      origin: "https://gemini.google.com",
      // Conversation id from /app/<id>.
      hrefPattern: /^\/app\/([0-9a-zA-Z_-]+)/,
      selectors: {
        conversationLink: '[data-test-id="conversation"], a[href^="/app/"]',
        optionsTrigger: 'button:has(mat-icon[fonticon="more_vert"]), button[aria-haspopup="menu"]',
        menu: '[role="menu"]',
        deleteMenuItem: '[role="menuitem"], button[data-test-id="delete-button"]',
        confirmDialog: '[role="dialog"], mat-dialog-container, .mat-mdc-dialog-surface',
        confirmDeleteButton: '[data-test-id="confirm-button"] button, [data-test-id="confirm-button"]',
      },
    },
    claude: {
      label: "Claude",
      origin: "https://claude.ai",
      // Conversation id from /chat/<id>.
      hrefPattern: /^\/chat\/([0-9a-zA-Z-]+)/,
      selectors: {
        // Scoped to actual sidebar rows; plain a[href^="/chat/"] also matches
        // unrelated /chat/ links elsewhere on the page (no options menu there).
        conversationLink: 'a[data-dd-action-name="sidebar-chat-item"]',
        optionsTrigger: 'button[aria-haspopup="menu"]',
        menu: '[role="menu"]',
        deleteMenuItem: '[data-testid="delete-chat-trigger"]',
        // Claude's confirm dialog is role="alertdialog", not "dialog".
        confirmDialog: '[role="alertdialog"]',
        // No testid on the confirm button; Cancel is first, Delete is last,
        // so this falls back to the dialog's last button (see content.js).
        confirmDeleteButton: null,
      },
    },
  };

  // Map a hostname to a platform key, or null when unsupported.
  function detectPlatform(hostname) {
    if (typeof hostname !== "string") {
      return null;
    }
    if (hostname.endsWith("chatgpt.com") || hostname.endsWith("chat.openai.com")) {
      return "chatgpt";
    }
    if (hostname.endsWith("gemini.google.com")) {
      return "gemini";
    }
    if (hostname.endsWith("claude.ai")) {
      return "claude";
    }
    return null;
  }

  // Extract the conversation id from a href for a given platform.
  // Accepts absolute URLs or root-relative paths; returns null when no match.
  function parseConversationId(href, platformKey) {
    const platform = PLATFORMS[platformKey];
    if (!platform || typeof href !== "string" || href.length === 0) {
      return null;
    }
    let path = href;
    try {
      path = new URL(href, platform.origin).pathname;
    } catch (_e) {
      // Fall back to treating href as a path.
    }
    const match = platform.hrefPattern.exec(path);
    return match ? match[1] : null;
  }

  // Build a deduped list of conversations from raw {id, href, title} entries.
  // Drops entries without a valid id and keeps first occurrence order.
  function dedupeConversations(entries, platformKey) {
    if (!Array.isArray(entries)) {
      return [];
    }
    const seen = new Set();
    const out = [];
    for (const entry of entries) {
      const id =
        (entry && entry.id) || parseConversationId(entry && entry.href, platformKey);
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      out.push({
        id,
        href: (entry && entry.href) || id,
        title: (entry && entry.title) || id,
      });
    }
    return out;
  }

  return {
    PLATFORMS,
    detectPlatform,
    parseConversationId,
    dedupeConversations,
  };
});
