const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("../manifest.json");
const {
  PLATFORMS,
  detectPlatform,
  parseConversationId,
  dedupeConversations,
} = require("../src/selectors.js");

test("detectPlatform maps known hosts", () => {
  assert.strictEqual(detectPlatform("chatgpt.com"), "chatgpt");
  assert.strictEqual(detectPlatform("chat.openai.com"), "chatgpt");
  assert.strictEqual(detectPlatform("gemini.google.com"), "gemini");
  assert.strictEqual(detectPlatform("claude.ai"), "claude");
  assert.strictEqual(detectPlatform("grok.com"), "grok");
  assert.strictEqual(detectPlatform("notgrok.com"), null);
  assert.strictEqual(detectPlatform("example.com"), null);
  assert.strictEqual(detectPlatform(null), null);
});

test("parseConversationId handles ChatGPT hrefs", () => {
  assert.strictEqual(parseConversationId("/c/abc-123", "chatgpt"), "abc-123");
  assert.strictEqual(
    parseConversationId("https://chatgpt.com/c/9f8e7d6c-1234?model=gpt", "chatgpt"),
    "9f8e7d6c-1234"
  );
  assert.strictEqual(parseConversationId("/gpts", "chatgpt"), null);
});

test("parseConversationId handles Gemini hrefs", () => {
  assert.strictEqual(parseConversationId("/app/c_1a2b3c4d", "gemini"), "c_1a2b3c4d");
  assert.strictEqual(
    parseConversationId("https://gemini.google.com/app/abcDEF123", "gemini"),
    "abcDEF123"
  );
  assert.strictEqual(parseConversationId("/app", "gemini"), null);
});

test("parseConversationId handles Claude hrefs", () => {
  assert.strictEqual(parseConversationId("/chat/616d4515-d2cc-401a", "claude"), "616d4515-d2cc-401a");
  assert.strictEqual(
    parseConversationId("https://claude.ai/chat/9f8e7d6c-1234", "claude"),
    "9f8e7d6c-1234"
  );
  assert.strictEqual(parseConversationId("/new", "claude"), null);
});

test("parseConversationId handles Grok hrefs", () => {
  assert.strictEqual(
    parseConversationId("/c/8c648162-8027-44be-ae3d-5816feba85d4", "grok"),
    "8c648162-8027-44be-ae3d-5816feba85d4"
  );
  assert.strictEqual(
    parseConversationId(
      "https://grok.com/c/586b176c-0a85-4815-902a-d2c30f21c89f?rid=test",
      "grok"
    ),
    "586b176c-0a85-4815-902a-d2c30f21c89f"
  );
  assert.strictEqual(parseConversationId("/", "grok"), null);
});

test("parseConversationId returns null for unknown platform or empty href", () => {
  assert.strictEqual(parseConversationId("/c/abc", "unknown"), null);
  assert.strictEqual(parseConversationId("", "chatgpt"), null);
  assert.strictEqual(parseConversationId(null, "gemini"), null);
});

test("dedupeConversations removes duplicates and keeps order (chatgpt)", () => {
  const out = dedupeConversations(
    [
      { href: "/c/a", title: "First" },
      { href: "/c/b", title: "Second" },
      { href: "/c/a", title: "Dup" },
      { href: "/gpts", title: "Invalid" },
    ],
    "chatgpt"
  );
  assert.deepStrictEqual(out.map((c) => c.id), ["a", "b"]);
  assert.strictEqual(out[0].title, "First");
});

test("dedupeConversations works for Gemini and falls back to id when title missing", () => {
  const out = dedupeConversations([{ href: "/app/xyz" }], "gemini");
  assert.strictEqual(out[0].id, "xyz");
  assert.strictEqual(out[0].title, "xyz");
});

test("Grok config scopes sidebar links and skips a nonexistent confirm dialog", () => {
  const grok = PLATFORMS.grok;
  assert.strictEqual(grok.requiresDeleteConfirmation, false);
  assert.strictEqual(grok.optionsTriggerActivation, "pointerdown");
  assert.match(grok.selectors.conversationLink, /data-sidebar="menu-item"/);
  assert.strictEqual(grok.selectors.confirmDialog, null);
});

test("manifest grants and injects Grok access", () => {
  assert.ok(manifest.host_permissions.includes("https://grok.com/*"));
  assert.ok(manifest.content_scripts[0].matches.includes("https://grok.com/*"));
});

test("every locale warns before a batch deletion", () => {
  for (const locale of ["en", "ja", "zh_CN", "zh_TW"]) {
    const file = path.join(__dirname, "..", "_locales", locale, "messages.json");
    const messages = JSON.parse(fs.readFileSync(file, "utf8"));
    const warning = messages.confirmBatchDelete;
    assert.ok(warning, `${locale} is missing confirmBatchDelete`);
    assert.match(warning.message, /\$platform\$/);
    assert.match(warning.message, /\$count\$/);
    assert.strictEqual(warning.placeholders.platform.content, "$1");
    assert.strictEqual(warning.placeholders.count.content, "$2");
  }
});

test("Gemini confirm selector follows the current Angular Material dialog markup", () => {
  const selector = PLATFORMS.gemini.selectors.confirmDeleteButton;
  assert.match(selector, /cdkfocusinitial/);
  assert.doesNotMatch(selector, /data-test-id="confirm-button"/);
});
