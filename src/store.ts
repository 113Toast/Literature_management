import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { ReferenceItem } from './utils/apaEngine';
import { getSupabaseClient, isSupabaseConfigured } from './utils/supabaseClient';

export interface MatrixColumn {
  key: string;
  label: string;
  isDefault?: boolean;
}

export interface ProjectMember {
  user_id: string;
  user_email?: string;
  user_name?: string;
  role: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  inviteCode?: string;
  ownerId?: string;
  isCloud?: boolean;
  members?: ProjectMember[];
}

export interface BackupPayload {
  app?: string;
  version?: number;
  exportedAt?: string;
  projects?: (ProjectItem | string)[];
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

function loadInitialProjects(): ProjectItem[] {
  const v2 = load<ProjectItem[] | null>('litlib.projects_v2', null);
  if (v2 && Array.isArray(v2) && v2.length > 0) return v2;

  // 相容舊版純字串專案名稱陣列
  const oldNames = load<string[]>('litlib.projects', ['預設專案']);
  const valid = oldNames.filter((n) => typeof n === 'string' && n.trim());
  if (!valid.length) return [{ id: '預設專案', name: '預設專案' }];
  return valid.map((name) => ({ id: name, name }));
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function useStore() {
  const [refs, setRefs] = useState<ReferenceItem[]>(() => load('litlib.refs', []));
  const [projects, setProjects] = useState<ProjectItem[]>(loadInitialProjects);
  const [matrixCols, setMatrixCols] = useState<MatrixColumn[]>(() =>
    load('litlib.matrixCols', DEFAULT_MATRIX_COLS)
  );

  // Supabase 帳號與同步狀態
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(() => isSupabaseConfigured());
  const [syncing, setSyncing] = useState<boolean>(false);

  useEffect(() => localStorage.setItem('litlib.refs', JSON.stringify(refs)), [refs]);
  useEffect(() => localStorage.setItem('litlib.projects_v2', JSON.stringify(projects)), [projects]);
  useEffect(() => localStorage.setItem('litlib.matrixCols', JSON.stringify(matrixCols)), [matrixCols]);

  // 從 Supabase 雲端拉取專案、成員與文獻
  const syncFromCloud = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;

    const { data: sessionData } = await sb.auth.getSession();
    const currentUser = sessionData.session?.user;
    if (!currentUser) return;

    setSyncing(true);
    try {
      const { data: projRows, error: projErr } = await sb
        .from('projects')
        .select('id, name, invite_code, owner_id, matrix_cols')
        .order('created_at', { ascending: true });

      if (projErr) throw projErr;
      if (!projRows) return;

      const projIds = projRows.map((p) => p.id);
      let memberRows: (ProjectMember & { project_id: string })[] = [];
      let refRows: { id: string; project_id: string; data: ReferenceItem }[] = [];

      if (projIds.length > 0) {
        const [memRes, refRes] = await Promise.all([
          sb
            .from('project_members')
            .select('project_id, user_id, user_email, user_name, role')
            .in('project_id', projIds),
          sb
            .from('lit_references')
            .select('id, project_id, data')
            .in('project_id', projIds),
        ]);

        if (memRes.data) memberRows = memRes.data;
        if (refRes.data) refRows = refRes.data;
      }

      const cloudProjects: ProjectItem[] = projRows.map((p) => ({
        id: p.id,
        name: p.name,
        inviteCode: p.invite_code,
        ownerId: p.owner_id,
        isCloud: true,
        members: memberRows.filter((m) => m.project_id === p.id),
      }));

      setProjects((prev) => {
        const localOnly = prev.filter((p) => !p.isCloud);
        const merged = [...cloudProjects, ...localOnly];
        return merged.length > 0 ? merged : [{ id: '預設專案', name: '預設專案' }];
      });

      const cloudProjIdSet = new Set(projIds);
      const cloudRefs: ReferenceItem[] = refRows.map((row) => ({
        ...row.data,
        id: row.id,
        projectId: row.project_id,
      }));

      setRefs((prev) => {
        const localOnlyRefs = prev.filter((r) => !cloudProjIdSet.has(r.projectId));
        return [...cloudRefs, ...localOnlyRefs];
      });
    } catch (err) {
      console.error('雲端同步失敗:', err);
    } finally {
      setSyncing(false);
    }
  }, []);

