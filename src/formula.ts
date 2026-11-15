// The formula language of database properties. A small hand-written parser and evaluator: formulas
// are data, never code, so there is no eval and no access to anything but the row they are given.
//   prop("Price") * 2           if(prop("Done"), "Yes", "No")        prop("Due").dateBetween(now(), "days")
// A formula that does not parse or fails gives an error value, never an exception.

// A date is `{ d }`, milliseconds in UTC.
export type FV = number | string | boolean | null | FV[] | { d: number };
export interface Env {
  prop: (name: string) => FV;
  now?: () => number;
}

type Tok =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string };

type Node =
  | { n: 'lit'; v: FV }
  | { n: 'id'; v: string }
  | { n: 'call'; fn: string; args: Node[] }
  | { n: 'bin'; op: string; a: Node; b: Node }
  | { n: 'un'; op: string; a: Node }
  | { n: 'cond'; c: Node; a: Node; b: Node }
  | { n: 'list'; items: Node[] };

class FormulaError extends Error {}
const fail = (m: string): never => {
  throw new FormulaError(m);
};

const MAX_LEN = 2000;
const MAX_STEPS = 20_000;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (/[0-9.]/.test(c) && !(c === '.' && !/[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      const v = Number(src.slice(i, j));
      if (Number.isNaN(v)) fail(`Bad number “${src.slice(i, j)}”`);
      out.push({ k: 'num', v });
      i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const e = src[j + 1];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          j += 2;
        } else {
          s += src[j];
          j += 1;
        }
      }
      if (j >= src.length) fail('A text is missing its closing quote');
      out.push({ k: 'str', v: s });
      i = j + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      out.push({ k: 'id', v: src.slice(i, j) });
      i = j;
    } else {
      const two = src.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
        out.push({ k: 'op', v: two });
        i += 2;
      } else if ('+-*/%^<>!?:,()[].'.includes(c)) {
        out.push({ k: 'op', v: c });
        i += 1;
      } else {
        fail(`Unexpected “${c}”`);
      }
    }
  }
  return out;
}

