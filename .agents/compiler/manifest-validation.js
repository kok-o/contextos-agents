'use strict';

const manifestSchema = require('../schemas/skill.manifest.v2.json');

// Authoring manifests support v1 shorthand even when marked schemaVersion: 2.
// Defaults (id/name, entrypoint, etc.) are filled only AFTER validating supplied
// values. Keep the complete nested v2 contract, including closed objects.
const authoringSchema = {
  ...manifestSchema,
  required: [],
  properties: {
    ...manifestSchema.properties,
    schemaVersion: { type: 'integer', enum: [1, 2] },
    // Shipped v1-style catalog manifests use these two category names.
    category: { ...manifestSchema.properties.category, enum: [...manifestSchema.properties.category.enum, 'engineering', 'design'] },
    name: { type: 'string', minLength: 1 },
    requires: manifestSchema.properties.dependencies.properties.requires,
    optional: manifestSchema.properties.dependencies.properties.optional,
    conflicts: manifestSchema.properties.dependencies.properties.conflicts,
    weight: { type: 'number', minimum: 0, maximum: 10 },
    resources: {
      ...manifestSchema.properties.resources,
      items: { oneOf: [{ type: 'string' }, manifestSchema.properties.resources.items] },
    },
  },
};

// Dependency-free evaluator for every assertion used by the manifest schema.
// Returns the first error; never coerces, defaults, or strips author input.
function validateValue(value, schema, pointer = '') {
  const fail = message => ({ path: pointer, message: `${pointer || '/'}: ${message}` });
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(branch => !validateValue(value, branch, pointer));
    if (matches.length !== 1) return fail('must match exactly one allowed schema');
  }
  const object = value !== null && typeof value === 'object' && !Array.isArray(value);
  const types = {
    object, array: Array.isArray(value), string: typeof value === 'string',
    boolean: typeof value === 'boolean', integer: Number.isInteger(value),
    number: typeof value === 'number' && Number.isFinite(value),
  };
  if (schema.type && !types[schema.type]) return fail(`must be ${schema.type}`);
  if (Object.hasOwn(schema, 'const') && value !== schema.const) return fail(`must equal ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) return fail(`must be one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) return fail(`must have length >= ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return fail(`must match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) return fail(`must be <= ${schema.maximum}`);
  }
  const child = key => `${pointer}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
  if (object) {
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) return { path: child(key), message: `${child(key)}: required property is missing` };
    }
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(schema.properties || {}, key)) {
        const error = validateValue(value[key], schema.properties[key], child(key));
        if (error) return error;
      } else if (schema.additionalProperties === false) {
        return { path: child(key), message: `${child(key)}: unknown property is not allowed` };
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const error = validateValue(value[i], schema.items, child(i));
      if (error) return error;
    }
  }
  return null;
}

module.exports = { validateRawManifest: value => validateValue(value, authoringSchema) };