  // 監聽登入狀態與分頁切回自動同步
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) {
      setAuthLoading(false);
      return;
    }

    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
      if (data.session?.user) {
        syncFromCloud();
      }
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        syncFromCloud();
      }
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncFromCloud();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncFromCloud]);

  const signInWithGoogle = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('尚未設定 Supabase 連線資訊');
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    await sb.auth.signOut();
    setUser(null);
  }, []);

  // 將單機本機資料一鍵搬上雲端
  const pushLocalToCloud = useCallback(async (): Promise<number> => {
    const sb = getSupabaseClient();
    if (!sb || !user) throw new Error('請先登入 Google 帳號');

    const localProjects = projects.filter((p) => !p.isCloud);
    if (localProjects.length === 0) return 0;

    setSyncing(true);
    try {
      const idMap = new Map<string, string>();
      const userEmail = user.email || '';
      const userName =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        userEmail;

      for (const lp of localProjects) {
        const newProjId = crypto.randomUUID();
        const inviteCode = generateInviteCode();
        idMap.set(lp.id, newProjId);

        const { error: pErr } = await sb.from('projects').insert({
          id: newProjId,
          name: lp.name,
          invite_code: inviteCode,
          owner_id: user.id,
          matrix_cols: matrixCols,
        });
        if (pErr) throw pErr;

        const { error: mErr } = await sb.from('project_members').insert({
          project_id: newProjId,
          user_id: user.id,
          user_email: userEmail,
          user_name: userName,
          role: 'owner',
        });
        if (mErr) throw mErr;
      }

      const localRefsToUpload = refs.filter((r) => idMap.has(r.projectId));
      if (localRefsToUpload.length > 0) {
        const rows = localRefsToUpload.map((r) => {
          const targetProjId = idMap.get(r.projectId)!;
          const updatedItem: ReferenceItem = {
            ...r,
            projectId: targetProjId,
            updatedAt: new Date().toISOString(),
          };
          return {
            id: updatedItem.id,
            project_id: targetProjId,
            data: updatedItem,
            updated_at: updatedItem.updatedAt,
            updated_by: user.id,
          };
        });

        const { error: rErr } = await sb.from('lit_references').upsert(rows);
        if (rErr) throw rErr;
      }

      // 清除本機舊專案避免重複，重新從雲端載入
      setProjects((prev) => prev.filter((p) => p.isCloud));
      setRefs((prev) => prev.filter((r) => !idMap.has(r.projectId)));
      await syncFromCloud();
      return localRefsToUpload.length;
    } finally {
      setSyncing(false);
    }
  }, [user, projects, refs, matrixCols, syncFromCloud]);

  const upsertRefToCloud = useCallback(
    async (item: ReferenceItem) => {
      const sb = getSupabaseClient();
      if (!sb || !user) return;
      const proj = projects.find((p) => p.id === item.projectId);
      if (!proj?.isCloud) return;

      await sb.from('lit_references').upsert({
        id: item.id,
        project_id: item.projectId,
        data: item,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      });
    },
    [user, projects]
  );

  // 新增文獻（含同專案去重檢查）
  const add = useCallback(
    async (
      r: ReferenceItem,
      force = false
    ): Promise<{ ok: boolean; duplicate?: ReferenceItem }> => {
      if (!force) {
        const normDoi = r.doi?.trim().toLowerCase();
        const normTitle = r.title.trim().toLowerCase();
        const dup = refs.find((existing) => {
          if (existing.projectId !== r.projectId) return false;
          if (normDoi && existing.doi && existing.doi.trim().toLowerCase() === normDoi) {
            return true;
          }
          if (normTitle && existing.title.trim().toLowerCase() === normTitle) {
            return true;
          }
          return false;
        });
        if (dup) {
          return { ok: false, duplicate: dup };
        }
      }

      const itemWithTime: ReferenceItem = {
        ...r,
        updatedAt: new Date().toISOString(),
      };
      setRefs((p) => [itemWithTime, ...p]);
      await upsertRefToCloud(itemWithTime);
      return { ok: true };
    },
    [refs, upsertRefToCloud]
  );

  const update = useCallback(
    (id: string, patch: Partial<ReferenceItem>) => {
      setRefs((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const next: ReferenceItem = {
            ...r,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
          upsertRefToCloud(next);
          return next;
        })
      );
    },
    [upsertRefToCloud]
  );

  const updateMatrix = useCallback(
    (id: string, key: string, value: string) => {
      setRefs((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const next: ReferenceItem = {
            ...r,
            matrix: { ...(r.matrix || {}), [key]: value },
            updatedAt: new Date().toISOString(),
          };
          upsertRefToCloud(next);
          return next;
        })
      );
    },
    [upsertRefToCloud]
  );

  const remove = useCallback(
    (id: string) => {
      const target = refs.find((r) => r.id === id);
      setRefs((p) => p.filter((r) => r.id !== id));

      const sb = getSupabaseClient();
      if (sb && user && target) {
        const proj = projects.find((p) => p.id === target.projectId);
        if (proj?.isCloud) {
          sb.from('lit_references').delete().eq('id', id).then();
        }
      }
    },
    [refs, projects, user]
  );

  const addProject = useCallback(
    async (name: string): Promise<ProjectItem | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      const sb = getSupabaseClient();
      if (sb && user) {
        const id = crypto.randomUUID();
        const inviteCode = generateInviteCode();
        const userEmail = user.email || '';
        const userName =
          (user.user_metadata?.full_name as string) ||
          (user.user_metadata?.name as string) ||
          userEmail;

        const { error: pErr } = await sb.from('projects').insert({
          id,
          name: trimmed,
          invite_code: inviteCode,
          owner_id: user.id,
          matrix_cols: matrixCols,
        });
        if (pErr) throw new Error(`建立雲端專案失敗：${pErr.message}`);

        await sb.from('project_members').insert({
          project_id: id,
          user_id: user.id,
          user_email: userEmail,
          user_name: userName,
          role: 'owner',
        });

        const created: ProjectItem = {
          id,
          name: trimmed,
          inviteCode,
          ownerId: user.id,
          isCloud: true,
          members: [{ user_id: user.id, user_email: userEmail, user_name: userName, role: 'owner' }],
        };
        setProjects((p) => [...p, created]);
        return created;
      }

      // 單機模式建立專案
      const existing = projects.find((p) => p.name === trimmed);
      if (existing) return existing;
      const localProj: ProjectItem = { id: trimmed, name: trimmed, isCloud: false };
      setProjects((p) => [...p, localProj]);
      return localProj;
    },
    [user, projects, matrixCols]
  );

  const joinProjectByCode = useCallback(
    async (code: string): Promise<{ id: string; name: string }> => {
      const sb = getSupabaseClient();
      if (!sb || !user) throw new Error('請先登入 Google 帳號才能加入共編專案');

      const { data, error } = await sb.rpc('join_project_by_code', {
        p_code: code.trim().toUpperCase(),
      });
      if (error) throw new Error(error.message || '加入專案失敗');

      await syncFromCloud();
      return data as { id: string; name: string };
    },
    [user, syncFromCloud]
  );

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

      const parsedProjects: ProjectItem[] = Array.isArray(payload.projects)
        ? payload.projects
            .map((p): ProjectItem | null => {
              if (typeof p === 'string' && p.trim()) return { id: p.trim(), name: p.trim() };
              if (p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string') {
                return { id: p.id, name: p.name };
              }
              return null;
            })
            .filter((p): p is ProjectItem => p !== null)
        : [];

      const knownIds = new Set(parsedProjects.map((p) => p.id));
      for (const r of incomingRefs) {
        if (!knownIds.has(r.projectId)) {
          knownIds.add(r.projectId);
          parsedProjects.push({ id: r.projectId, name: r.projectId });
        }
      }
      if (parsedProjects.length === 0) {
        parsedProjects.push({ id: '預設專案', name: '預設專案' });
      }

      const incomingCols: MatrixColumn[] = Array.isArray(payload.matrixCols)
        ? payload.matrixCols.filter(
            (c): c is MatrixColumn =>
              Boolean(c) && typeof c.key === 'string' && typeof c.label === 'string'
          )
        : [];

      if (mode === 'overwrite') {
        setRefs(incomingRefs);
        setProjects(parsedProjects);
        if (incomingCols.length > 0) {
          setMatrixCols(incomingCols);
        }
        return { addedRefs: incomingRefs.length, totalRefs: incomingRefs.length };
      }

      const existingIds = new Set(refs.map((r) => r.id));
      const newRefs = incomingRefs.filter((r) => !existingIds.has(r.id));
      setRefs((prev) => [...newRefs, ...prev]);

      setProjects((prev) => {
        const prevIds = new Set(prev.map((p) => p.id));
        const extra = parsedProjects.filter((p) => !prevIds.has(p.id));
        return extra.length > 0 ? [...prev, ...extra] : prev;
      });

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
    user,
    authLoading,
    syncing,
    cloudReady: isSupabaseConfigured(),
    signInWithGoogle,
    signOut,
    syncFromCloud,
    pushLocalToCloud,
    add,
    update,
    updateMatrix,
    remove,
    addProject,
    joinProjectByCode,
    addMatrixCol,
    removeMatrixCol,
    resetMatrixCols,
    importBackup,
  };
}

export type Store = ReturnType<typeof useStore>;
