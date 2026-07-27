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
  type: "eq" | "in" | "lt" | "gt" | "gte" | "lte" | "is";
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
  notifications_outbox: Row[];
  financial_outbox: Row[];
  ledger_accounts: Row[];
  ledger_transactions: Row[];
  ledger_entries: Row[];
  stripe_object_bindings: Row[];
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
    notifications_outbox: [],
    financial_outbox: [],
    ledger_accounts: [],
    ledger_transactions: [],
    ledger_entries: [],
    stripe_object_bindings: [],
    users: [],
  };
}

function bindStripeObjects(
  state: MockDbState,
  transaction: Row,
  ledgerTransactionId: string,
  params: Record<string, any>,
) {
  const bindings = [
    ["payment_intent", params.p_stripe_payment_intent_id],
    ["charge", params.p_stripe_charge_id],
  ] as const;

  for (const [type, objectId] of bindings) {
    if (
      objectId &&
      !state.stripe_object_bindings.some(
        (row) =>
          row.transaction_id === transaction.id &&
          row.stripe_object_type === type,
      )
    ) {
      state.stripe_object_bindings.push({
        id: `${type}:${objectId}`,
        transaction_id: transaction.id,
        ledger_transaction_id: ledgerTransactionId,
        stripe_object_type: type,
        stripe_object_id: objectId,
      });
    }
  }
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
    if (f.type === "in" && !f.val.includes(v)) return false;
    if (f.type === "lt" && !(v != null && (v as any) < f.val)) return false;
    if (f.type === "gt" && !(v != null && (v as any) > f.val)) return false;
    if (f.type === "gte" && !(v != null && (v as any) >= f.val)) return false;
    if (f.type === "lte" && !(v != null && (v as any) <= f.val)) return false;
    if (f.type === "is" && v !== f.val) return false;
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
      | { type: "upsert"; rows: Row[]; onConflict?: string }
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
      upsert(
        rows: Row | Row[],
        options?: { onConflict?: string; ignoreDuplicates?: boolean },
      ) {
        pendingOp = {
          type: "upsert",
          rows: Array.isArray(rows) ? rows : [rows],
          onConflict: options?.onConflict,
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
      gte(col: string, val: any) {
        filters.push({ type: "gte", col, val });
        return builder;
      },
      lte(col: string, val: any) {
        filters.push({ type: "lte", col, val });
        return builder;
      },
      is(col: string, val: any) {
        filters.push({ type: "is", col, val });
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

      if (pendingOp.type === "insert" || pendingOp.type === "upsert") {
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
          if (name === "messages" && pendingOp!.type === "insert") {
            for (const row of (pendingOp as any).rows) {
              const transactionId = row.metadata?.transaction_id;
              if (
                row.message_type === "payment_completed" &&
                transactionId &&
                state.messages.some(
                  (existing) =>
                    existing.message_type === "payment_completed" &&
                    existing.metadata?.transaction_id === transactionId,
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
          if (pendingOp!.type === "upsert") {
            const conflictColumn = (pendingOp as any).onConflict;
            const inserted: Row[] = [];
            for (const row of (pendingOp as any).rows) {
              const existing = conflictColumn
                ? (state as any)[name].find(
                    (candidate: Row) =>
                      row[conflictColumn] != null &&
                      candidate[conflictColumn] === row[conflictColumn],
                  )
                : undefined;
              if (!existing) {
                const created = {
                  id:
                    row.id ??
                    `${name}_${(state as any)[name].length + 1}_${Math.random()
                      .toString(36)
                      .slice(2, 8)}`,
                  created_at: row.created_at ?? new Date().toISOString(),
                  ...row,
                };
                (state as any)[name].push(created);
                inserted.push(created);
              }
            }
            return inserted;
          }
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
    async rpc(name: string, params: Record<string, any>) {
      bump(`rpc.${name}`);
      await maybeChaos(`rpc.${name}`);

      if (name === "claim_notifications_outbox") {
        const due = state.notifications_outbox
          .filter(
            (row) =>
              row.status === "PENDING" &&
              row.next_attempt_at <= new Date().toISOString(),
          )
          .slice(0, params.p_limit ?? 50);
        for (const row of due) {
          row.status = "PROCESSING";
          row.lease_token = "10000000-0000-4000-8000-000000000099";
          row.lease_expires_at = new Date(Date.now() + 120_000).toISOString();
        }
        return { data: due, error: null };
      }

      if (name === "complete_notifications_outbox") {
        const row = state.notifications_outbox.find(
          (candidate) =>
            candidate.id === params.p_id &&
            candidate.status === "PROCESSING" &&
            candidate.lease_token === params.p_lease_token,
        );
        if (!row) return { data: false, error: null };
        row.status = "SENT";
        row.sent_at = new Date().toISOString();
        row.lease_token = null;
        row.lease_expires_at = null;
        return { data: true, error: null };
      }

      if (name === "fail_notifications_outbox") {
        const row = state.notifications_outbox.find(
          (candidate) =>
            candidate.id === params.p_id &&
            candidate.status === "PROCESSING" &&
            candidate.lease_token === params.p_lease_token,
        );
        if (!row) return { data: false, error: null };
        row.attempts += 1;
        row.status = row.attempts >= row.max_attempts ? "FAILED" : "PENDING";
        row.last_error = params.p_error;
        row.lease_token = null;
        row.lease_expires_at = null;
        return { data: true, error: null };
      }

      if (name === "claim_financial_outbox") {
        const now = new Date().toISOString();
        const due = state.financial_outbox
          .filter(
            (row) =>
              (params.p_event_types ?? []).includes(row.event_type) &&
              row.next_attempt_at <= now &&
              row.attempts < row.max_attempts &&
              (row.status === "PENDING" ||
                (row.status === "PROCESSING" &&
                  row.lease_expires_at &&
                  row.lease_expires_at < now)),
          )
          .slice(0, params.p_limit ?? 25);
        for (const row of due) {
          row.status = "PROCESSING";
          row.attempts += 1;
          row.lease_token = "10000000-0000-4000-8000-000000000098";
          row.lease_expires_at = new Date(Date.now() + 120_000).toISOString();
        }
        return { data: due, error: null };
      }

      if (name === "complete_financial_outbox") {
        const row = state.financial_outbox.find(
          (candidate) =>
            candidate.id === params.p_id &&
            candidate.status === "PROCESSING" &&
            candidate.lease_token === params.p_lease_token,
        );
        if (!row) return { data: false, error: null };
        row.status = "COMPLETED";
        row.completed_at = new Date().toISOString();
        row.lease_token = null;
        row.lease_expires_at = null;
        return { data: true, error: null };
      }

      if (name === "fail_financial_outbox") {
        const row = state.financial_outbox.find(
          (candidate) =>
            candidate.id === params.p_id &&
            candidate.status === "PROCESSING" &&
            candidate.lease_token === params.p_lease_token,
        );
        if (!row) return { data: false, error: null };
        row.status = row.attempts >= row.max_attempts ? "FAILED" : "PENDING";
        row.last_error = params.p_error;
        row.lease_token = null;
        row.lease_expires_at = null;
        return { data: true, error: null };
      }

      if (name === "finalize_paid_transaction") {
        return withSerializedWrites(!!chaos.serializeWrites, async () => {
          const tx = state.transactions.find(
            (candidate) => candidate.id === params.p_transaction_id,
          );
          if (!tx) return { data: "NOT_FOUND", error: null };
          if (tx.status !== "PENDING_PAYMENT") {
            if (
              !tx.stripe_payment_intent_id &&
              params.p_stripe_payment_intent_id
            ) {
              tx.stripe_payment_intent_id = params.p_stripe_payment_intent_id;
            }
            if (!tx.stripe_charge_id && params.p_stripe_charge_id) {
              tx.stripe_charge_id = params.p_stripe_charge_id;
            }
            const journal = state.ledger_transactions.find(
              (candidate) => candidate.idempotency_key === `payment:${tx.id}`,
            );
            if (journal) {
              bindStripeObjects(state, tx, journal.id, params);
            }
            return { data: "ALREADY_PROCESSED", error: null };
          }

          const totalMinor = Math.round((tx.total_amount ?? 0) * 100);
          const feeMinor = Math.round((tx.fee_amount ?? 0) * 100);
          const sellerMinor = totalMinor - feeMinor;
          const journalId = `payment:${tx.id}`;
          state.ledger_transactions.push({
            id: journalId,
            transaction_id: tx.id,
            journal_type: "payment_captured",
            idempotency_key: `payment:${tx.id}`,
          });
          state.ledger_entries.push(
            {
              id: `${journalId}:cash`,
              ledger_transaction_id: journalId,
              account_id: `${tx.id}:platform_cash`,
              amount_minor: -totalMinor,
            },
            {
              id: `${journalId}:pending`,
              ledger_transaction_id: journalId,
              account_id: `${tx.id}:seller_pending`,
              amount_minor: sellerMinor,
            },
            {
              id: `${journalId}:fee`,
              ledger_transaction_id: journalId,
              account_id: `${tx.id}:platform_fee`,
              amount_minor: feeMinor,
            },
          );

          tx.status = "PAID";
          tx.stripe_payment_intent_id =
            params.p_stripe_payment_intent_id ?? null;
          tx.stripe_charge_id = params.p_stripe_charge_id ?? null;
          bindStripeObjects(state, tx, journalId, params);
          const listing = state.listings.find(
            (candidate) => candidate.id === tx.listing_id,
          );
          if (listing) listing.status = "SOLD";
          for (const offer of state.offers) {
            if (
              offer.listing_id === tx.listing_id &&
              offer.status === "PENDING"
            ) {
              offer.status = "EXPIRED";
            }
          }
          const wallet = state.wallets.find(
            (candidate) => candidate.user_id === tx.seller_id,
          );
          if (wallet) wallet.pending_balance = sellerMinor / 100;
          if (
            !state.financial_outbox.some(
              (row) => row.idempotency_key === `payment-finalized:${tx.id}`,
            )
          ) {
            state.financial_outbox.push({
              id: `payment-finalized:${tx.id}`,
              event_type: "payment_finalized",
              aggregate_id: tx.id,
              idempotency_key: `payment-finalized:${tx.id}`,
              status: "PENDING",
              attempts: 0,
              max_attempts: 12,
              next_attempt_at: new Date().toISOString(),
              lease_token: null,
              lease_expires_at: null,
            });
          }
          return { data: "PAID", error: null };
        });
      }

      if (name === "release_escrow_funds") {
        const { p_transaction_id, p_buyer_id } = params;
        const tx = state.transactions.find((t) => t.id === p_transaction_id);

        if (!tx) {
          return {
            data: null,
            error: { code: "P0002", message: "Transaction not found" },
          };
        }

        if (tx.status !== "SHIPPED") {
          return {
            data: null,
            error: {
              code: "P0001",
              message: `INVALID_STATUS: expected SHIPPED but got ${tx.status}`,
            },
          };
        }

        if (tx.buyer_id !== p_buyer_id) {
          return {
            data: null,
            error: { code: "42501", message: "FORBIDDEN: not the buyer" },
          };
        }

        // `total_amount` includes shipping. Mirror the Sprint 1 SQL exactly:
        // release everything except the platform fee.
        const sellerNet =
          Math.round(((tx.total_amount ?? 0) - (tx.fee_amount ?? 0)) * 100) /
          100;

        const wallet = state.wallets.find((w) => w.user_id === tx.seller_id);

        if (!wallet || wallet.pending_balance < sellerNet) {
          return {
            data: null,
            error: {
              code: "P0001",
              message: `ESCROW_BALANCE_MISMATCH: seller ${tx.seller_id} wallet has insufficient pending_balance`,
            },
          };
        }

        tx.status = "COMPLETED";
        wallet.pending_balance =
          Math.round((wallet.pending_balance - sellerNet) * 100) / 100;
        wallet.available_balance =
          Math.round((wallet.available_balance + sellerNet) * 100) / 100;

        return { data: true, error: null };
      }

      return {
        data: null,
        error: { code: "42883", message: `Unknown RPC: ${name}` },
      };
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
