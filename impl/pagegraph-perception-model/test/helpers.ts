// Shared fixtures. Not a test file.

import type { Node, PageGraph, RawAxNode, Snapshot } from '../src/types.ts';

// Pure: identical arguments produce an identical node, so a snapshot is
// deterministic across calls. Callers that need distinct geometry pass bbox.
export function ax(
  ax_id: string,
  ax_role: string,
  opts: Partial<Omit<RawAxNode, 'ax_id' | 'ax_role' | 'children'>> = {},
  children: RawAxNode[] = [],
): RawAxNode {
  return {
    ax_id,
    ax_role,
    name: opts.name ?? '',
    hidden: opts.hidden ?? false,
    presentational: opts.presentational ?? false,
    bbox: opts.bbox ?? { x: 0, y: 0, w: 320, h: 20 },
    attrs: opts.attrs ?? {},
    value_mask: opts.value_mask ?? null,
    text: opts.text ?? '',
    children,
  };
}

// A representative page: a main region with heading, paragraph, and a payment
// form (email, password, card, submit), plus a boilerplate nav, a hidden node,
// and one well-formed and one malformed structured-data block.
export function sampleSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  const tree = ax('root', 'document', { name: 'Doc' }, [
    ax('main', 'main', { name: 'Main' }, [
      ax('h1', 'heading', { name: 'Great Laptop' }),
      ax('p1', 'paragraph', { name: 'A fine machine.', text: 'A fine machine.' }),
      ax('f1', 'form', { attrs: { method: 'post', action: '/pay' } }, [
        ax('email', 'textbox', { name: 'Email', attrs: { type: 'email', name: 'email', autocomplete: 'email' } }),
        ax('pw', 'textbox', { name: 'Password', attrs: { type: 'password', name: 'password' } }),
        ax('card', 'textbox', { name: 'Card number', attrs: { name: 'cardnumber' } }),
        ax('pay', 'button', { name: 'Pay', attrs: { type: 'submit' } }),
      ]),
      ax('hid', 'paragraph', { name: 'secret', hidden: true }),
    ]),
    ax('nav', 'navigation', { name: 'Nav' }, [ax('navlink', 'link', { name: 'Home', attrs: { href: '/' } })]),
  ]);

  return {
    workspace_id: over.workspace_id ?? 'ws-1',
    nav_epoch: over.nav_epoch ?? 7,
    url: over.url ?? 'https://shop.example/item',
    origin: over.origin ?? 'https://shop.example',
    captured_at: over.captured_at ?? '2026-07-20T00:00:00Z',
    ax_tree: over.ax_tree ?? tree,
    structured_data: over.structured_data ?? [
      { format: 'json-ld', well_formed: true, entity_type: 'Product', props: { name: 'Great Laptop', price: 999 }, source_ax_ids: ['h1'] },
      { format: 'microdata', well_formed: false, entity_type: 'Broken', props: {}, source_ax_ids: ['p1'] },
    ],
    paint_area: over.paint_area ?? 500000,
    ax_coverage: over.ax_coverage ?? 0.9,
    ...(over.marks !== undefined ? { marks: over.marks } : {}),
  };
}

export function nodeByName(graph: PageGraph, name: string): Node | undefined {
  return graph.nodes.find((n) => n.name === name);
}