class Parser {
  i = 0;
  depth = 0;
  toks: Tok[];
  constructor(toks: Tok[]) {
    this.toks = toks;
  }
  private peek = (): Tok | undefined => this.toks[this.i];
  private isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.k === 'op' && t.v === v;
  }
  private eat(v: string): void {
    if (!this.isOp(v)) fail(`Expected “${v}”`);
    this.i += 1;
  }
  parse(): Node {
    const n = this.ternary();
    if (this.i < this.toks.length) fail('Unexpected text after the formula');
    return n;
  }
  private ternary(): Node {
    const c = this.or();
    if (this.isOp('?')) {
      this.i += 1;
      const a = this.ternary();
      this.eat(':');
      const b = this.ternary();
      return { n: 'cond', c, a, b };
    }
    return c;
  }
  private word(v: string): boolean {
    const t = this.peek();
    return !!t && t.k === 'id' && t.v === v;
  }
  private or(): Node {
    let a = this.and();
    while (this.isOp('||') || this.word('or')) {
      this.i += 1;
      a = { n: 'bin', op: '||', a, b: this.and() };
    }
    return a;
  }
  private and(): Node {
    let a = this.equality();
    while (this.isOp('&&') || this.word('and')) {
      this.i += 1;
      a = { n: 'bin', op: '&&', a, b: this.equality() };
    }
    return a;
  }
  private equality(): Node {
    let a = this.compare();
    while (this.isOp('==') || this.isOp('!=')) {
      const op = (this.toks[this.i++] as { v: string }).v;
      a = { n: 'bin', op, a, b: this.compare() };
    }
    return a;
  }
  private compare(): Node {
    let a = this.add();
    while (this.isOp('<') || this.isOp('>') || this.isOp('<=') || this.isOp('>=')) {
      const op = (this.toks[this.i++] as { v: string }).v;
      a = { n: 'bin', op, a, b: this.add() };
    }
    return a;
  }
  private add(): Node {
    let a = this.mul();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.toks[this.i++] as { v: string }).v;
      a = { n: 'bin', op, a, b: this.mul() };
    }
    return a;
  }
  private mul(): Node {
    let a = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = (this.toks[this.i++] as { v: string }).v;
      a = { n: 'bin', op, a, b: this.unary() };
    }
    return a;
  }
  private unary(): Node {
    if (this.isOp('-') || this.isOp('!') || this.word('not')) {
      const t = this.toks[this.i++] as { v: string };
      return { n: 'un', op: t.v === 'not' ? '!' : t.v, a: this.unary() };
    }
    return this.pow();
  }
  private pow(): Node {
    const a = this.postfix();
    if (this.isOp('^')) {
      this.i += 1;
      return { n: 'bin', op: '^', a, b: this.unary() };
    }
    return a;
  }
  private args(): Node[] {
    const out: Node[] = [];
    this.eat('(');
    if (!this.isOp(')')) {
      do out.push(this.ternary());
      while (this.isOp(',') && ++this.i);
    }
    this.eat(')');
    return out;
  }
  private postfix(): Node {
    let a = this.primary();
    while (this.isOp('.')) {
      this.i += 1;
      const t = this.toks[this.i++];
      if (!t || t.k !== 'id') fail('Expected a function name after “.”');
      a = { n: 'call', fn: (t as { v: string }).v, args: [a, ...(this.isOp('(') ? this.args() : [])] };
    }
    return a;
  }
  private primary(): Node {
    if (++this.depth > 60) fail('That formula is nested too deeply');
    const t = this.toks[this.i++];
    let node: Node;
    if (!t) return fail('The formula ends too early');
    if (t.k === 'num' || t.k === 'str') node = { n: 'lit', v: t.v };
    else if (t.k === 'id') {
      if (t.v === 'true') node = { n: 'lit', v: true };
      else if (t.v === 'false') node = { n: 'lit', v: false };
      else if (this.isOp('(')) node = { n: 'call', fn: t.v, args: this.args() };
      else node = { n: 'id', v: t.v };
    } else if (t.v === '(') {
      node = this.ternary();
      this.eat(')');
    } else if (t.v === '[') {
      const items: Node[] = [];
      if (!this.isOp(']')) {
        do items.push(this.ternary());
        while (this.isOp(',') && ++this.i);
      }
      this.eat(']');
      node = { n: 'list', items };
    } else {
      return fail(`Unexpected “${t.v}”`);
    }
    this.depth -= 1;
    return node;
  }
}

const cache = new Map<string, Node | string>();
function parse(src: string): Node {
  const hit = cache.get(src);
  if (typeof hit === 'string') throw new FormulaError(hit);
  if (hit) return hit;
  try {
    if (src.length > MAX_LEN) fail('That formula is too long');
    const node = new Parser(tokenize(src)).parse();
    if (cache.size > 500) cache.clear();
    cache.set(src, node);
    return node;
  } catch (err) {
    const msg = err instanceof FormulaError ? err.message : 'Bad formula';
    if (cache.size > 500) cache.clear();
    cache.set(src, msg);
    throw new FormulaError(msg);
  }
}

// ---- Values ----

const isDate = (v: FV): v is { d: number } => !!v && typeof v === 'object' && !Array.isArray(v);
export const dateOf = (iso: string): FV => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  return m ? { d: Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) } : null;
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDate(ms: number, fmt = 'MMM D, YYYY'): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const map: Record<string, string> = {
    YYYY: String(d.getUTCFullYear()), YY: p(d.getUTCFullYear() % 100), MMMM: MONTHS[d.getUTCMonth()], MMM: MONTHS[d.getUTCMonth()].slice(0, 3),
    MM: p(d.getUTCMonth() + 1), M: String(d.getUTCMonth() + 1), DD: p(d.getUTCDate()), D: String(d.getUTCDate()),
    dddd: DAYS[d.getUTCDay()], ddd: DAYS[d.getUTCDay()].slice(0, 3), HH: p(d.getUTCHours()), mm: p(d.getUTCMinutes()),
  };
  return fmt.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|mm/g, (t) => map[t]);
}

