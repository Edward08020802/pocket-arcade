#!/usr/bin/env node
/**
 * Fail the build on any identifier that nothing in scope binds.
 *
 * This exists because a stale backup file reintroduced module-level references
 * to a variable that had become a function parameter. Metro bundles that
 * happily -- the error only appears when the module is evaluated on device, as
 * a launch-to-black-screen with nothing logged. A parser catches it in a second.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.resolve(__dirname, '..');

// Runtime globals that are legitimately unbound in module scope.
const GLOBALS = new Set([
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'require', 'module',
  'exports', 'global', 'globalThis', 'process', '__DEV__', '__dirname', '__filename',
  'Math', 'JSON', 'Date', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Promise', 'Error', 'TypeError', 'RangeError', 'Set', 'Map', 'WeakMap',
  'WeakSet', 'Symbol', 'RegExp', 'Function', 'Proxy', 'Reflect', 'BigInt',
  'Infinity', 'NaN', 'undefined', 'isNaN', 'isFinite', 'parseInt', 'parseFloat',
  'encodeURIComponent', 'decodeURIComponent', 'structuredClone',
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'fetch', 'URL', 'URLSearchParams', 'Intl', 'performance', 'queueMicrotask',
  'ArrayBuffer', 'Uint8Array', 'Int8Array', 'Float32Array', 'DataView',
]);

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' ||
        entry.name === 'ios' || entry.name === 'android' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

let failures = 0;
for (const file of jsFiles(ROOT)) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    });
  } catch (e) {
    console.error(`${path.relative(ROOT, file)}: parse error: ${e.message}`);
    failures++;
    continue;
  }
  traverse(ast, {
    ReferencedIdentifier(p) {
      const name = p.node.name;
      if (GLOBALS.has(name) || p.scope.hasBinding(name)) return;
      const line = p.node.loc.start.line;
      console.error(
        `${path.relative(ROOT, file)}:${line}  '${name}' is not defined  ` +
        `-> ${code.split('\n')[line - 1].trim().slice(0, 80)}`
      );
      failures++;
    },
  });
}

if (failures) {
  console.error(`\n${failures} unbound reference${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('scope check passed: no unbound references');
