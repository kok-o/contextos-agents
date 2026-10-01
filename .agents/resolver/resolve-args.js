'use strict';

function parseResolveArgs(args) {
  const result = { task: '', files: [], explicitPhase: undefined, contextBudgetTokens: undefined, json: false, explain: false };
  const task = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') result.json = true;
    else if (arg === '--explain') result.explain = true;
    else if (['--files', '--phase', '--budget'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--files') result.files = value.split(',').map(file => file.trim()).filter(Boolean);
      else if (arg === '--phase') result.explicitPhase = value;
      else {
        if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
          throw new Error('--budget must be a positive integer');
        }
        result.contextBudgetTokens = Number(value);
      }
    } else if (arg === '--') {
      task.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith('-')) throw new Error(`Unknown resolve option: ${arg}`);
    else task.push(arg);
  }
  result.task = task.join(' ');
  return result;
}

module.exports = { parseResolveArgs };
