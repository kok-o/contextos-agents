/**
 * .agents/cli-errors.js
 * One place that turns an uncaught CLI error into a readable message.
 *
 * A mistake in a rule file, a refused overwrite or a merge conflict is an
 * expected outcome, not a crash: the user gets the reason and a non-zero exit
 * code instead of a stack trace and a source excerpt. CONTEXTOS_DEBUG=1 keeps
 * the stack for bug reports.
 */

'use strict';

function describeError(error) {
  const message = String((error && error.message) || error).split(/\r?\n/)[0];
  const code = error && error.code ? ` (${error.code})` : '';
  return `[ERROR] ${message}${code}`;
}

function installCliErrorHandler() {
  const handler = error => {
    console.error(describeError(error));
    if (process.env.CONTEXTOS_DEBUG && error && error.stack) console.error(error.stack);
    process.exit(error && error.exitCode ? error.exitCode : 1);
  };
  process.on('uncaughtException', handler);
  process.on('unhandledRejection', handler);
}

module.exports = { installCliErrorHandler, describeError };
