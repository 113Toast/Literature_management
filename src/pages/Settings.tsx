import { useState } from 'react';

export default function Settings() {
  const [key, setKey] = useState(() => localStorage.getItem('litlib.geminiKey') || '');
  const [saved, setSaved] = useState(false);
  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">設定</h2>
      <label className="text-sm">Gemini API Key（只存在這台裝置的 localStorage）
        <input type="password" className="mt-1 w-full rounded border border-black/20 bg-transparent px-2 py-1.5" value={key} onChange={(e) => { setKey(e.target.value); setSaved(false); }} />
      </label>
      <button className="mt-3 rounded bg-[#1f3a5f] text-white px-4 py-1.5 text-sm" onClick={() => { localStorage.setItem('litlib.geminiKey', key.trim()); setSaved(true); }}>儲存金鑰</button>
      {saved && <span className="ml-3 text-sm text-green-700">已儲存</span>}
    </div>
  );
}
