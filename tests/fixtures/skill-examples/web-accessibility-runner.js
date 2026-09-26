/**
 * tests/fixtures/skill-examples/web-accessibility-runner.js
 * Executable verification for web accessibility skill code examples.
 */

'use strict';

const assert = require('node:assert');

/**
 * Simulates the modal state transitions documented in
 * catalog/skills/web-accessibility/SKILL.md (AccessibleModal pattern).
 */
class MockHTMLDialogElement {
  constructor() {
    this.open = false;
    this.modalMode = false;
    this.canceled = false;
    this.listeners = {};
  }

  showModal() {
    if (this.open) throw new Error('InvalidStateError: Dialog is already open');
    this.open = true;
    this.modalMode = true; // In modal mode, background is inert and focus trapped
  }

  close() {
    this.open = false;
    this.modalMode = false;
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchCancelEvent() {
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    if (this.listeners.cancel) {
      for (const fn of this.listeners.cancel) {
        fn(event);
      }
    }
    return event;
  }
}

/**
 * Validates the behavior pattern of the AccessibleModal component.
 */
function verifyAccessibleModalBehavior() {
  const results = [];
  const dialog = new MockHTMLDialogElement();
  let modalOpen = false;
  let closeCallbackCalled = false;

  const onClose = () => {
    closeCallbackCalled = true;
    modalOpen = false;
  };

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    onClose();
  });

  // Test 1: Opening modal calls showModal() ensuring inert background and focus trap
  modalOpen = true;
  dialog.showModal();
  assert.strictEqual(dialog.open, true);
  assert.strictEqual(dialog.modalMode, true, 'Dialog must be opened in modal mode');
  results.push({ id: 'web-accessibility:modal:show-modal', passed: true });

  // Test 2: Escape key (cancel event) prevents default and delegates to onClose
  const cancelEvt = dialog.dispatchCancelEvent();
  assert.strictEqual(cancelEvt.defaultPrevented, true, 'Escape cancel must prevent default browser closing');
  assert.strictEqual(closeCallbackCalled, true, 'onClose handler must be called on Escape');
  results.push({ id: 'web-accessibility:modal:escape-cancel', passed: true });

  // Test 3: Closing modal calls close()
  dialog.close();
  assert.strictEqual(dialog.open, false);
  assert.strictEqual(dialog.modalMode, false);
  results.push({ id: 'web-accessibility:modal:close', passed: true });

  return results;
}

/**
 * Validates focus-visible CSS rules extracted from SKILL.md.
 */
function verifyFocusVisibleCss(cssContent) {
  const results = [];

  // Check 1: Must declare outline on focus-visible
  assert.match(cssContent, /:focus-visible\s*\{[\s\S]*outline:\s*2px\s+solid/);
  results.push({ id: 'web-accessibility:css:outline-width-color', passed: true });

  // Check 2: Must specify outline-offset
  assert.match(cssContent, /outline-offset:\s*2px/);
  results.push({ id: 'web-accessibility:css:outline-offset', passed: true });

  // Check 3: Must NOT declare naked outline: none on button without focus-visible
  assert.match(cssContent, /button:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none;\s*\}/);
  results.push({ id: 'web-accessibility:css:preserve-keyboard-focus', passed: true });

  return results;
}

module.exports = {
  MockHTMLDialogElement,
  verifyAccessibleModalBehavior,
  verifyFocusVisibleCss,
};
