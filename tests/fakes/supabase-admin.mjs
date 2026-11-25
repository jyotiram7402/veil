const DB_TIME = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/;

export function micros(iso) {
  const m = DB_TIME.exec(iso);
  if (!m) throw new Error("not a database time: " + iso);
  return BigInt(Date.parse(m[1] + m[3])) * 1000n + BigInt(((m[2] || "") + "000000").slice(0, 6));
}

function compare(a, b) {
  if (typeof a === "string" && typeof b === "string" && DB_TIME.test(a) && DB_TIME.test(b)) {
    const x = micros(a);
    const y = micros(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

let nextId = 1;

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.op = "select";
    this.filters = [];
    this.said = [];
  }
  select(cols) {
    this.said.push(`select(${cols})`);
    return this;
  }
  delete() {
    this.op = "delete";
    this.said.push("delete()");
    return this;
  }
  update(values) {
    this.op = "update";
    this.values = values;
    this.said.push(`update(${Object.keys(values)})`);
    return this;
  }
  upsert(row, options = {}) {
    this.op = "upsert";
    this.values = row;
    this.options = options;
    this.said.push(
      `upsert(${Object.keys(row)}) on ${options.onConflict}${options.ignoreDuplicates ? " ignore" : ""}`,
    );
    return this;
  }
  eq(col, v) {
    this.said.push(`eq(${col})`);
    this.filters.push((r) => r[col] === v);
    return this;
  }
  in(col, vs) {
    this.said.push(`in(${col} x${vs.length})`);
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  or(expr) {
    this.said.push(`or(${expr})`);
    const tests = expr.split(",").map((part) => {
      const [col, op, ...rest] = part.split(".");
      const value = rest.join(".");
      if (op === "is" && value === "null") return (r) => r[col] === null;
      if (op === "neq") return (r) => r[col] !== null && r[col] !== value;
      throw new Error("fake database: unknown filter " + part);
    });
    this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }
  lte(col, v) {
    this.said.push(`lte(${col})`);
    this.filters.push((r) => micros(r[col]) <= micros(v));
    return this;
  }
  order(col, { ascending }) {
    this.sort = (a, b) => compare(a[col], b[col]) * (ascending ? 1 : -1);
    return this;
  }
  range(from, to) {
    this.slice = [from, to + 1];
    return this;
  }
  limit(n) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  run() {
    const db = this.db;
    db.calls.push(`${this.table}: ${this.said.join(" ")}`);
    if (db.down) return { data: null, error: { message: "the database is down" } };
    const rows = db.tables[this.table];
    if (!rows) {
      return { data: null, error: { message: `relation "public.${this.table}" does not exist` } };
    }
    const hit = rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.op === "delete") {
      if (db.failDelete) return { data: null, error: { message: "delete failed" } };
      db.tables[this.table] = rows.filter((r) => !hit.includes(r));
      return { data: null, error: null };
    }
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.values);
      return { data: null, error: null };
    }
    if (this.op === "upsert") {
      const key = this.options.onConflict;
      const existing = rows.find((r) => r[key] === this.values[key]);
      if (existing) {
        if (!this.options.ignoreDuplicates) Object.assign(existing, this.values);
      } else {
        const defaults =
          this.table === "push_subscriptions"
            ? { id: `device-${nextId++}`, seen_at: null, created_at: db.clock() }
            : { created_at: db.clock() };
        rows.push({ ...defaults, ...this.values });
      }
      return { data: null, error: null };
    }

    if (this.table === "messages" && db.failSelect) {
      return { data: null, error: { message: "select failed" } };
    }
    let out = [...hit];
    if (this.sort) out.sort(this.sort);
    if (this.slice) out = out.slice(...this.slice);
    if (this.max !== undefined) out = out.slice(0, this.max);
    if (this.single) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
  then(ok, fail) {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, fail);
  }
}

export function supabaseAdmin() {
  const db = globalThis.__db;
  return {
    from: (table) => new Query(db, table),
    auth: {
      admin: {
        async updateUserById(id, attrs) {
          db.calls.push(`auth: update ${id} (${Object.keys(attrs)})`);
          if (db.authDown) return { data: { user: null }, error: { message: "auth is down" } };
          (db.authUpdates ??= []).push({ id, attrs });
          return { data: { user: { id } }, error: null };
        },
      },
    },
    storage: {
      from(bucket) {
        return {
          async remove(paths) {
            db.calls.push(`storage ${bucket}: remove x${paths.length}`);
            if (db.storageDown) return { data: null, error: { message: "storage is down" } };
            for (const p of paths) db.files.delete(p);
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };
}
