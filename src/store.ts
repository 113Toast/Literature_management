import { useEffect, useState } from 'react';
import type { ReferenceItem } from './utils/apaEngine';

function load<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
}
export function useStore() {
  const [refs, setRefs] = useState<ReferenceItem[]>(() => load('litlib.refs', []));
  const [projects, setProjects] = useState<string[]>(() => load('litlib.projects', ['預設專案']));
  useEffect(() => localStorage.setItem('litlib.refs', JSON.stringify(refs)), [refs]);
  useEffect(() => localStorage.setItem('litlib.projects', JSON.stringify(projects)), [projects]);
  return {
    refs, projects,
    add: (r: ReferenceItem) => setRefs((p) => [r, ...p]),
    update: (id: string, patch: Partial<ReferenceItem>) => setRefs((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    remove: (id: string) => setRefs((p) => p.filter((r) => r.id !== id)),
    addProject: (n: string) => { if (n && !projects.includes(n)) setProjects([...projects, n]); },
  };
}
export type Store = ReturnType<typeof useStore>;
