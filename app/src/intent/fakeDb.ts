import type {
  DbCollectionReference,
  DbDocumentReference,
  DbDocumentSnapshot,
  DbNamespace,
  DbQuery,
  DbQuerySnapshot,
} from "../channel/dbDoor";

/* =============================================================================
   A FAKE STORE OF THE d.ts SHAPE — TESTS ONLY.

   Written against the platform's db.d.ts rather than against this app's usage:
   even segment counts, `where`/`orderBy`/`limit` as pure builders, snapshots
   that fire once on registration and again on every write, `update` refusing a
   document that does not exist. If the lane only works against a laxer fake
   than the platform, the lane does not work.

   NOTHING IMPORTS THIS OUTSIDE A TEST OR THE PROBE HARNESS. It is a plain
   module with no side effects, so the bundle's tree shake drops it.
   ============================================================================= */

type Body = Record<string, unknown>;

export interface FakeDb extends DbNamespace {
  /** Every document, keyed by full path. Read it to assert a write landed. */
  docs: Map<string, Body>;
  /** Seed without notifying, the way a store already holding rows behaves. */
  seed(path: string, body: Body): void;
}

const segments = (path: string) => path.split("/").filter(Boolean);

export function createFakeDb(seed: Record<string, Body> = {}): FakeDb {
  const docs = new Map<string, Body>(Object.entries(seed));
  const watchers = new Set<() => void>();
  const notify = () => {
    for (const w of [...watchers]) w();
  };

  const snapOf = (path: string): DbDocumentSnapshot => {
    const body = docs.get(path);
    return {
      id: segments(path).slice(-1)[0] ?? "",
      exists: body !== undefined,
      data: () => (body === undefined ? undefined : { ...body }),
      metadata: { fromCache: false, hasPendingWrites: false },
    };
  };

  const docRef = (path: string): DbDocumentReference => {
    if (segments(path).length % 2 !== 0) throw new TypeError(`document path must have an even number of segments: ${path}`);
    return {
      id: segments(path).slice(-1)[0],
      path,
      get: async () => snapOf(path),
      set: async (data) => {
        docs.set(path, { ...data });
        notify();
      },
      update: async (data) => {
        const body = docs.get(path);
        if (body === undefined) throw { code: "invalid_argument", message: `no document at ${path}` };
        docs.set(path, { ...body, ...data });
        notify();
      },
      delete: async () => {
        docs.delete(path);
        notify();
      },
    };
  };

  interface Filter {
    field: string;
    op: string;
    value: unknown;
  }

  const passes = (body: Body, f: Filter): boolean => {
    const v = body[f.field];
    switch (f.op) {
      case "==":
        return v === f.value;
      case "!=":
        return v !== f.value;
      case "<":
        return (v as number) < (f.value as number);
      case "<=":
        return (v as number) <= (f.value as number);
      case ">":
        return (v as number) > (f.value as number);
      case ">=":
        return (v as number) >= (f.value as number);
      case "in":
        return Array.isArray(f.value) && f.value.includes(v);
      case "not-in":
        return Array.isArray(f.value) && !f.value.includes(v);
      case "array-contains":
        return Array.isArray(v) && v.includes(f.value);
      default:
        return false;
    }
  };

  function makeQuery(
    collection: string,
    filters: Filter[],
    order: { field: string; dir: "asc" | "desc" } | null,
    cap: number | null,
  ): DbQuery {
    const run = (): DbQuerySnapshot => {
      const depth = segments(collection).length;
      let rows = [...docs.entries()]
        .filter(([path]) => path.startsWith(`${collection}/`) && segments(path).length === depth + 1)
        .filter(([, body]) => filters.every((f) => passes(body, f)));
      rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      if (order) {
        rows.sort(([, a], [, b]) => {
          const av = a[order.field];
          const bv = b[order.field];
          const cmp = av === bv ? 0 : (av as never) < (bv as never) ? -1 : 1;
          return order.dir === "desc" ? -cmp : cmp;
        });
      }
      if (cap !== null) rows = rows.slice(0, cap);
      const list = rows.map(([path]) => snapOf(path));
      return { docs: list, size: list.length, empty: !list.length, metadata: { fromCache: false, hasPendingWrites: false } };
    };

    return {
      where: (field, op, value) => makeQuery(collection, [...filters, { field, op, value }], order, cap),
      orderBy: (field, dir = "asc") => makeQuery(collection, filters, { field, dir }, cap),
      limit: (n) => makeQuery(collection, filters, order, n),
      get: async () => run(),
      onSnapshot: (next) => {
        const fire = () => next(run());
        watchers.add(fire);
        fire();
        return () => watchers.delete(fire);
      },
    };
  }

  const collectionRef = (path: string): DbCollectionReference => {
    if (segments(path).length % 2 !== 1) throw new TypeError(`collection path must have an odd number of segments: ${path}`);
    let n = 0;
    return {
      ...makeQuery(path, [], null, null),
      path,
      doc: (id?: string) => docRef(`${path}/${id ?? `auto-${++n}`}`),
    };
  };

  return {
    docs,
    seed: (path, body) => void docs.set(path, body),
    doc: docRef,
    collection: collectionRef,
  };
}