export function display(v: FV): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e9) / 1e9);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(display).join(', ');
  return formatDate(v.d, v.d % 86_400_000 === 0 ? 'MMM D, YYYY' : 'MMM D, YYYY HH:mm');
}

const truthy = (v: FV): boolean => (Array.isArray(v) ? v.length > 0 : isDate(v) ? true : !!v && v !== '0');
const num = (v: FV): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isDate(v)) return v.d;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    return v.trim() === '' || Number.isNaN(n) ? fail(`“${v}” is not a number`) : n;
  }
  return v === null ? 0 : fail('Expected a number');
};
const text = (v: FV): string => display(v);
const same = (a: FV, b: FV): boolean => {
  if (isDate(a) && isDate(b)) return a.d === b.d;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  return a === b || (a === null && b === '') || (a === '' && b === null);
};
const cmp = (a: FV, b: FV): number => {
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return num(a) - num(b);
};
const asDate = (v: FV): number => {
  if (isDate(v)) return v.d;
  if (typeof v === 'string') {
    const d = dateOf(v);
    if (isDate(d)) return d.d;
  }
  return fail('Expected a date');
};
const UNIT_MS: Record<string, number> = { seconds: 1000, minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 };
function shift(ms: number, n: number, unit: string): number {
  const u = unit.endsWith('s') ? unit : `${unit}s`;
  if (UNIT_MS[u]) return ms + n * UNIT_MS[u];
  const d = new Date(ms);
  if (u === 'months') d.setUTCMonth(d.getUTCMonth() + n);
  else if (u === 'years') d.setUTCFullYear(d.getUTCFullYear() + n);
  else fail(`Unknown unit “${unit}”`);
  return d.getTime();
}

