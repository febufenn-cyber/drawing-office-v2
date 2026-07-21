// DO-021 Interface Shell — public surface. Presents intent, task cards, and the
// approval sheet as the human surface over the agent layers. A pure projection: it
// displays runs and never advances one.

export * from './types.ts';
export type { Clock, Executor, SidebarHost, WorkspaceRead } from './seams.ts';
export { IntentBox, type SubmitResult } from './intentBox.ts';
export { initialCard, project, projectAll } from './cardModel.ts';
export { feed, projectActivity } from './activityStream.ts';
export { render, respond } from './approvalSheet.ts';
export { show } from './evidencePanel.ts';
export { AmbientSidebar } from './sidebar.ts';
