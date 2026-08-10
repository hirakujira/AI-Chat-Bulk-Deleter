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
        deleteMenuItem: '[data-testid="delete-chat-menu-item"]',
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
        // Gemini no longer exposes data-test-id="confirm-button". Angular
        // Material marks the destructive default action with cdkfocusinitial.
        confirmDeleteButton:
          'gem-button[cdkfocusinitial] button, [cdkfocusinitial] button, button[cdkfocusinitial]',
      },
    },
    claude: {
      label: "Claude",
      origin: "https://claude.ai",
      // Conversation id from /chat/<id>.
      hrefPattern: /^\/chat\/([0-9a-zA-Z-]+)/,
      selectors: {
        // Sidebar rows (data-dd-action-name) and the /recents "all chats"
        // table rows (data-primary, href-scoped so it excludes other tables
        // e.g. Projects) both list conversations; unscoped a[href^="/chat/"]
        // also matches unrelated /chat/ links elsewhere on the page.
        conversationLink:
          'a[data-dd-action-name="sidebar-chat-item"], a[data-primary="true"][href^="/chat/"]',
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
    grok: {
      label: "Grok",
      origin: "https://grok.com",
      // Conversation id from /c/<uuid>.
      hrefPattern: /^\/c\/([0-9a-zA-Z-]+)/,
      // Grok deletes immediately from the options menu and does not show a
      // confirmation dialog.
      requiresDeleteConfirmation: false,
      // Radix opens the dropdown on pointerdown rather than click.
      optionsTriggerActivation: "pointerdown",
      selectors: {
        conversationLink: 'li[data-sidebar="menu-item"] a[href^="/c/"]',
        optionsTrigger: 'button[aria-haspopup="menu"]',
        menu: '[role="menu"]',
        deleteMenuItem: '[role="menuitem"]',
        confirmDialog: null,
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
    if (hostname === "grok.com") {
      return "grok";
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

  // Return an inclusive random integer. The random source is injectable so
  // callers can test the helper without relying on nondeterministic values.
  function randomInt(min, max, random = Math.random) {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return low + Math.floor(random() * (high - low + 1));
  }

  // Return a shuffled copy without changing the original list.
  function shuffleConversations(conversations, random = Math.random) {
    const shuffled = Array.isArray(conversations) ? [...conversations] : [];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = randomInt(0, index, random);
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  // Remove only successfully deleted conversations while preserving the
  // selection state of failed or skipped items.
  function reconcileDeletionResults(conversations, selectedIds, results) {
    const deletedIds = new Set(
      (Array.isArray(results) ? results : [])
        .filter((result) => result && result.status === "deleted")
        .map((result) => result.id)
    );
    return {
      conversations: (Array.isArray(conversations) ? conversations : []).filter(
        (conversation) => conversation && !deletedIds.has(conversation.id)
      ),
      selectedIds: (Array.isArray(selectedIds) ? selectedIds : []).filter(
        (id) => !deletedIds.has(id)
      ),
    };
  }

  return {
    PLATFORMS,
    detectPlatform,
    parseConversationId,
    dedupeConversations,
    randomInt,
    shuffleConversations,
    reconcileDeletionResults,
  };
});
