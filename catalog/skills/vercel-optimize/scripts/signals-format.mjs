// Labels distinguish supplied input from demos; they do not authenticate origin.
import { readFileSync } from 'node:fs';
const metricNames = ['totalInvocations', 'averageDurationMs', 'p95DurationMs', 'fastDataTransferBytes', 'buildMinutes', 'coldStartRate'];
const routeMetrics = ['invocations', 'p95DurationMs', 'avgDurationMs', 'coldStartRate', 'errorRate'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function observation(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (/Rate$/.test(name) && value > 1)) throw new Error('Invalid nonnegative observation: ' + name);
  return value;
}
export function relativeFile(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || /^[\\/]|^[a-z]:/i.test(value) || value.replaceAll('\\', '/').split('/').includes('..')) throw new Error('Source file must be a contained relative path');
  return value.replaceAll('\\', '/');
}
export function normalizeSignals(value) {
  if (!object(value) || typeof value.projectId !== 'string' || !value.projectId.trim()) throw new Error('Signals require a projectId');
  if (!object(value.metrics ?? {})) throw new Error('metrics must be an object');
  if (!Array.isArray(value.routes)) throw new Error('routes must be an array');
  if (value.windowDays !== undefined && (!Number.isInteger(value.windowDays) || value.windowDays <= 0)) throw new Error('windowDays must be a positive integer');
  const synthetic = value.synthetic === true || value.telemetrySource === 'synthetic-demo';
  const metrics = {};
  for (const name of metricNames) if (value.metrics?.[name] !== undefined) metrics[name] = observation(value.metrics[name], name);
  const routes = value.routes.map(route => {
    if (!object(route) || typeof route.route !== 'string' || !route.route.startsWith('/')) throw new Error('Invalid route observation');
    const result = { route: route.route, method: route.method || 'GET', hasTelemetry: route.hasTelemetry !== false };
    if (typeof result.method !== 'string' || !/^[A-Z]+$/.test(result.method)) throw new Error('Invalid HTTP method');
    for (const name of routeMetrics) {
      if (route[name] == null) { if (!result.hasTelemetry) result[name] = null; }
      else result[name] = observation(route[name], name);
    }
    for (const name of ['cacheable', 'authSensitive', 'personalized']) {
      if (route[name] !== undefined && typeof route[name] !== 'boolean') throw new Error('Invalid route ' + name);
      if (route[name] !== undefined) result[name] = route[name];
    }
    if (route.currentCacheControl !== undefined && typeof route.currentCacheControl !== 'string') throw new Error('Invalid cache-control observation');
    if (route.currentCacheControl !== undefined) result.currentCacheControl = route.currentCacheControl;
    if (route.file != null) result.file = relativeFile(route.file);
    return result;
  });
  return { projectId: value.projectId, ...(value.windowDays !== undefined ? { windowDays: value.windowDays } : {}), synthetic,
    telemetrySource: synthetic ? 'synthetic-demo' : 'provided-json', provenanceVerified: false, metrics, routes };
}
export function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new Error('Cannot read a valid JSON input file'); }
}
