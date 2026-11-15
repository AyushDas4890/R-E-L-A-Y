// Making a page that already has content (an import, a conversion): create it, wait for the server to
// say it exists, then send the blocks in small batches.
import type { Block, ClientEvent, ServerEvent } from './types.ts';

interface Link {
  send: (ev: ClientEvent) => void;
  listen: (fn: (ev: ServerEvent) => void) => () => void;
}

export function createWithBlocks(link: Link, create: ClientEvent, blocks: Block[], onDone?: (id: string) => void): void {
  const off = link.listen((ev) => {
    if (ev.t !== 'pageCreated') return;
    off();
    let after: string | null = null;
    for (let i = 0; i < blocks.length; i += 40) {
      const ops = blocks.slice(i, i + 40).map((block) => {
        const op = { op: 'insert' as const, parent: null, after, block };
        after = block.id;
        return op;
      });
      link.send({ t: 'blockOps', id: ev.id, ops });
    }
    onDone?.(ev.id);
  });
  link.send(create);
}
