import { useCallback, useEffect, useState } from 'react';
import type { ReferenceItem } from './utils/apaEngine';

export interface MatrixColumn {
  key: string;
  label: string;
  isDefault?: boolean;
}

export const DEFAULT_MATRIX_COLS: MatrixColumn[] = [
  { key: 'target', label: '研究對象', isDefault: true },
  { key: 'sampleSize', label: '樣本數', isDefault: true },
  { key: 'method', label: '研究方法', isDefault: true },
  { key: 'findings', label: '核心結果', isDefault: true },
  { key: 'limitations', label: '研究限制', isDefault: true },
];

function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
}

export function useStore() {
  const [refs, setRefs] = useState<ReferenceItem[]>(() => load('litlib.refs', []));
  const [projects, setProjects] = useState<string[]>(() => load('litlib.projects', ['預設專案']));
  const [matrixCols, setMatrixCols] = useState<MatrixColumn[]>(() =>
    load('litlib.matrixCols', DEFAULT_MATRIX_COLS)
  );

  useEffect(() => localStorage.setItem('litlib.refs', JSON.stringify(refs)), [refs]);
  useEffect(() => localStorage.setItem('litlib.projects', JSON.stringify(projects)), [projects]);
  useEffect(() => localStorage.setItem('litlib.matrixCols', JSON.stringify(matrixCols)), [matrixCols]);

  const add = useCallback((r: ReferenceItem) => {
    setRefs((p) => [r, ...p]);
  }, []);

  const update = useCallback((id: string, patch: Partial<ReferenceItem>) => {
    setRefs((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const updateMatrix = useCallback((id: string, key: string, value: string) => {
    setRefs((p) =>
      p.map((r) =>
        r.id === id ? { ...r, matrix: { ...(r.matrix || {}), [key]: value } } : r
      )
    );
  }, []);

  const remove = useCallback((id: string) => {
    setRefs((p) => p.filter((r) => r.id !== id));
  }, []);

  const addProject = useCallback((n: string) => {
    if (n) {
      setProjects((p) => (p.includes(n) ? p : [...p, n]));
    }
  }, []);

  const addMatrixCol = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = `col_${Date.now()}`;
    setMatrixCols((p) => [...p, { key, label: trimmed }]);
  }, []);

  const removeMatrixCol = useCallback((key: string) => {
    setMatrixCols((p) => (p.length > 1 ? p.filter((c) => c.key !== key) : p));
  }, []);

  const resetMatrixCols = useCallback(() => {
    setMatrixCols(DEFAULT_MATRIX_COLS);
  }, []);

  return {
    refs,
    projects,
    matrixCols,
    add,
    update,
    updateMatrix,
    remove,
    addProject,
    addMatrixCol,
    removeMatrixCol,
    resetMatrixCols,
  };
}

export type Store = ReturnType<typeof useStore>;
