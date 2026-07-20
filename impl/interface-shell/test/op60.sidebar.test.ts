// Op 60 — P6 ambient-sidebar. Attach and detach mutate no page or engine state and
// import no engine code; mode transitions follow the fixed set; an ApprovalRequest
// surfaces the sheet inline still bound to request_id.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AmbientSidebar } from '../src/sidebar.ts';
import { approvalRequest, StubExecutor, WS } from './helpers.ts';

test('attach records the page handle and mutates no shell run state', () => {
  const sb = new AmbientSidebar(new StubExecutor(), WS);
  sb.attach('page-handle-1');
  assert.equal(sb.page_handle, 'page-handle-1');
  assert.equal(sb.state, 'hidden'); // attaching does not change the mode
  sb.detach();
  assert.equal(sb.page_handle, null);
});

test('mode transitions follow the fixed set', () => {
  const sb = new AmbientSidebar(new StubExecutor(), WS);
  assert.equal(sb.openCard(), false); // invalid from hidden
  assert.equal(sb.open(), true); // hidden -> ambient
  assert.equal(sb.openCard(), true); // ambient -> focused
  assert.equal(sb.navigate(), true); // focused -> focused (no change)
  assert.equal(sb.state, 'focused');
  assert.equal(sb.closeCard(), true); // focused -> ambient
  assert.equal(sb.closeSidebar(), true); // ambient -> hidden
  assert.equal(sb.closeSidebar(), false); // invalid from hidden
});

test('an approval request surfaces the sheet inline and the response binds to request_id', () => {
  const sb = new AmbientSidebar(new StubExecutor(), WS);
  sb.open();
  assert.equal(sb.onApprovalRequest(approvalRequest()), true);
  assert.equal(sb.state, 'approving');
  // A foreign-id decision is refused even surfaced inline — placement changes nothing.
  const wrong = sb.respondApproval({ request_id: 'req-999', approved: true, operator_ref: 'op', note: null }, 50);
  assert.equal(wrong.ok, false);
});

test('the intent-box hosted by the sidebar submits into the sidebar foreground workspace', () => {
  const ex = new StubExecutor();
  const sb = new AmbientSidebar(ex, 'ws-fg');
  const r = sb.submit('research widgets');
  assert.ok(r.ok);
  assert.equal(ex.submits[0]?.workspace_id, 'ws-fg');
});

test('no source imports an engine or Electron module; every import is local or node:', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const importFrom = /(?:import|export)\b[^'"]*\bfrom\s*['"]([^'"]+)['"]/g;
  const engine = /^(electron|puppeteer|playwright|chrome-remote-interface|cdp)(\/|$)/i;
  for (const f of readdirSync(src).filter((x) => x.endsWith('.ts'))) {
    const text = readFileSync(join(src, f), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = importFrom.exec(text)) !== null) {
      const spec = m[1]!;
      assert.equal(engine.test(spec), false, f + ' imports engine module ' + spec);
      assert.equal(spec.startsWith('.') || spec.startsWith('node:'), true, f + ' imports non-local ' + spec);
    }
  }
});