type Fn = (a: FV[], env: Env) => FV;
const FUNCS: Record<string, Fn> = {
  not: ([a]) => !truthy(a),
  equal: ([a, b]) => same(a, b),
  unequal: ([a, b]) => !same(a, b),
  empty: ([a]) => a === null || a === '' || (Array.isArray(a) && a.length === 0),
  length: ([a]) => (Array.isArray(a) ? a.length : text(a).length),
  concat: (a) => a.map(text).join(''),
  join: ([list, sep]) => (Array.isArray(list) ? list : [list]).map(text).join(sep === undefined ? ', ' : text(sep)),
  slice: ([s, from, to]) => {
    if (Array.isArray(s)) return s.slice(num(from), to === undefined ? undefined : num(to));
    return text(s).slice(num(from), to === undefined ? undefined : num(to));
  },
  contains: ([a, b]) => (Array.isArray(a) ? a.some((x) => same(x, b)) : text(a).toLowerCase().includes(text(b).toLowerCase())),
  replace: ([s, from, to]) => text(s).replace(text(from), text(to)),
  replaceAll: ([s, from, to]) => text(s).split(text(from)).join(text(to)),
  lower: ([s]) => text(s).toLowerCase(),
  upper: ([s]) => text(s).toUpperCase(),
  trim: ([s]) => text(s).trim(),
  // A regular expression from a formula is the one place a person can write a slow pattern; cap the subject.
  test: ([s, re]) => {
    try {
      return new RegExp(text(re).slice(0, 200)).test(text(s).slice(0, 5000));
    } catch {
      return fail('Bad pattern');
    }
  },
  format: ([v]) => text(v),
  toNumber: ([v]) => num(v),
  round: ([v, places]) => {
    const f = 10 ** (places === undefined ? 0 : num(places));
    return Math.round(num(v) * f) / f;
  },
  floor: ([v]) => Math.floor(num(v)),
  ceil: ([v]) => Math.ceil(num(v)),
  abs: ([v]) => Math.abs(num(v)),
  sign: ([v]) => Math.sign(num(v)),
  sqrt: ([v]) => Math.sqrt(num(v)),
  cbrt: ([v]) => Math.cbrt(num(v)),
  exp: ([v]) => Math.exp(num(v)),
  ln: ([v]) => Math.log(num(v)),
  log10: ([v]) => Math.log10(num(v)),
  log2: ([v]) => Math.log2(num(v)),
  pow: ([a, b]) => num(a) ** num(b),
  mod: ([a, b]) => num(a) % num(b),
  min: (a) => Math.min(...a.flat().map(num)),
  max: (a) => Math.max(...a.flat().map(num)),
  sum: (a) => a.flat().reduce<number>((s, v) => s + num(v), 0),
  mean: (a) => {
    const xs = a.flat().map(num);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
  },
  median: (a) => {
    const xs = a.flat().map(num).sort((x, y) => x - y);
    if (!xs.length) return 0;
    const m = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
  },
  now: (_a, env) => ({ d: (env.now ?? Date.now)() }),
  today: (_a, env) => ({ d: Math.floor((env.now ?? Date.now)() / 86_400_000) * 86_400_000 }),
  dateAdd: ([d, n, unit]) => ({ d: shift(asDate(d), num(n), text(unit)) }),
  dateSubtract: ([d, n, unit]) => ({ d: shift(asDate(d), -num(n), text(unit)) }),
  dateBetween: ([a, b, unit]) => {
    const u = text(unit ?? 'days');
    const ms = asDate(a) - asDate(b);
    const key = u.endsWith('s') ? u : `${u}s`;
    if (UNIT_MS[key]) return Math.trunc(ms / UNIT_MS[key]);
    const da = new Date(asDate(a));
    const db = new Date(asDate(b));
    const months = (da.getUTCFullYear() - db.getUTCFullYear()) * 12 + da.getUTCMonth() - db.getUTCMonth();
    return key === 'years' ? Math.trunc(months / 12) : months;
  },
  formatDate: ([d, fmt]) => formatDate(asDate(d), fmt === undefined ? undefined : text(fmt)),
  year: ([d]) => new Date(asDate(d)).getUTCFullYear(),
  month: ([d]) => new Date(asDate(d)).getUTCMonth() + 1,
  date: ([d]) => new Date(asDate(d)).getUTCDate(),
  day: ([d]) => new Date(asDate(d)).getUTCDay() || 7,
  hour: ([d]) => new Date(asDate(d)).getUTCHours(),
  minute: ([d]) => new Date(asDate(d)).getUTCMinutes(),
  timestamp: ([d]) => asDate(d),
  fromTimestamp: ([n]) => ({ d: num(n) }),
  first: ([l]) => (Array.isArray(l) ? l[0] ?? null : l),
  last: ([l]) => (Array.isArray(l) ? l[l.length - 1] ?? null : l),
  sort: ([l]) => (Array.isArray(l) ? [...l].sort(cmp) : l),
  reverse: ([l]) => (Array.isArray(l) ? [...l].reverse() : l),
  unique: ([l]) => (Array.isArray(l) ? l.filter((x, i) => l.findIndex((y) => same(x, y)) === i) : l),
  at: ([l, i]) => (Array.isArray(l) ? l[num(i)] ?? null : null),
};

// Functions that decide for themselves which arguments to evaluate.
type Scope = Map<string, FV>;

