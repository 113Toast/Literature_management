import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import {
  BookMarked,
  Cloud,
  HelpCircle,
  KeyRound,
  ListChecks,
  LogIn,
  Plus,
  Settings as Cog,
} from 'lucide-react';
import { useStore } from './store';
import Library from './pages/Library';
import Checker from './pages/Checker';
import Guide from './pages/Guide';
import Settings from './pages/Settings';

export default function App() {
  const store = useStore();
  const [pid, setPid] = useState(store.projects[0]?.id || '預設專案');

  useEffect(() => {
    const exists = store.projects.some((p) => p.id === pid);
    if (!exists && store.projects.length > 0) {
      setPid(store.projects[0].id);
    }
  }, [store.projects, pid]);

  const items = [
    { to: '/', icon: BookMarked, label: '文獻庫' },
    { to: '/check', icon: ListChecks, label: '核對器' },
    { to: '/add', icon: Plus, label: '快速新增' },
    { to: '/guide', icon: HelpCircle, label: '使用說明' },
    { to: '/settings', icon: Cog, label: '設定' },
  ];

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col md:flex-row items-center gap-0.5 md:gap-3 px-2 md:px-3 py-2 rounded-md text-[11px] md:text-sm ${
      isActive
        ? 'bg-[#1f3a5f] text-white'
        : 'hover:bg-black/5 dark:hover:bg-white/10'
    }`;

  async function handleCreateProject() {
    const n = prompt('新專案名稱');
    if (!n?.trim()) return;
    try {
      const created = await store.addProject(n);
      if (created) setPid(created.id);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleJoinByCode() {
    if (!store.user) {
      alert('請先登入 Google 帳號，再輸入組長的 6 碼邀請碼加入共編專案。');
      return;
    }
    const code = prompt('請輸入 6 碼專案邀請碼（例如：A8K92P）');
    if (!code?.trim()) return;
    try {
      const joined = await store.joinProjectByCode(code);
      setPid(joined.id);
      alert(`已成功加入共編專案：「${joined.name}」`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen md:flex">
      {/* 電腦版左側邊欄 */}
      <aside className="hidden md:flex md:w-60 shrink-0 flex-col gap-1 border-r border-black/10 dark:border-white/10 p-3">
        <div className="flex items-center justify-between px-3 py-2">
          <h1 className="text-lg font-semibold">文獻庫</h1>
          {store.user ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] text-green-800 dark:text-green-300"
              title={store.user.email || '已連線雲端'}
            >
              <Cloud size={11} />
              雲端中
            </span>
          ) : (
            store.cloudReady && (
              <button
                onClick={() => store.signInWithGoogle().catch((e) => alert((e as Error).message))}
                className="inline-flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2 py-0.5 text-xs hover:bg-black/5 dark:hover:bg-white/10"
              >
                <LogIn size={11} />
                登入
              </button>
            )
          )}
        </div>

        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end className={link}>
            <i.icon size={16} />
            {i.label}
          </NavLink>
        ))}

        <div className="mt-4 px-3 text-xs opacity-60">專案</div>
        <div className="space-y-0.5 max-h-60 overflow-y-auto">
          {store.projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setPid(p.id)}
              className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-md text-sm ${
                p.id === pid
                  ? 'font-semibold underline underline-offset-4'
                  : 'opacity-80 hover:opacity-100'
              }`}
            >
              <span className="truncate">{p.name}</span>
              {p.isCloud && <Cloud size={12} className="shrink-0 opacity-50" />}
            </button>
          ))}
        </div>

        <button
          className="text-left px-3 py-1.5 text-sm opacity-70 hover:opacity-100"
          onClick={handleCreateProject}
        >
          ＋ 新增專案
        </button>

        {store.cloudReady && (
          <button
            className="flex items-center gap-1.5 text-left px-3 py-1.5 text-xs opacity-70 hover:opacity-100"
            onClick={handleJoinByCode}
          >
            <KeyRound size={12} />
            輸入邀請碼加入
          </button>
        )}
      </aside>

      {/* 主要內容區 */}
      <main className="flex-1 min-w-0 p-4 md:p-8 pb-24 md:pb-8 max-w-4xl">
        {/* 手機版頂部專案與登入列 */}
        <div className="md:hidden mb-3 flex flex-wrap items-center gap-2">
          <select
            className="flex-1 min-w-[140px] rounded border border-black/20 dark:border-white/20 bg-transparent p-1.5 text-sm"
            value={pid}
            onChange={(e) => setPid(e.target.value)}
          >
            {store.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCreateProject}
            className="rounded border border-black/20 dark:border-white/20 px-2.5 py-1.5 text-xs"
          >
            ＋專案
          </button>
          {store.cloudReady && (
            <button
              type="button"
              onClick={handleJoinByCode}
              className="rounded border border-black/20 dark:border-white/20 px-2.5 py-1.5 text-xs"
              title="輸入邀請碼加入共編專案"
            >
              邀請碼
            </button>
          )}
        </div>

        <Routes>
          <Route path="/" element={<Library store={store} pid={pid} />} />
          <Route path="/add" element={<Library store={store} pid={pid} adding />} />
          <Route path="/check" element={<Checker store={store} pid={pid} />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/settings" element={<Settings store={store} />} />
        </Routes>
      </main>

      {/* 手機版底部導覽列 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 flex justify-around border-t border-black/10 dark:border-white/10 bg-[#f6f5f1] dark:bg-[#14181d] pb-[env(safe-area-inset-bottom)]">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end className={link}>
            <i.icon size={19} />
            {i.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
