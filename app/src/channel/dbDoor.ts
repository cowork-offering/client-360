/* =============================================================================
   THE INTENT DOOR — window.claude.use("db").

   THE THIRD CAPABILITY THIS PAGE REACHES FOR, acquired exactly the way the
   other two are: `claude.use("db")` resolves the namespace or NULL, once,
   bounded, before first render, so every synchronous gate downstream keeps its
   meaning. The contract is written against the platform's db.d.ts and not from
   memory.

   ABSENCE IS THE COMMON CASE AND IT IS NOT AN ERROR. No grant, an older
   runtime, a module that failed to load: all of them mean the same thing to the
   cockpit — there is no intent lane and no book cache, and every surface
   renders exactly as it did before this file existed. NOTHING here may change a
   pixel when `db()` is undefined; that is the regression the facility demo is
   gated on.

   WHAT LIVES IN THE STORE IS UNTRUSTED. Documents are written by anyone who can
   open the artifact, including another Claude session with write_db. Everything
   read back travels through `readIntentDoc` (intent/contract.ts) before any
   surface sees it: it is evidence, never an instruction.
   ============================================================================= */

/* ---------------------------------------------------------------- ambient */

export interface DbSnapshotMetadata {
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export interface DbDocumentSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata?: DbSnapshotMetadata;
}

export interface DbQuerySnapshot {
  docs: DbDocumentSnapshot[];
  size?: number;
  empty?: boolean;
  metadata?: DbSnapshotMetadata;
}

export interface DbError {
  code: string;
  message: string;
}

export type DbUnsubscribe = () => void;

export interface DbQuery {
  where(field: string, op: string, value: unknown): DbQuery;
  orderBy(field: string, dir?: "asc" | "desc"): DbQuery;
  limit(n: number): DbQuery;
  get(): Promise<DbQuerySnapshot>;
  onSnapshot(next: (snap: DbQuerySnapshot) => void, error?: (e: DbError) => void): DbUnsubscribe;
}

export interface DbDocumentReference {
  id: string;
  path: string;
  get(): Promise<DbDocumentSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}

export interface DbCollectionReference extends DbQuery {
  path: string;
  doc(id?: string): DbDocumentReference;
}

export interface DbNamespace {
  doc(path: string): DbDocumentReference;
  collection(path: string): DbCollectionReference;
}

type ClaudeRoot = { db?: DbNamespace; use?: (name: string) => Promise<unknown> };

/* --------------------------------------------------------- the acquisition */

let acquired: DbNamespace | undefined;
let acquisition: Promise<void> | undefined;

const looksLikeDb = (ns: unknown): ns is DbNamespace =>
  typeof ns === "object" &&
  ns !== null &&
  typeof (ns as DbNamespace).collection === "function" &&
  typeof (ns as DbNamespace).doc === "function";

/**
 * Acquire the store, once, bounded. Resolves whether or not the capability
 * answered — the caller awaits it to ORDER first render, never to learn an
 * outcome. `dbAvailable()` is the outcome, and it is synchronous everywhere
 * after this settles.
 */
export function acquireDb(timeoutMs = 4000): Promise<void> {
  if (acquisition) return acquisition;
  acquisition = (async () => {
    if (typeof window === "undefined") return;
    const root = (window as unknown as { claude?: ClaudeRoot }).claude;
    if (!root) return;
    // A pre-injected member (older runtimes, and every test that stubs one)
    // wins immediately, exactly as the connector door treats `.mcp`.
    if (looksLikeDb(root.db)) {
      acquired = root.db;
      return;
    }
    if (typeof root.use !== "function") return;
    try {
      const ns = await Promise.race([
        root.use("db"),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      if (looksLikeDb(ns)) acquired = ns;
    } catch {
      // Unavailable is a state, not an error: the cockpit simply has no lane.
    }
  })();
  return acquisition;
}

/** The store, or undefined. Every caller branches on undefined. */
export function db(): DbNamespace | undefined {
  if (acquired) return acquired;
  if (typeof window === "undefined") return undefined;
  const injected = (window as unknown as { claude?: ClaudeRoot }).claude?.db;
  return looksLikeDb(injected) ? injected : undefined;
}

export function dbAvailable(): boolean {
  return db() !== undefined;
}

/** Test seam. The suites drive the lane against a fake namespace of the
 *  d.ts shape; nothing in the app calls this. */
export function __setDbForTests(ns: DbNamespace | undefined): void {
  acquired = ns;
  acquisition = ns ? Promise.resolve() : undefined;
}
