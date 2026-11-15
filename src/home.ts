// Small pure helpers for the Home page.

export function greeting(hour: number, name: string): string {
  const part = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = name.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

// "2 of 5 done" for a to-do list; empty when it has no tasks.
export function progress(tasks: { done: boolean }[]): string {
  return tasks.length ? `${tasks.filter((t) => t.done).length} of ${tasks.length} done` : '';
}
