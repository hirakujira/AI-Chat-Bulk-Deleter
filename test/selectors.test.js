const test = require("node:test");
const assert = require("node:assert");
const { detectPlatform, parseConversationId, dedupeConversations } = require("../src/selectors.js");

test("detectPlatform maps known hosts", () => {
  assert.strictEqual(detectPlatform("chatgpt.com"), "chatgpt");
  assert.strictEqual(detectPlatform("chat.openai.com"), "chatgpt");
  assert.strictEqual(detectPlatform("gemini.google.com"), "gemini");
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
