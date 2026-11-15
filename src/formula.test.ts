import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, dateOf, display, evaluate, type FV } from './formula.ts';

const NOW = Date.UTC(2026, 10, 3);
const env = (props: Record<string, FV> = {}) => ({
  now: () => NOW,
  prop: (name: string): FV => {
    if (!Object.hasOwn(props, name)) throw new Error(`Unknown property “${name}”`);
    return props[name];
  },
});
const val = (src: string, props: Record<string, FV> = {}): FV => {
  const r = evaluate(src, env(props));
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.value;
};

test('arithmetic follows the usual order and ^ binds tighter than *', () => {
  assert.equal(val('1 + 2 * 3'), 7);
  assert.equal(val('(1 + 2) * 3'), 9);
  assert.equal(val('2 * 3 ^ 2'), 18);
  assert.equal(val('-4 + 10 % 4'), -2);
});

test('strings join with + and compare with ==', () => {
  assert.equal(val('"a" + "b" + 1'), 'ab1');
  assert.equal(val('"a" == "a"'), true);
  assert.equal(val('"a" != "b"'), true);
});

test('prop() reads a property of the row', () => {
  assert.equal(val('prop("Price") * prop("Qty")', { Price: 4, Qty: 3 }), 12);
  const r = evaluate('prop("Nope")', env());
  assert.equal(r.ok, false);
});

test('if, ifs, and, or, not, and the ternary all choose lazily', () => {
  assert.equal(val('if(true, "y", "n")'), 'y');
  assert.equal(val('if(false, 1/0, 2)'), 2);
  assert.equal(val('ifs(1 > 2, "a", 2 > 1, "b", "c")'), 'b');
  assert.equal(val('true and not false'), true);
  assert.equal(val('false or 1 > 0'), true);
  assert.equal(val('1 > 2 ? "a" : "b"'), 'b');
});

test('text functions', () => {
  assert.equal(val('upper("ab") + lower("CD")'), 'ABcd');
  assert.equal(val('"hello".slice(1, 3)'), 'el');
  assert.equal(val('replaceAll("a-b-c", "-", "+")'), 'a+b+c');
  assert.equal(val('contains("Hello", "ell")'), true);
  assert.equal(val('length("four")'), 4);
  assert.equal(val('["a", "b"].join("-")'), 'a-b');
});

test('number functions', () => {
  assert.equal(val('round(2.567, 1)'), 2.6);
  assert.equal(val('max(1, 5, 3) - min(4, 2)'), 3);
  assert.equal(val('sum([1, 2, 3])'), 6);
  assert.equal(val('median([5, 1, 3])'), 3);
  assert.equal(val('sqrt(16) + pow(2, 3)'), 12);
});

test('dates: add, subtract, between, format', () => {
  assert.deepEqual(val('today()'), { d: NOW });
  assert.equal(val('dateBetween(dateAdd(today(), 3, "days"), today(), "days")'), 3);
  assert.equal(val('formatDate(today(), "YYYY-MM-DD")'), '2026-11-03');
  assert.equal(val('formatDate(dateAdd(today(), 1, "months"), "MMM D")'), 'Dec 3');
  assert.equal(val('month(prop("D"))', { D: dateOf('2026-02-14') }), 2);
});

test('map, filter, let and the list helpers', () => {
  assert.deepEqual(val('[1, 2, 3].map(current * 2)'), [2, 4, 6]);
  assert.deepEqual(val('[1, 2, 3, 4].filter(current % 2 == 0)'), [2, 4]);
  assert.equal(val('let(x, 5, x * x)'), 25);
  assert.equal(val('last([1, 2, 9])'), 9);
});

test('mistakes come back as an error value, never an exception', () => {
  for (const src of ['1 +', 'foo(1)', '"open', '1 / 0', '(((', 'prop(', 'x']) {
    const r = evaluate(src, env());
    assert.equal(r.ok, false, src);
  }
  assert.notEqual(check('1 +'), null);
  assert.equal(check('1 + 1'), null);
});

test('there is no way to reach code: names are not looked up on any object', () => {
  for (const src of ['constructor', 'toString(1)', '__proto__', 'prop("constructor")', 'process']) {
    assert.equal(evaluate(src, env()).ok, false, src);
  }
});

test('a deeply nested or huge formula is refused', () => {
  assert.equal(evaluate('('.repeat(200) + '1' + ')'.repeat(200), env()).ok, false);
  assert.equal(evaluate('1+'.repeat(5000) + '1', env()).ok, false);
});

test('display writes numbers and dates for people', () => {
  assert.equal(display(1.5), '1.5');
  assert.equal(display(null), '');
  assert.equal(display({ d: NOW }), 'Nov 3, 2026');
  assert.equal(display([1, 'a']), '1, a');
});
