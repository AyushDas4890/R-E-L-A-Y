// The browser's copy of one open database and the databases it relates to. What other people change
// arrives as deltas (whole changed items) and is merged here; edits go to the server and come back the same way.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRelayCtx } from './ctx.ts';
import { applyDelta, type Ctx } from './dbquery.ts';
import type { DbData, PageLevel, PageMeta, PropValue, SchemaOp, ViewOp } from './types.ts';

export interface OpenDb {
  db: DbData;
  meta: PageMeta;
  level: PageLevel;
}

export function useDatabase(id: string | null) {
  const { send, listen, snap } = useRelayCtx();
  const [open, setOpen] = useState<OpenDb | null>(null);
  const [denied, setDenied] = useState(false);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // Databases this one relates to, loaded on demand, so relations and rollups can show titles and values.
  const others = useRef(new Map<string, DbData>());
  const asked = useRef(new Set<string>());
  const current = useRef<string | null>(null);

  useEffect(() => {
    current.current = id;
    setOpen(null);
    setDenied(false);
    others.current = new Map();
    asked.current = new Set();
    if (!id) return;
    send({ t: 'dbGet', id });
    const off = listen((ev) => {
      if (ev.t === 'dbData') {
        if (ev.id === id) setOpen({ db: ev.db, meta: ev.page, level: ev.level });
        else {
          others.current.set(ev.id, ev.db);
          redraw();
        }
      } else if (ev.t === 'dbDelta') {
        if (ev.id === id) setOpen((o) => (o ? { ...o, db: applyDelta(o.db, ev.delta) } : o));
        else if (others.current.has(ev.id)) {
          others.current.set(ev.id, applyDelta(others.current.get(ev.id)!, ev.delta));
          redraw();
        }
      } else if (ev.t === 'pageRevoked' && ev.id === id) {
        setDenied(true);
      } else if (ev.t === 'pageMeta' && ev.page.id === id) {
        setOpen((o) => (o ? { ...o, meta: ev.page } : o));
      }
    });
    return () => {
      off();
      send({ t: 'dbClose', id });
      for (const other of asked.current) send({ t: 'dbClose', id: other });
    };
  }, [id, send, listen]);

  // Ask for the databases the relation properties point at.
  const db = open?.db;
  useEffect(() => {
    if (!db || !id) return;
    for (const p of db.props) {
      const target = p.relation?.dbId;
      if (target && target !== id && !asked.current.has(target)) {
        asked.current.add(target);
        send({ t: 'dbGet', id: target });
      }
    }
  }, [db, id, send]);

  const related = useCallback((dbId: string): DbData | undefined => (dbId === current.current ? open?.db : others.current.get(dbId)), [open]);
  const ctx: Ctx = useMemo(
    () => ({
      now: Date.now(),
      related,
      userName: (uid: string) => snap.users[uid]?.name ?? 'Someone',
    }),
    // `now` is read once per render batch; that is fine for filters like "today".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [related, snap.users, open],
  );

  const canEdit = !!open && (open.level === 'edit-content' || open.level === 'edit' || open.level === 'full') && !open.meta.trashedAt;
  // Properties, views and the like need more than content access.
  const canDesign = !!open && (open.level === 'edit' || open.level === 'full') && !open.meta.trashedAt;
  const canManage = !!open && open.level === 'full';

  return {
    state: denied ? ('denied' as const) : open ? ('ready' as const) : ('loading' as const),
    db: open?.db ?? null,
    meta: open?.meta ?? null,
    level: open?.level ?? ('none' as PageLevel),
    canEdit,
    canDesign,
    canManage,
    ctx,
    related,
    schema: (ops: SchemaOp[]) => id && send({ t: 'dbSchema', id, ops }),
    view: (op: ViewOp) => id && send({ t: 'dbView', id, op }),
    createRow: (props?: Record<string, PropValue>, template?: string, after?: string | null) => id && send({ t: 'rowCreate', id, props, template, after }),
    updateRow: (rowId: string, props: Record<string, PropValue>) => id && send({ t: 'rowUpdate', id, rowId, props }),
    setIcon: (rowId: string, icon: string) => id && send({ t: 'rowUpdate', id, rowId, icon }),
    removeRow: (rowId: string, restore = false) => id && send({ t: 'rowRemove', id, rowId, restore }),
    moveRow: (rowId: string, after: string | null) => id && send({ t: 'rowMove', id, rowId, after }),
    pressButton: (rowId: string, prop: string) => id && send({ t: 'rowButton', id, rowId, prop }),
  };
}

export type DatabaseApi = ReturnType<typeof useDatabase>;
