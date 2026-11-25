import { useCallback, useEffect, useState } from 'react';
import type { ReferenceItem } from './utils/apaEngine';

export interface MatrixColumn {
  key: string;
  label: string;
  isDefault?: boolean;
}

export interface BackupPayload {
  app?: string;
  version?: number;
  exportedAt?: string;
  projects?: string[];
  matrixCols?: MatrixColumn[];
  refs?: ReferenceItem[];
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

  const importBackup = useCallback(
    (payload: BackupPayload, mode: 'merge' | 'overwrite'): { addedRefs: number; totalRefs: number } => {
      if (!payload || !Array.isArray(payload.refs)) {
        throw new Error('檔案格式不正確，找不到文獻資料（refs）');
      }

      const incomingRefs: ReferenceItem[] = payload.refs
        .filter((item) => item && typeof item.title === 'string' && item.title.trim())
        .map((item) => ({
          ...item,
          id: item.id || crypto.randomUUID(),
          projectId: item.projectId?.trim() || '預設專案',
          type: item.type || 'journal',
          title: item.title.trim(),
          authors: Array.isArray(item.authors) ? item.authors : [],
          year: item.year ? String(item.year) : '',
          status: item.status || 'unread',
          stanceTags: Array.isArray(item.stanceTags) ? item.stanceTags : [],
          matrix: item.matrix && typeof item.matrix === 'object' ? item.matrix : {},
          createdAt: item.createdAt || new Date().toISOString(),
        }));

      const rawProjects = Array.isArray(payload.projects)
        ? payload.projects.filter((p): p is string => typeof p === 'string' && Boolean(p.trim()))
        : [];
      const refProjects = incomingRefs.map((r) => r.projectId);
      const incomingProjects = Array.from(new Set([...rawProjects, ...refProjects]));
      if (incomingProjects.length === 0) incomingProjects.push('預設專案');

      const incomingCols: MatrixColumn[] = Array.isArray(payload.matrixCols)
        ? payload.matrixCols.filter(
            (c): c is MatrixColumn =>
              Boolean(c) && typeof c.key === 'string' && typeof c.label === 'string'
          )
        : [];

      if (mode === 'overwrite') {
        setRefs(incomingRefs);
        setProjects(incomingProjects);
        if (incomingCols.length > 0) {
          setMatrixCols(incomingCols);
        }
        return { addedRefs: incomingRefs.length, totalRefs: incomingRefs.length };
      }

      // 合併模式：保留現有資料，僅加入不重複的新文獻、新專案與新欄位
      const existingIds = new Set(refs.map((r) => r.id));
      const newRefs = incomingRefs.filter((r) => !existingIds.has(r.id));
      setRefs((prev) => [...newRefs, ...prev]);

      setProjects((prev) => Array.from(new Set([...prev, ...incomingProjects])));

      if (incomingCols.length > 0) {
        setMatrixCols((prev) => {
          const existingKeys = new Set(prev.map((c) => c.key));
          const extraCols = incomingCols.filter((c) => !existingKeys.has(c.key));
          return extraCols.length > 0 ? [...prev, ...extraCols] : prev;
        });
      }

      return { addedRefs: newRefs.length, totalRefs: refs.length + newRefs.length };
    },
    [refs]
  );

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
    importBackup,
  };
}

export type Store = ReturnType<typeof useStore>;
