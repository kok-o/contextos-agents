/**
 * bin/lib/ui.js
 * Terminal visual formatting & progress helpers for ContextOS.
 * Zero external dependencies - uses standard Node.js ANSI and process streams.
 */

'use strict';

const isTTY = Boolean(process.stdout && process.stdout.isTTY && !process.env.CI && process.env.NODE_ENV !== 'test');
const noColor = Boolean(process.env.NO_COLOR || (!isTTY && !process.env.FORCE_COLOR));

const c = {
  cyan:    (s) => noColor ? s : `\x1b[36m${s}\x1b[0m`,
  green:   (s) => noColor ? s : `\x1b[32m${s}\x1b[0m`,
  yellow:  (s) => noColor ? s : `\x1b[33m${s}\x1b[0m`,
  red:     (s) => noColor ? s : `\x1b[31m${s}\x1b[0m`,
  blue:    (s) => noColor ? s : `\x1b[34m${s}\x1b[0m`,
  magenta: (s) => noColor ? s : `\x1b[35m${s}\x1b[0m`,
  dim:     (s) => noColor ? s : `\x1b[2m${s}\x1b[0m`,
  bold:    (s) => noColor ? s : `\x1b[1m${s}\x1b[0m`,
  gray:    (s) => noColor ? s : `\x1b[90m${s}\x1b[0m`,
};

/**
 * Render a sleek ASCII brand banner with version.
 */
function renderBanner(version) {
  const title = `ContextOS  v${version}`;
  const subtitle = 'Deterministic Context & Policy Engine for Coding Agents';
  const width = Math.max(title.length, subtitle.length) + 6;
  const topBorder    = ` ╭${'─'.repeat(width)}╮`;
  const bottomBorder = ` ╰${'─'.repeat(width)}╯`;

  console.log('\n' + c.cyan(topBorder));
  console.log(` ${c.cyan('│')}   ${c.bold(c.cyan('ContextOS'))}  ${c.dim('v' + version)}${' '.repeat(width - title.length - 3)}${c.cyan('│')}`);
  console.log(` ${c.cyan('│')}   ${c.gray(subtitle)}${' '.repeat(width - subtitle.length - 3)}${c.cyan('│')}`);
  console.log(c.cyan(bottomBorder) + '\n');
}

/**
 * Format a step badge: e.g. [1/4]
 */
function formatStepBadge(step, total) {
  return c.cyan(`[${step}/${total}]`);
}

/**
 * Render an installation step with title and detailed item.
 */
function renderStep(step, total, title, detail = null, isSuccess = true) {
  const badge = formatStepBadge(step, total);
  console.log(`  ${badge}  ${c.bold(title)}`);
  if (detail) {
    const symbol = isSuccess ? c.green('✓') : c.yellow('•');
    if (Array.isArray(detail)) {
      if (detail.length > 0) {
        console.log(`         ${symbol} ${detail[0]}`);
        for (let i = 1; i < detail.length; i++) {
          console.log(`           ${c.dim(detail[i])}`);
        }
      }
    } else {
      console.log(`         ${symbol} ${detail}`);
    }
  }
}

/**
 * Render an interactive or batch progress bar for skills/files.
 */
function renderProgressBar(current, total, label = '', width = 26) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 100;
  const filledCount = total > 0 ? Math.min(width, Math.round((current / total) * width)) : width;
  const emptyCount = Math.max(0, width - filledCount);

  const filledBar = '█'.repeat(filledCount);
  const emptyBar  = '░'.repeat(emptyCount);
  const barStr = `${c.cyan(filledBar)}${c.dim(emptyBar)}`;
  const progressText = `[${barStr}] ${String(percent).padStart(3)}% (${current}/${total})${label ? ' ' + c.gray(label) : ''}`;

  if (isTTY) {
    process.stdout.write(`\r  ${progressText}   `);
    if (current >= total) {
      process.stdout.write('\n');
    }
  } else {
    // In CI or non-TTY test runners, log only at completion to avoid log bloat
    if (current === total) {
      console.log(`  ${progressText}`);
    }
  }
}

/**
 * Render the final readiness card with next steps and commands.
 */
function stripAnsi(str) {
  return String(str).replace(/\x1b\[[0-9;]*m/g, '');
}

function renderCardLine(content, innerWidth = 62) {
  const visible = stripAnsi(content);
  const padding = Math.max(0, innerWidth - visible.length);
  return ` ${c.green('│')}  ${content}${' '.repeat(padding)}${c.green('│')}`;
}

/**
 * Render the final readiness card with next steps and commands.
 */
function renderSuccessCard(options = {}) {
  const innerWidth = 62;
  const topBorder    = ` ╭${'─'.repeat(innerWidth + 2)}╮`;
  const bottomBorder = ` ╰${'─'.repeat(innerWidth + 2)}╯`;

  console.log('\n' + c.green(topBorder));
  console.log(renderCardLine(c.bold(c.green('✓ Project ready for AI coding agents!')), innerWidth));
  console.log(renderCardLine('', innerWidth));
  console.log(renderCardLine(c.bold('Next steps:'), innerWidth));
  console.log(renderCardLine('1. Default init exports Gemini workspace skills.', innerWidth));
  console.log(renderCardLine(`   Other clients: ${c.cyan('contextos export <agent>')}`, innerWidth));
  console.log(renderCardLine('', innerWidth));
  console.log(renderCardLine('2. Explore and install domain skills:', innerWidth));
  console.log(renderCardLine(`   ${c.cyan('contextos skill list --available')}`, innerWidth));
  console.log(renderCardLine(`   ${c.cyan('contextos skill add <name>')}    (or ${c.cyan('--all')})`, innerWidth));
  console.log(renderCardLine('', innerWidth));
  console.log(renderCardLine('3. Inspect project health anytime:', innerWidth));
  console.log(renderCardLine(`   ${c.cyan('contextos doctor')}`, innerWidth));
  console.log(c.green(bottomBorder) + '\n');
}

module.exports = {
  isTTY,
  noColor,
  c,
  renderBanner,
  formatStepBadge,
  renderStep,
  renderProgressBar,
  renderSuccessCard,
};
