const test = require("node:test");
const assert = require("node:assert");
const {
  PLATFORMS,
  detectPlatform,
  parseConversationId,
  dedupeConversations,
  randomInt,
  shuffleConversations,
  reconcileDeletionResults,
} = require("../src/selectors.js");

test("detectPlatform maps known hosts", () => {
  assert.strictEqual(detectPlatform("chatgpt.com"), "chatgpt");
  assert.strictEqual(detectPlatform("chat.openai.com"), "chatgpt");
  assert.strictEqual(detectPlatform("gemini.google.com"), "gemini");
  assert.strictEqual(detectPlatform("claude.ai"), "claude");
  assert.strictEqual(detectPlatform("example.com"), null);
  assert.strictEqual(detectPlatform(null), null);
});

test("ChatGPT targets the dedicated delete menu item", () => {
  assert.strictEqual(
    PLATFORMS.chatgpt.selectors.deleteMenuItem,
    '[data-testid="delete-chat-menu-item"]'
  );
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

test("randomInt returns inclusive bounds with an injected random source", () => {
  assert.strictEqual(randomInt(3, 7, () => 0), 3);
  assert.strictEqual(randomInt(3, 7, () => 0.999999), 7);
});

test("shuffleConversations shuffles a copy without losing conversations", () => {
  const conversations = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const randomValues = [0, 0];
  const shuffled = shuffleConversations(conversations, () => randomValues.shift());

  assert.deepStrictEqual(conversations.map((conversation) => conversation.id), ["a", "b", "c"]);
  assert.deepStrictEqual(shuffled.map((conversation) => conversation.id), ["b", "c", "a"]);
  assert.deepStrictEqual(
    shuffled.map((conversation) => conversation.id).sort(),
    ["a", "b", "c"]
  );
  assert.notStrictEqual(shuffled, conversations);
});

test("reconcileDeletionResults removes only successfully deleted items", () => {
  const reconciled = reconcileDeletionResults(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    ["a", "b", "c"],
    [
      { id: "a", status: "deleted" },
      { id: "b", status: "failed" },
      { id: "c", status: "skipped" },
    ]
  );

  assert.deepStrictEqual(reconciled.conversations, [{ id: "b" }, { id: "c" }]);
  assert.deepStrictEqual(reconciled.selectedIds, ["b", "c"]);
});

test("reconcileDeletionResults preserves unselected conversations", () => {
  const reconciled = reconcileDeletionResults(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    ["a"],
    [{ id: "a", status: "deleted" }]
  );

  assert.deepStrictEqual(reconciled.conversations, [{ id: "b" }, { id: "c" }]);
  assert.deepStrictEqual(reconciled.selectedIds, []);
});

test("Gemini confirm selector follows the current Angular Material dialog markup", () => {
  const selector = PLATFORMS.gemini.selectors.confirmDeleteButton;
  assert.match(selector, /cdkfocusinitial/);
  assert.doesNotMatch(selector, /data-test-id="confirm-button"/);
});
