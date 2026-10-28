'use strict';

// Dependency-free evaluator for the JSON Schema vocabulary used by the registry.
// Unsupported validation keywords fail closed, so extending the schema cannot
// silently reduce validation. This is not a general-purpose draft-07 engine.
const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');

const annotations = new Set(['$schema', '$id', 'title', 'description', '$comment', 'default', 'examples']);
const supported = new Set(['$ref', 'definitions', 'type', 'required', 'properties', 'items', 'pattern', 'enum', 'additionalProperties']);
const types = {
  object: value => value !== null && typeof value === 'object' && !Array.isArray(value),
  array: Array.isArray,
  string: value => typeof value === 'string',
  boolean: value => typeof value === 'boolean',
  null: value => value === null,
  number: value => typeof value === 'number' && Number.isFinite(value),
  integer: Number.isInteger,
};

function pointerPart(value) {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function reference(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) throw new Error('Only local JSON Schema references are supported');
  let current = root;
  for (const part of ref.slice(2).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (!current || !Object.hasOwn(current, part)) throw new Error(`Unresolved schema reference: ${ref}`);
    current = current[part];
  }
  return current;
}

function checkSchema(schema, root, ancestors = new Set()) {
  if (typeof schema === 'boolean') return;
  if (!types.object(schema)) throw new Error('Schema nodes must be objects or booleans');
  if (ancestors.has(schema)) throw new Error('Recursive schema references are not supported');
  const next = new Set(ancestors).add(schema);
  for (const key of Object.keys(schema)) {
    if (!annotations.has(key) && !supported.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
  }
  if (schema.$ref !== undefined) checkSchema(reference(root, schema.$ref), root, next);
  if (schema.type !== undefined) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!names.length || names.some(name => typeof name !== 'string' || !Object.hasOwn(types, name))) throw new Error('Invalid schema type');
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string'))) throw new Error('Invalid schema required list');
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length)) throw new Error('Invalid schema enum');
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string') throw new Error('Invalid schema pattern');
    new RegExp(schema.pattern);
  }
  for (const key of ['properties', 'definitions']) {
    if (schema[key] !== undefined) {
      if (!types.object(schema[key])) throw new Error(`Invalid schema ${key}`);
      for (const child of Object.values(schema[key])) checkSchema(child, root, next);
    }
  }
  for (const key of ['items', 'additionalProperties']) {
    if (schema[key] !== undefined) checkSchema(schema[key], root, next);
  }
}

function validate(value, schema, root, location = '#', errors = []) {
  if (schema === true) return errors;
  if (schema === false) { errors.push(`${location}: disallowed by schema`); return errors; }
  // Draft-07 references replace their schema node (siblings are not evaluated).
  if (schema.$ref !== undefined) return validate(value, reference(root, schema.$ref), root, location, errors);
  if (schema.type !== undefined) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!names.some(name => types[name](value))) {
      errors.push(`${location}: expected type ${names.join(' or ')}`);
      return errors;
    }
  }
  if (schema.enum && !schema.enum.some(option => isDeepStrictEqual(option, value))) errors.push(`${location}: value is not in enum`);
  if (typeof value === 'string' && schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) errors.push(`${location}: does not match pattern ${schema.pattern}`);
  if (types.object(value)) {
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) errors.push(`${location}: missing required property ${key}`);
    }
    for (const [key, child] of Object.entries(value)) {
      const childLocation = `${location}/${pointerPart(key)}`;
      if (schema.properties && Object.hasOwn(schema.properties, key)) validate(child, schema.properties[key], root, childLocation, errors);
      else if (schema.additionalProperties !== undefined) validate(child, schema.additionalProperties, root, childLocation, errors);
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((child, index) => validate(child, schema.items, root, `${location}/${index}`, errors));
  }
  return errors;
}

function main() {
  const registry = JSON.parse(fs.readFileSync('registry.json', 'utf8'));
  const schema = JSON.parse(fs.readFileSync('registry.schema.json', 'utf8'));
  checkSchema(schema, schema);
  const errors = validate(registry, schema, schema);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`registry.json is valid — ${registry.skills.length} skill(s) registered.`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    const message = String(error.message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.error(`::error file=registry.json::${message}`);
    process.exitCode = 1;
  }
}

module.exports = { checkSchema, validate };
