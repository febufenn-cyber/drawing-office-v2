// The external subsystems DO-021 consumes, each an interface with test stubs. The
// shell issues no run-executing or checkpoint-writing call: it submits one task to
// DO-016 and thereafter only projects run state and reads the workspace store. This
// part imports no engine or Electron code — live page rendering stays with L0.

import type { ShellTask, StoredItem } from './types.ts';

// DO-016 task DAG executor: the intent-box submits one task and receives a handle.
// The shell never calls any run-advancing method.
export interface Executor {
  submit(task: ShellTask, workspace_id: string): string; // returns the task handle
}

// DO-019 workspace store: read-only, scoped to one workspace partition.
export interface WorkspaceRead {
  read(workspace_id: string, ref: string): StoredItem | null;
}

// The sidebar that hosts the intent-box supplies the foreground workspace, so every
// submitted task lands in the workspace the user is browsing.
export interface SidebarHost {
  foreground_workspace(): string;
}

// Epoch-seconds clock (for approval expiry).
export interface Clock {
  now(): number;
}
