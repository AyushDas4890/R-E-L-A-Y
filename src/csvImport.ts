// Turns the text of a CSV file into the starting columns and rows of a database.
import { parseCsv } from './dbquery.ts';
import type { Property, PropValue } from './types.ts';

export interface CsvPlan {
  // Extra columns after the title column, with the type guessed from what they hold.
  props: (Partial<Property> & { name: string; type: Property['type'] })[];
  // One object per data row, keyed by property name (the first column is keyed `Name`).
  rows: Record<string, PropValue>[];
  skipped: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const MAX_ROWS = 500;
const MAX_COLS = 50;

export function planCsv(text: string): CsvPlan | null {
  const table = parseCsv(text);
  if (table.length < 1 || table[0].length === 0) return null;
  const head = table[0].slice(0, MAX_COLS).map((h, i) => h.trim() || `Column ${i + 1}`);
  const body = table.slice(1, MAX_ROWS + 1);
  const skipped = Math.max(0, table.length - 1 - MAX_ROWS);
  // Names must be unique; the first column becomes the title (`Name`).
  const names: string[] = [];
  head.forEach((h, i) => {
    let n = i === 0 ? 'Name' : h === 'Name' ? 'Name 2' : h;
    while (names.includes(n)) n = `${n} 2`;
    names.push(n);
  });

  const props: CsvPlan['props'] = [];
  for (let c = 1; c < head.length; c++) {
    const values = body.map((r) => (r[c] ?? '').trim()).filter((v) => v !== '');
    const unique = [...new Set(values)];
    let prop: CsvPlan['props'][number] = { name: names[c], type: 'text' };
    if (values.length && values.every((v) => /^-?[\d,]*\.?\d+$/.test(v))) prop = { name: names[c], type: 'number' };
    else if (values.length && values.every((v) => /^(true|false|yes|no)$/i.test(v))) prop = { name: names[c], type: 'checkbox' };
    else if (values.length && values.every((v) => ISO.test(v))) prop = { name: names[c], type: 'date' };
    else if (values.length >= 4 && unique.length <= 8 && unique.length < values.length / 2 && unique.every((v) => v.length <= 40))
      prop = { name: names[c], type: 'select', options: unique.map((v, i) => ({ id: crypto.randomUUID(), name: v, color: ['gray', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'red'][i % 8] })) };
    props.push(prop);
  }

  const rows = body.map((r) => {
    const row: Record<string, PropValue> = { Name: (r[0] ?? '').trim().slice(0, 200) };
    props.forEach((p, i) => {
      const raw = (r[i + 1] ?? '').trim();
      if (!raw) return;
      if (p.type === 'number') row[p.name] = Number(raw.replace(/,/g, ''));
      else if (p.type === 'checkbox') row[p.name] = /^(true|yes)$/i.test(raw);
      else if (p.type === 'date') row[p.name] = { start: raw };
      else if (p.type === 'select') row[p.name] = p.options?.find((o) => o.name === raw)?.id ?? null;
      else row[p.name] = raw.slice(0, 2000);
    });
    return row;
  });
  return { props, rows, skipped };
}
