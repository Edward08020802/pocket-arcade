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

/**
 * An Ionicons name that does not exist renders as a "?" glyph -- no warning,
 * no crash, just a wrong-looking button.
 *
 * Done over the AST rather than by matching text: the first attempt scanned
 * lines with a name-shaped regex and a prefix whitelist, and quietly skipped
 * the one real bad name it was written to catch. Here every string literal
 * inside an `icon=` / `name=` attribute or an `icon:` property is checked,
 * including the branches of a ternary.
 */
function checkIconNames(ast, rel) {
  let glyphs;
  try {
    glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
  } catch {
    return 0;   // not installed: skip rather than fail the build
  }

  let found = 0;
  const report = (node) => {
    if (node.value in glyphs) return;
    console.error(
      `${rel}:${node.loc.start.line}  '${node.value}' is not an Ionicons glyph ` +
      '(it renders as "?")'
    );
    found++;
  };

  // Only positions whose value actually becomes the icon name. Traversing the
  // whole expression also picked up the *test* of a ternary -- the 'dark' in
  // `theme === 'dark' ? 'moon' : 'sunny'` -- and reported it as a bad glyph.
  const collect = (node) => {
    if (!node) return;
    if (node.type === 'StringLiteral') { report(node); return; }
    if (node.type === 'ConditionalExpression') {
      collect(node.consequent);
      collect(node.alternate);
      return;
    }
    if (node.type === 'LogicalExpression') {
      collect(node.left);
      collect(node.right);
      return;
    }
    // Anything else (a variable, a lookup) cannot be checked without running it.
  };

  traverse(ast, {
    JSXAttribute(p) {
      const n = p.node.name && p.node.name.name;
      if (n !== 'icon' && n !== 'name') return;
      const v = p.node.value;
      if (!v) return;
      collect(v.type === 'JSXExpressionContainer' ? v.expression : v);
    },
    ObjectProperty(p) {
      const key = p.node.key && (p.node.key.name || p.node.key.value);
      if (key !== 'icon') return;
      collect(p.node.value);
    },
  });
  return found;
}

/**
 * A local binding that reuses an imported name silently replaces it for the
 * whole of that scope. Simon declared a local `play` and every call meant to
 * reach the sound helper hit the local one instead, crashing inside a timer
 * where no try/catch could see it.
 */
function checkShadowedImports(ast, rel, code) {
  const imported = new Set();
  traverse(ast, {
    ImportSpecifier(p) { imported.add(p.node.local.name); },
    ImportDefaultSpecifier(p) { imported.add(p.node.local.name); },
    ImportNamespaceSpecifier(p) { imported.add(p.node.local.name); },
  });
  const seen = new Set();
  let found = 0;
  traverse(ast, {
    Scopable(p) {
      if (p.scope.path.isProgram()) return;
      for (const name of Object.keys(p.scope.bindings)) {
        if (!imported.has(name)) continue;
        const line = p.scope.bindings[name].identifier.loc.start.line;
        const key = `${rel}:${line}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        console.error(
          `${rel}:${line}  local '${name}' shadows the import of the same name  ` +
          `-> ${code.split('\n')[line - 1].trim().slice(0, 80)}`
        );
        found++;
      }
    },
  });
  return found;
}

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
  failures += checkShadowedImports(ast, path.relative(ROOT, file), code);
  failures += checkIconNames(ast, path.relative(ROOT, file));

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
  console.error(`\n${failures} problem${failures === 1 ? '' : 's'} found.`);
  process.exit(1);
}
console.log('checks passed: scope, shadowed imports, icon names');
