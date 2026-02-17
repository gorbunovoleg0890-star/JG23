import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default;
const filePath = path.resolve('src/App.jsx');
const source = fs.readFileSync(filePath, 'utf8');

const ast = parse(source, {
  sourceType: 'module',
  plugins: ['jsx']
});

const allowedGlobals = new Set([
  'Array',
  'Boolean',
  'Date',
  'Infinity',
  'JSON',
  'Map',
  'Math',
  'Number',
  'Object',
  'Set',
  'String',
  'URLSearchParams',
  'console',
  'crypto',
  'decodeURIComponent',
  'document',
  'encodeURIComponent',
  'history',
  'isNaN',
  'localStorage',
  'location',
  'parseFloat',
  'parseInt',
  'sessionStorage',
  'undefined',
  'window'
]);

const misses = [];

traverse(ast, {
  Identifier(pathRef) {
    if (!pathRef.isReferencedIdentifier()) return;

    const { name } = pathRef.node;
    if (pathRef.scope.hasBinding(name)) return;
    if (allowedGlobals.has(name)) return;

    const parent = pathRef.parent;
    if (
      parent &&
      (
        (parent.type === 'ObjectProperty' && parent.key === pathRef.node && !parent.computed) ||
        (parent.type === 'MemberExpression' && parent.property === pathRef.node && !parent.computed)
      )
    ) {
      return;
    }

    const line = pathRef.node.loc?.start.line ?? 0;
    const column = pathRef.node.loc?.start.column ?? 0;
    misses.push({ name, line, column });
  }
});

if (misses.length === 0) {
  console.log('No unresolved identifiers found in src/App.jsx');
  process.exit(0);
}

misses.sort((a, b) => {
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return a.line - b.line || a.column - b.column;
});

console.error('Unresolved identifiers detected:');
for (const miss of misses) {
  console.error(`- ${miss.name} at ${filePath}:${miss.line}:${miss.column}`);
}
process.exit(1);
