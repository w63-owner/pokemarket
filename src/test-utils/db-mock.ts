/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * In-memory mock of the Supabase JS client used by `createAdminClient()`.
 *
 * Goals:
 *   - Faithful enough to let us test our state machines and idempotency guards
 *   - Deterministic: identical inputs produce identical outputs
 *   - Concurrency-aware: a `serializeWrites: true` flag forces all writes
 *     through a mutex so we can simulate Postgres row-level atomicity
 *   - Failure injection: arbitrary "where" predicates can be set to throw
 *     a configurable error rate (chaos)
 *
 * The mock supports the (small) subset of supabase-js methods used in
 * production code:
 *   from(table)
 *     .select(cols)         (cols only used to detect "select after update")
 *     .insert(row | rows[])
 *     .update(patch)
 *     .delete()
 *     .eq(col, val)
 *     .in(col, vals)
 *     .lt(col, val)
 *     .order(col, opts?)
 *     .limit(n)
 *     .single()             (throws if 0 or >1)
 *     .maybeSingle()        (returns null if 0, throws if >1)
 *
 *   auth.admin.getUserById(id)
 *
 * Anything used by production code that is NOT here is intentionally absent
 * — adding more should be a deliberate, reviewed step.
 */

type Row = Record<string, any>;

interface Filter {
  type: "eq" | "neq" | "in" | "lt" | "gt";
  col: string;
  val: any;
}

export interface ChaosOptions {
  /** Probability (0..1) that any DB call throws a synthetic error */
  errorRate?: number;
  /** Inject latency (ms, fixed) before each DB call resolves */
  latencyMs?: number;
  /** Force every UPDATE through a global mutex (simulates row locking) */
  serializeWrites?: boolean;
}

export interface MockDbState {
  transactions: Row[];
  listings: Row[];
  wallets: Row[];
  offers: Row[];
  conversations: Row[];
  messages: Row[];
  profiles: Row[];
  stripe_webhooks_processed: Row[];
  stripe_disputes: Row[];
  admin_audit_log: Row[];
  // simulated auth.users
  users: { id: string; email?: string }[];
}

export function makeEmptyState(): MockDbState {
  return {
    transactions: [],
    listings: [],
    wallets: [],
    offers: [],
    conversations: [],
    messages: [],
    profiles: [],
    stripe_webhooks_processed: [],
    stripe_disputes: [],
    admin_audit_log: [],
    users: [],
  };
}

export interface MockDb {
  state: MockDbState;
  client: any;
  chaos: ChaosOptions;
  /** Counters useful for assertions */
  callCounts: Record<string, number>;
  /** Reset chaos & call counters */
  reset(): void;
}

/**
 * Resolve a column name that may contain Postgres JSON-path syntax. We
 * support the two operators we use in production code:
 *
 *   metadata->>transaction_id     → row.metadata?.transaction_id (text)
 *   metadata->transaction_id      → row.metadata?.transaction_id (json)
 */
function resolveColumn(row: Row, col: string): unknown {
  if (col.includes("->>")) {
    const [base, key] = col.split("->>");
    const v = row[base];
    return v == null ? undefined : (v as Record<string, unknown>)[key];
  }
  if (col.includes("->")) {
    const [base, key] = col.split("->");
    const v = row[base];
    return v == null ? undefined : (v as Record<string, unknown>)[key];
  }
  return row[col];
}

function matches(row: Row, filters: Filter[]): boolean {
  for (const f of filters) {
    const v = resolveColumn(row, f.col);
    if (f.type === "eq" && v !== f.val) return false;
    if (f.type === "neq" && v === f.val) return false;
    if (f.type === "in" && !f.val.includes(v)) return false;
    if (f.type === "lt" && !(v != null && (v as any) < f.val)) return false;
    if (f.type === "gt" && !(v != null && (v as any) > f.val)) return false;
  }
  return true;
}

let writeMutex: Promise<unknown> = Promise.resolve();