function run(src: string, env: Env): FV {
  const root = parse(src);
  let steps = 0;
  const go = (n: Node, scope: Scope): FV => {
    if (++steps > MAX_STEPS) fail('That formula is too complex');
    switch (n.n) {
      case 'lit': return n.v;
      case 'id': {
        if (scope.has(n.v)) return scope.get(n.v) ?? null;
        return fail(`Unknown name “${n.v}”`);
      }
      case 'list': return n.items.map((x) => go(x, scope));
      case 'cond': return truthy(go(n.c, scope)) ? go(n.a, scope) : go(n.b, scope);
      case 'un': {
        const a = go(n.a, scope);
        return n.op === '-' ? -num(a) : !truthy(a);
      }
      case 'bin': {
        if (n.op === '&&') {
          const a = go(n.a, scope);
          return truthy(a) ? truthy(go(n.b, scope)) : false;
        }
        if (n.op === '||') {
          const a = go(n.a, scope);
          return truthy(a) ? true : truthy(go(n.b, scope));
        }
        const a = go(n.a, scope);
        const b = go(n.b, scope);
        switch (n.op) {
          case '+':
            if (typeof a === 'string' || typeof b === 'string') return text(a) + text(b);
            if (isDate(a) && !isDate(b)) return { d: a.d + num(b) };
            return num(a) + num(b);
          case '-': return isDate(a) && isDate(b) ? a.d - b.d : isDate(a) ? { d: a.d - num(b) } : num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(b) === 0 ? fail('Divided by zero') : num(a) / num(b);
          case '%': return num(b) === 0 ? fail('Divided by zero') : num(a) % num(b);
          case '^': return num(a) ** num(b);
          case '==': return same(a, b);
          case '!=': return !same(a, b);
          case '<': return cmp(a, b) < 0;
          case '>': return cmp(a, b) > 0;
          case '<=': return cmp(a, b) <= 0;
          default: return cmp(a, b) >= 0;
        }
      }
      case 'call': {
        const name = n.fn;
        if (name === 'prop') {
          const arg = go(n.args[0] ?? { n: 'lit', v: '' }, scope);
          return env.prop(text(arg));
        }
        if (name === 'if') {
          if (n.args.length < 2) fail('if() needs a condition and a value');
          return truthy(go(n.args[0], scope)) ? go(n.args[1], scope) : n.args[2] ? go(n.args[2], scope) : null;
        }
        if (name === 'ifs') {
          for (let i = 0; i + 1 < n.args.length; i += 2) if (truthy(go(n.args[i], scope))) return go(n.args[i + 1], scope);
          return n.args.length % 2 ? go(n.args[n.args.length - 1], scope) : null;
        }
        if (name === 'and') return n.args.every((a) => truthy(go(a, scope)));
        if (name === 'or') return n.args.some((a) => truthy(go(a, scope)));
        if (name === 'let') {
          // let(name, value, body)
          const label = n.args[0];
          if (!label || label.n !== 'id') fail('let() needs a name first');
          const inner = new Map(scope);
          inner.set((label as { v: string }).v, go(n.args[1] ?? { n: 'lit', v: null }, scope));
          return go(n.args[2] ?? { n: 'lit', v: null }, inner);
        }
        if (name === 'map' || name === 'filter' || name === 'some' || name === 'every') {
          const list = go(n.args[0] ?? { n: 'lit', v: [] }, scope);
          const body = n.args[1];
          if (!Array.isArray(list) || !body) return fail(`${name}() needs a list and a formula`);
          const each = (cur: FV, i: number) => {
            const inner = new Map(scope);
            inner.set('current', cur);
            inner.set('index', i);
            return go(body, inner);
          };
          if (name === 'map') return list.map(each);
          if (name === 'filter') return list.filter((x, i) => truthy(each(x, i)));
          if (name === 'some') return list.some((x, i) => truthy(each(x, i)));
          return list.every((x, i) => truthy(each(x, i)));
        }
        const fn = Object.hasOwn(FUNCS, name) ? FUNCS[name] : undefined;
        if (!fn) return fail(`Unknown function “${name}”`);
        return fn(n.args.map((a) => go(a, scope)), env);
      }
    }
  };
  return go(root, new Map([['current', null]]));
}

export type Result = { ok: true; value: FV } | { ok: false; error: string };

export function evaluate(src: string, env: Env): Result {
  if (!src.trim()) return { ok: true, value: null };
  try {
    return { ok: true, value: run(src, env) };
  } catch (err) {
    return { ok: false, error: err instanceof FormulaError ? err.message : 'The formula failed' };
  }
}

// Syntax only: null when the formula parses, else the reason.
export function check(src: string): string | null {
  if (!src.trim()) return null;
  try {
    parse(src);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Bad formula';
  }
}
