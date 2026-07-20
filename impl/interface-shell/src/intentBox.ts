// P1 — intent-box. The sole entry for new work. Classification is deterministic: a
// string that parses as an absolute URL with scheme and host becomes a navigate task
// against that origin, and every other non-empty string becomes a natural-language
// task-intent. The box never executes the intent itself; it submits exactly one task
// to DO-016 and returns the handle the card model subscribes to. An empty-after-trim
// string is rejected in place and creates no task.

import type { Executor, SidebarHost } from './seams.ts';
import type { ShellTask } from './types.ts';

export type SubmitResult =
  | { readonly ok: true; readonly handle: string; readonly task: ShellTask }
  | { readonly ok: false; readonly reason: 'EMPTY_INTENT' };

// Returns the origin of an absolute URL (scheme + host), or null if the string is
// not an absolute URL with a host.
function absoluteOrigin(s: string): string | null {
  try {
    const u = new URL(s);
    if (u.host === '') return null; // e.g. "buy:milk" parses but has no host
    return u.protocol + '//' + u.host;
  } catch {
    return null;
  }
}

export class IntentBox {
  constructor(private readonly executor: Executor, private readonly host: SidebarHost) {}

  submit_intent(text: string): SubmitResult {
    const s = text.trim();
    if (s === '') return { ok: false, reason: 'EMPTY_INTENT' };

    const origin = absoluteOrigin(s);
    const task: ShellTask = origin !== null
      ? { kind: 'navigate', origin, url: s, text: s }
      : { kind: 'intent', origin: null, url: null, text: s };

    const workspace_id = this.host.foreground_workspace();
    const handle = this.executor.submit(task, workspace_id); // exactly one submission
    return { ok: true, handle, task };
  }
}
