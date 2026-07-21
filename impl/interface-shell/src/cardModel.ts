// P2 — task-card-model. The single subscriber to a task's DO-016 run state, holding
// no run state of its own beyond the projection. Each run-state update advances the
// card by a pure mapping, so a card is a pure function of run state and an identical
// event stream yields an identical card. The model issues no executing call — it
// displays a run, never advances one.

import type { CardStatus, PlanStep, RunEvent, StepStatus, TaskCard } from './types.ts';

export function initialCard(task_id: string, workspace_id: string, title: string): TaskCard {
  return {
    task_id, workspace_id, title,
    status: 'submitted', plan: [], activity_ref: 'activity:' + task_id,
    artifact_refs: [], evidence_refs: [], updated_seq: 0,
  };
}

function statusMap(event: RunEvent, current: CardStatus): CardStatus {
  switch (event.event) {
    case 'run.started': return 'planning';
    case 'step.ready': return current === 'submitted' || current === 'planning' ? 'running' : current;
    case 'step.failed': return 'failed';
    case 'step.in_doubt': return 'failed';
    case 'run.completed': return event.data['outcome'] === 'blocked' ? 'failed' : 'done';
    default: return current;
  }
}

const STEP_STATUS: Partial<Record<RunEvent['event'], StepStatus>> = {
  'step.ready': 'ready',
  'step.succeeded': 'succeeded',
  'step.failed': 'failed',
  'step.skipped': 'skipped',
  'step.in_doubt': 'in_doubt',
};

function updatePlan(plan: readonly PlanStep[], event: RunEvent): readonly PlanStep[] {
  const status = STEP_STATUS[event.event];
  const step_id = event.data['step_id'];
  if (status === undefined || typeof step_id !== 'string') return plan;
  const next = plan.map((p) => (p.step_id === step_id ? { ...p, status } : p));
  if (!next.some((p) => p.step_id === step_id)) next.push({ step_id, label: step_id, status });
  return next;
}

// A pure projection: apply one run-state event to the card. Events at or below the
// card's updated_seq are idempotent no-ops, so re-delivery never double-applies.
export function project(card: TaskCard, event: RunEvent): TaskCard {
  if (event.seq <= card.updated_seq) return card;

  const artifact_refs = [...card.artifact_refs];
  const evidence_refs = [...card.evidence_refs];
  if (event.event === 'step.succeeded' && typeof event.data['output_ref'] === 'string') {
    if (!artifact_refs.includes(event.data['output_ref'])) artifact_refs.push(event.data['output_ref']);
  }
  if (event.event === 'perception.read' && typeof event.data['snapshot_ref'] === 'string') {
    if (!evidence_refs.includes(event.data['snapshot_ref'])) evidence_refs.push(event.data['snapshot_ref']);
  }

  return {
    ...card,
    status: statusMap(event, card.status),
    plan: updatePlan(card.plan, event),
    artifact_refs,
    evidence_refs,
    updated_seq: event.seq,
  };
}

// Fold a whole event stream into a card. Replaying an identical stream yields an
// identical card.
export function projectAll(card: TaskCard, events: readonly RunEvent[]): TaskCard {
  return events.reduce(project, card);
}
