// P1 — render-surface-contract.
//
// The engine-neutral interface. Every caller above L0 sees only these
// operations; the contract owns no engine code and dispatches to the internal
// parts. It names no Chromium or CDP type, so a second RawEngine satisfies it
// with no change above L0. Actions target a stable node id from the last
// snapshot; a raw CSS selector is outside the input domain and is rejected.
//
// The per-session ticket key is held privately and shared with the action
// control plane (DO-012) at construction; it is never returned, logged, or
// placed in a snapshot or event.

import { CdpDriver } from './cdpDriver.ts';
import type { RawEngine } from './driver.ts';
import { EventMultiplexer } from './eventMux.ts';
import { NOT_FOUND, PageHandleRegistry } from './registry.ts';
import { MaskRegistry, SecretFillChannel } from './secretFill.ts';
import type { SecretResolver } from './secretFill.ts';
import { SessionPartitioner } from './partitioner.ts';
import { TicketVerifier } from './ticket.ts';
import type {
  Action,
  ExecutionTicket,
  FillResult,
  Img,
  PageEvent,
  PageGraph,
  PageHandle,
  SecretRef,
  WorkspaceCtx,
} from './types.ts';

export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function ok<T>(value: T): Outcome<T> {
  return { ok: true, value };
}
function err<T>(error: string): Outcome<T> {
  return { ok: false, error };
}

export class RenderSurface {
  private readonly registry = new PageHandleRegistry();
  private readonly masks = new MaskRegistry();
  private readonly partitioner: SessionPartitioner;
  private readonly driver: CdpDriver;
  private readonly verifier: TicketVerifier;
  private readonly fillChannel: SecretFillChannel;
  private readonly events: EventMultiplexer;

  constructor(
    engine: RawEngine,
    sessionKey: Buffer,
    resolver: SecretResolver,
    now: () => Date = () => new Date(),
  ) {
    this.partitioner = new SessionPartitioner(engine);
    this.driver = new CdpDriver(engine, this.masks);
    this.verifier = new TicketVerifier(sessionKey, this.registry, now);
    this.fillChannel = new SecretFillChannel(engine, this.masks, resolver);
    this.events = new EventMultiplexer(this.registry);
  }

  open(url: string, ctx: WorkspaceCtx): Outcome<PageHandle> {
    if (ctx.workspace_id.length === 0 || ctx.partition_key.length === 0) return err('invalid_ctx');
    const partition = this.partitioner.partitionFor(ctx.workspace_id, ctx.partition_key);
    if (partition === null) return err('invalid_ctx');
    const surface = this.partitioner.createSurface(partition, url, ctx.workspace_id);
    this.driver.attach(surface);
    const handle = this.registry.mint(ctx.workspace_id, partition, surface);
    return ok(handle);
  }

  snapshot(h: PageHandle): Outcome<PageGraph> {
    const rec = this.registry.resolve(h);
    if (rec === NOT_FOUND) return err('not_found');
    return ok(this.driver.pullGraph(rec.surface, rec.workspace_id, rec.nav_epoch, rec.handle_id));
  }

  screenshot(h: PageHandle, marked: boolean): Outcome<Img> {
    const rec = this.registry.resolve(h);
    if (rec === NOT_FOUND) return err('not_found');
    return ok(this.driver.capture(rec.surface, marked));
  }

  act(h: PageHandle, action: Action, ticket: ExecutionTicket): Outcome<null> {
    const rec = this.registry.resolve(h);
    if (rec === NOT_FOUND) return err('not_found');
    if (this.verifier.verify(ticket, h, action) !== 'ok') return err('ticket_rejected');
    const res = this.driver.inject(rec.surface, action.node_id, action.kind, action.value ?? null);
    if (res !== 'ok') return err('unknown_node');
    return ok(null);
  }

  fillSecret(
    h: PageHandle,
    node_id: string,
    secret_ref: SecretRef,
    ticket: ExecutionTicket,
  ): Outcome<FillResult> {
    const rec = this.registry.resolve(h);
    if (rec === NOT_FOUND) return err('not_found');
    const action: Action = { kind: 'fill_secret', node_id };
    if (this.verifier.verify(ticket, h, action) !== 'ok') return err('ticket_rejected');
    const ref = this.driver.resolveRef(rec.surface, node_id);
    if (ref === null) return err('unknown_node');
    const filled = this.fillChannel.fill(rec.surface, rec.handle_id, node_id, ref, secret_ref);
    return ok(filled);
  }

  // Drain the engine's raw events for this surface, route navigation through the
  // multiplexer (which bumps the epoch and clears masks), and return the ordered
  // page-event stream.
  observe(h: PageHandle): Outcome<readonly PageEvent[]> {
    const rec = this.registry.resolve(h);
    if (rec === NOT_FOUND) return err('not_found');
    for (const raw of this.driver.drainEvents(rec.surface)) {
      if (raw.kind === 'nav') {
        this.events.onNavigationCommit(h);
        this.masks.clear(rec.handle_id);
      } else if (raw.kind === 'network') {
        this.events.ingestNetwork(rec.handle_id, raw.detail);
      } else {
        this.events.ingestMutation(rec.handle_id, raw.detail);
      }
    }
    return ok(this.events.drain(h));
  }

  close(h: PageHandle): void {
    this.registry.close(h);
  }
}