async function withSerializedWrites<T>(
  enabled: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  if (!enabled) return fn();
  const prev = writeMutex;
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  writeMutex = prev.then(() => next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export function createMockDb(
  initial: Partial<MockDbState> = {},
  chaos: ChaosOptions = {},
): MockDb {
  const state: MockDbState = { ...makeEmptyState(), ...initial };
  const callCounts: Record<string, number> = {};

  function bump(name: string) {
    callCounts[name] = (callCounts[name] ?? 0) + 1;
  }

  async function maybeChaos(op: string) {
    if (chaos.latencyMs)
      await new Promise((r) => setTimeout(r, chaos.latencyMs));
    if (chaos.errorRate && Math.random() < chaos.errorRate) {
      throw new Error(`[chaos] synthetic failure during ${op}`);
    }
  }

  function table(name: keyof MockDbState) {
    const filters: Filter[] = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    let pendingOp:
      | { type: "select"; cols: string }
      | { type: "insert"; rows: Row[] }
      | { type: "update"; patch: Row }
      | { type: "delete" }
      | null = null;
    let postUpdateSelect = false;

    const builder: any = {
      select(cols = "*") {
        if (pendingOp && pendingOp.type !== "select") {
          // chained .select() after update — capture so update returns rows
          postUpdateSelect = true;
          return builder;
        }
        pendingOp = { type: "select", cols };
        return builder;
      },
      insert(rows: Row | Row[]) {
        pendingOp = {
          type: "insert",
          rows: Array.isArray(rows) ? rows : [rows],
        };
        return builder;
      },
      update(patch: Row) {
        pendingOp = { type: "update", patch };
        return builder;
      },
      delete() {
        pendingOp = { type: "delete" };
        return builder;
      },
      eq(col: string, val: any) {
        filters.push({ type: "eq", col, val });
        return builder;
      },
      neq(col: string, val: any) {
        filters.push({ type: "neq", col, val });
        return builder;
      },
      in(col: string, vals: any[]) {
        filters.push({ type: "in", col, val: vals });
        return builder;
      },
      lt(col: string, val: any) {
        filters.push({ type: "lt", col, val });
        return builder;
      },
      gt(col: string, val: any) {
        filters.push({ type: "gt", col, val });
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending !== false;
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      async single() {
        const rows = await runQuery();
        if (rows.length === 0) {
          return {
            data: null,
            error: { code: "PGRST116", message: "no rows" },
          };
        }
        if (rows.length > 1) {
          return {
            data: null,
            error: {
              code: "PGRST117",
              message: "multiple rows returned for single()",
            },
          };
        }
        return { data: rows[0], error: null };
      },
      async maybeSingle() {
        const rows = await runQuery();
        if (rows.length === 0) return { data: null, error: null };
        if (rows.length > 1) {
          return {
            data: null,
            error: {
              code: "PGRST117",
              message: "multiple rows returned for maybeSingle()",
            },
          };
        }
        return { data: rows[0], error: null };
      },
      then(onFulfilled: any, onRejected: any) {
        // Mirror supabase-js: errors with a `code` are returned, not thrown.
        return runQuery().then(
          (rows) => onFulfilled({ data: rows, error: null }),
          (err: any) => {
            if (err && typeof err === "object" && "code" in err) {
              return onFulfilled({
                data: null,
                error: { code: err.code, message: err.message },
              });
            }
            return onRejected ? onRejected(err) : Promise.reject(err);
          },
        );
      },
    };

    async function runQuery(): Promise<Row[]> {
      bump(`${name}.${pendingOp?.type ?? "select"}`);
      await maybeChaos(`${name}.${pendingOp?.type ?? "select"}`);

      if (!pendingOp) return [];

      if (pendingOp.type === "insert") {
        return withSerializedWrites(!!chaos.serializeWrites, async () => {
          // unique-constraint emulation for stripe_webhooks_processed.stripe_event_id
          if (name === "stripe_webhooks_processed") {
            for (const r of pendingOp!.type === "insert"
              ? (pendingOp as any).rows
              : []) {
              if (
                state.stripe_webhooks_processed.some(
                  (existing) => existing.stripe_event_id === r.stripe_event_id,
                )
              ) {
                throw Object.assign(
                  new Error("duplicate key value violates unique constraint"),
                  { code: "23505" },
                );
              }
            }
          }
          if (!(state as any)[name]) (state as any)[name] = [];
          const rows = (pendingOp as any).rows.map((r: Row) => ({
            id:
              r.id ??
              `${name}_${(state as any)[name].length + 1}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,
            created_at: r.created_at ?? new Date().toISOString(),
            ...r,
          }));
          (state as any)[name].push(...rows);
          return rows;
        });
      }

      if (pendingOp.type === "update") {
        return withSerializedWrites(!!chaos.serializeWrites, async () => {
          if (!(state as any)[name]) (state as any)[name] = [];
          const updated: Row[] = [];
          for (const r of (state as any)[name]) {
            if (matches(r, filters)) {
              Object.assign(r, (pendingOp as any).patch);
              updated.push({ ...r });
            }
          }
          return postUpdateSelect ? updated : [];
        });
      }

      if (pendingOp.type === "delete") {
        return withSerializedWrites(!!chaos.serializeWrites, async () => {
          if (!(state as any)[name]) (state as any)[name] = [];
          const remaining: Row[] = [];
          const removed: Row[] = [];
          for (const r of (state as any)[name]) {
            if (matches(r, filters)) removed.push(r);
            else remaining.push(r);
          }
          (state as any)[name] = remaining;
          return removed;
        });
      }

      // select
      const tableRows: Row[] = (state as any)[name] ?? [];
      let rows = tableRows.filter((r: Row) => matches(r, filters));
      if (orderCol) {
        rows = rows.slice().sort((a: Row, b: Row) => {
          if (a[orderCol!] < b[orderCol!]) return orderAsc ? -1 : 1;
          if (a[orderCol!] > b[orderCol!]) return orderAsc ? 1 : -1;
          return 0;
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    }

    return builder;
  }

  const client = {
    from(name: string) {
      return table(name as keyof MockDbState);
    },
    auth: {
      admin: {
        async getUserById(id: string) {
          await maybeChaos("auth.admin.getUserById");
          const user = state.users.find((u) => u.id === id);
          return { data: { user: user ?? null }, error: null };
        },
      },
    },
  };

  return {
    state,
    client,
    chaos,
    callCounts,
    reset() {
      Object.keys(callCounts).forEach((k) => delete callCounts[k]);
      this.chaos.errorRate = 0;
      this.chaos.latencyMs = 0;
      this.chaos.serializeWrites = false;
    },
  };
}
