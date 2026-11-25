import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { BookMarked, ListChecks, Plus, Settings as Cog } from 'lucide-react';
import { useStore } from './store';
import Library from './pages/Library';
import Checker from './pages/Checker';
import Settings from './pages/Settings';

export default function App() {
  const store = useStore();
  const [pid, setPid] = useState(store.projects[0]);
  const items = [
    { to: '/', icon: BookMarked, label: '文獻庫' },
    { to: '/check', icon: ListChecks, label: '核對器' },
    { to: '/add', icon: Plus, label: '快速新增' },
    { to: '/settings', icon: Cog, label: '設定' },
  ];
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 rounded-md text-xs md:text-sm ${isActive ? 'bg-[#1f3a5f] text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`;
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex md:w-56 shrink-0 flex-col gap-1 border-r border-black/10 dark:border-white/10 p-3">
        <h1 className="px-3 py-2 text-lg font-semibold">文獻庫</h1>
        {items.map((i) => <NavLink key={i.to} to={i.to} end className={link}><i.icon size={16} />{i.label}</NavLink>)}
        <div className="mt-4 px-3 text-xs opacity-60">專案</div>
        {store.projects.map((p) => (
          <button key={p} onClick={() => setPid(p)} className={`text-left px-3 py-1.5 rounded-md text-sm ${p === pid ? 'font-semibold underline underline-offset-4' : 'opacity-80'}`}>{p}</button>
        ))}
        <button className="text-left px-3 py-1.5 text-sm opacity-60" onClick={() => { const n = prompt('新專案名稱'); if (n) { store.addProject(n); setPid(n); } }}>＋ 新增專案</button>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-8 pb-24 md:pb-8 max-w-4xl">
        <select className="md:hidden mb-3 rounded border border-black/20 bg-transparent p-1 text-sm" value={pid} onChange={(e) => setPid(e.target.value)}>
          {store.projects.map((p) => <option key={p}>{p}</option>)}
        </select>
        <Routes>
          <Route path="/" element={<Library store={store} pid={pid} />} />
          <Route path="/add" element={<Library store={store} pid={pid} adding />} />
          <Route path="/check" element={<Checker store={store} pid={pid} />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 flex justify-around border-t border-black/10 bg-[#f6f5f1] dark:bg-[#14181d] pb-[env(safe-area-inset-bottom)]">
        {items.map((i) => <NavLink key={i.to} to={i.to} end className={link}><i.icon size={20} />{i.label}</NavLink>)}
      </nav>
    </div>
  );
}
