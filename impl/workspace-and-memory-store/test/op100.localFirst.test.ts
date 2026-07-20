// Op 100 — local-first inspection.
// The static form of "zero store-originated network egress": no source imports a
// network module, and no source performs a network fetch. Every import is a
// relative path or a node builtin, and the only builtin used is node:crypto.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

test('no source imports a network module or performs a fetch', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = join(here, '..', 'src');
  const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
  const importFrom = /(?:import|export)\b[^'"]*\bfrom\s*['"]([^'"]+)['"]/g;
  const netBuiltin = /^(node:)?(http|https|http2|net|dgram|tls|dns)$/i;
  let checked = 0;
  for (const f of files) {
    const text = readFileSync(join(src, f), 'utf8');
    assert.equal(/\bfetch\s*\(/.test(text), false, f + ' performs a fetch');
    let m: RegExpExecArray | null;
    while ((m = importFrom.exec(text)) !== null) {
      const spec = m[1] as string;
      checked++;
      assert.equal(netBuiltin.test(spec), false, f + ' imports network module ' + spec);
      assert.equal(spec.startsWith('.') || spec.startsWith('node:'), true, f + ' imports non-local ' + spec);
    }
  }
  assert.ok(checked > 0);
});
