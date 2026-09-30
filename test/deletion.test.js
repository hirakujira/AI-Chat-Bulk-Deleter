const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const CGBD = require('../src/selectors.js');

function harness({ closeDialog, removeRow }) {
  let time = 0;
  let clicked = false;
  const events = [];
  const node = () => ({
    isConnected: true, hidden: false, disabled: false,
    getAttribute: () => null, hasAttribute: () => false,
    getClientRects: () => [{}], focus() {},
    dispatchEvent(event) { events.push(event.type); },
  });
  const button = { ...node(), click() {
    clicked = true;
    if (closeDialog) dialog.isConnected = false;
  } };
  const dialog = { ...node(), querySelector: () => button };
  const row = { getAttribute: () => '/c/one' };
  const document = {
    querySelectorAll(selector) {
      if (selector === CGBD.PLATFORMS.chatgpt.selectors.confirmDialog) {
        return dialog.isConnected ? [dialog] : [];
      }
      if (selector === CGBD.PLATFORMS.chatgpt.selectors.conversationLink) {
        return clicked && removeRow ? [] : [row];
      }
      return [];
    },
  };
  class Event { constructor(type) { this.type = type; } }
  const context = {
    window: { CGBD }, location: { hostname: 'chatgpt.com' }, document,
    chrome: { i18n: { getMessage: key => key }, runtime: { onMessage: { addListener() {} } } },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    PointerEvent: Event, MouseEvent: Event,
    Date: { now: () => time },
    setTimeout(callback, delay) { time += delay; callback(); },
  };
  const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'window.flow = { confirmDeletion, runDeletion, state }; })();'), context);
  return { ...context.window.flow, events };
}

test('does not report deletion while the confirmation dialog remains open', async () => {
  const flow = harness({ closeDialog: false, removeRow: true });
  const result = await flow.confirmDeletion('one');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'confirm dialog remained open');
});

test('requires both dialog closure and conversation removal', async () => {
  const flow = harness({ closeDialog: true, removeRow: false });
  assert.equal((await flow.confirmDeletion('one')).ok, false);
  const success = harness({ closeDialog: true, removeRow: true });
  assert.equal((await success.confirmDeletion('one')).ok, true);
  assert.deepEqual(success.events, ['pointerdown', 'mousedown', 'pointerup', 'mouseup']);
});

test('stops the ChatGPT batch when an overlay blocks the first item', async () => {
  const flow = harness({ closeDialog: false, removeRow: false });
  flow.state.queue = [{ id: 'one' }, { id: 'two' }];
  const result = await flow.runDeletion(() => {});
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].reason, 'previous overlay still open');
  assert.equal(flow.state.running, false);
});
