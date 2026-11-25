import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Chrome,
  Cloud,
  Copy,
  Download,
  LogIn,
  LogOut,
  Upload,
} from 'lucide-react';
import type { BackupPayload, Store } from '../store';
import {
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfig,
} from '../utils/supabaseClient';

export default function Settings({ store }: { store: Store }) {
  // Supabase 連線與擴充功能連線碼狀態
  const initialSb = getSupabaseConfig();
  const [sbUrl, setSbUrl] = useState(initialSb.url);
  const [sbKey, setSbKey] = useState(initialSb.anonKey);
  const [showSbConfig, setShowSbConfig] = useState(!store.cloudReady);
  const [cloudMsg, setCloudMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Gemini API Key 狀態
  const [key, setKey] = useState(() => localStorage.getItem('litlib.geminiKey') || '');
  const [saved, setSaved] = useState(false);

  // JSON 備份與還原狀態
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [backupMsg, setBackupMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const localProjectsCount = store.projects.filter((p) => !p.isCloud).length;

  async function handleCopyExtensionToken() {
    setCloudMsg(null);
    const sb = getSupabaseClient();
    const { url, anonKey } = getSupabaseConfig();
    if (!sb || !url || !anonKey) {
      setCloudMsg({ type: 'err', text: '尚未設定 Supabase 連線資訊' });
      return;
    }

    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session || !session.refresh_token) {
      setCloudMsg({ type: 'err', text: '請先登入 Google 帳號後再複製連線碼' });
      return;
    }

    const tokenPayload = JSON.stringify({
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
      refreshToken: session.refresh_token,
      userId: session.user.id,
      email: session.user.email || '',
    });

    await navigator.clipboard.writeText(tokenPayload);
    setCloudMsg({
      type: 'ok',
      text: '已複製 Chrome 擴充功能連線碼！請打開瀏覽器右上角「文獻庫助手」→「雲端連線設定」貼上即可。',
    });
  }

  async function handlePushLocal() {
    setCloudMsg(null);
    try {
      const movedCount = await store.pushLocalToCloud();
      setCloudMsg({
        type: 'ok',
        text: `已成功將本機專案與 ${movedCount} 筆文獻同步至雲端！`,
      });
    } catch (err) {
      setCloudMsg({ type: 'err', text: (err as Error).message });
    }
  }

  function handleExportJson() {
    const payload: BackupPayload = {
      app: 'Literature_management',
      version: 2,
      exportedAt: new Date().toISOString(),
      projects: store.projects.map((p) => ({ id: p.id, name: p.name })),
      matrixCols: store.matrixCols,
      refs: store.refs,
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const today = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `literature-backup-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setBackupMsg({
      type: 'ok',
      text: `已下載備份檔（共 ${store.projects.length} 個專案、${store.refs.length} 筆文獻）`,
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBackupMsg(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;

      if (importMode === 'overwrite') {
        const ok = confirm(
          `確定要用「${file.name}」完全覆蓋目前這台裝置的所有文獻嗎？\n目前現有的 ${store.refs.length} 筆文獻將會被取代，建議先匯出備份再執行。`
        );
        if (!ok) return;
      }

      const result = store.importBackup(parsed, importMode);
      setBackupMsg({
        type: 'ok',
        text:
          importMode === 'merge'
            ? `合併匯入完成！新增了 ${result.addedRefs} 筆文獻（目前共 ${result.totalRefs} 筆）`
            : `已完整還原備份檔，目前共 ${result.totalRefs} 筆文獻`,
      });
    } catch (err) {
      setBackupMsg({
        type: 'err',
        text: `匯入失敗：${(err as Error).message || '請確認選擇的是正確的 JSON 備份檔'}`,
      });
    }
  }

  return (
    <div className="space-y-8 pb-8">
      <h2 className="text-xl font-semibold">設定</h2>

      {/* 區塊 1：雲端同步、小組共編與 Chrome 擴充功能 */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Cloud size={17} />
            雲端同步與 Chrome 擴充功能連線
          </h3>
          <button
            type="button"
            onClick={() => setShowSbConfig(!showSbConfig)}
            className="text-xs underline opacity-70 hover:opacity-100"
          >
            {showSbConfig ? '收合連線設定' : '伺服器設定'}
          </button>
        </div>

        {store.user ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-green-500/10 px-3 py-2 text-xs text-green-900 dark:text-green-200">
              <span>
                已登入雲端帳號：<strong>{store.user.email}</strong>
              </span>
              <button
                type="button"
                onClick={() => store.signOut()}
                className="inline-flex items-center gap-1 rounded border border-current px-2 py-0.5"
              >
                <LogOut size={12} />
                登出
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyExtensionToken}
                className="inline-flex items-center gap-1.5 rounded bg-[#1f3a5f] text-white px-3.5 py-2 text-xs font-medium"
              >
                <Chrome size={14} />
                複製 Chrome 擴充功能連線碼
              </button>

              {localProjectsCount > 0 && (
                <button
                  type="button"
                  disabled={store.syncing}
                  onClick={handlePushLocal}
                  className="inline-flex items-center gap-1.5 rounded border border-black/25 dark:border-white/25 px-3.5 py-2 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Upload size={14} />
                  將本機 {localProjectsCount} 個單機專案搬上雲端
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs opacity-75 leading-relaxed">
              登入 Google 帳號後，即可跨手機、平板、電腦即時同步文獻，並透過「6 碼邀請碼」與組員共編專案、連接 Chrome 瀏覽器擴充功能。
            </p>
            <button
              type="button"
              disabled={!store.cloudReady}
              onClick={async () => {
                try {
                  await store.signInWithGoogle();
                } catch (e) {
                  setCloudMsg({ type: 'err', text: (e as Error).message });
                }
              }}
              className="inline-flex items-center gap-2 rounded bg-[#1f3a5f] text-white px-4 py-2 text-sm disabled:opacity-45"
            >
              <LogIn size={15} />
              使用 Google 帳號登入
            </button>
          </div>
        )}

        {/* Supabase URL & Anon Key 設定區 */}
        {showSbConfig && (
          <div className="border-t border-black/10 dark:border-white/10 pt-3 space-y-2.5 text-xs">
            <p className="opacity-75">
              填入 Supabase 專案的 <strong>Project URL</strong> 與 <strong>anon public</strong> 金鑰並儲存（若已寫在程式碼中則會自動帶入）：
            </p>
            <label className="block">
              Project URL
              <input
                type="text"
                className="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2.5 py-1.5"
                placeholder="https://xxxxxxxxxxxx.supabase.co"
                value={sbUrl}
                onChange={(e) => setSbUrl(e.target.value)}
              />
            </label>
            <label className="block">
              Anon Public Key
              <input
                type="password"
                className="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2.5 py-1.5"
                placeholder="eyJhbGci..."
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                saveSupabaseConfig(sbUrl, sbKey);
                setCloudMsg({
                  type: 'ok',
                  text: '已儲存 Supabase 設定，正在重新載入連線...',
                });
                setTimeout(() => window.location.reload(), 600);
              }}
              className="rounded border border-black/25 dark:border-white/25 px-3 py-1.5 font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              儲存伺服器設定
            </button>
          </div>
        )}

        {cloudMsg && (
          <div
            className={`flex items-start gap-2 rounded-md p-2.5 text-xs ${
              cloudMsg.type === 'ok'
                ? 'bg-green-500/10 text-green-800 dark:text-green-300'
                : 'bg-red-500/10 text-red-700 dark:text-red-300'
            }`}
          >
            {cloudMsg.type === 'ok' ? (
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
            )}
            <span>{cloudMsg.text}</span>
          </div>
        )}
      </section>

      {/* 區塊 2：Gemini API Key */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-3">
        <h3 className="text-base font-semibold">AI 摘要自動填表金鑰</h3>
        <label className="block text-sm">
          Gemini API Key（只存在這台裝置的瀏覽器中，匯出備份時不會包含此金鑰）
          <input
            type="password"
            className="mt-1.5 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2.5 py-1.5 text-sm"
            placeholder="AIzaSy..."
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            className="rounded bg-[#1f3a5f] text-white px-4 py-1.5 text-sm"
            onClick={() => {
              localStorage.setItem('litlib.geminiKey', key.trim());
              setSaved(true);
            }}
          >
            儲存金鑰
          </button>
          {saved && (
            <span className="text-sm text-green-700 dark:text-green-400">
              已儲存
            </span>
          )}
        </div>
      </section>

      {/* 區塊 3：資料備份與還原（JSON） */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-4">
        <div>
          <h3 className="text-base font-semibold">資料備份與離線匯出（JSON）</h3>
          <p className="mt-1 text-xs opacity-70 leading-relaxed">
            目前共有 <strong>{store.projects.length}</strong> 個專案、
            <strong>{store.refs.length}</strong> 筆文獻。定期匯出 JSON 備份檔存到雲端硬碟，可防止資料遺失或離線分享。
          </p>
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-2 rounded bg-[#1f3a5f] text-white px-4 py-2 text-sm"
          >
            <Download size={15} />
            匯出全部資料（下載 JSON 備份）
          </button>
        </div>

        <div className="border-t border-black/10 dark:border-white/10 pt-4 space-y-3">
          <div className="text-sm font-medium">從備份檔匯入</div>

          <div className="space-y-2 text-xs">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="importMode"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
                className="mt-0.5"
              />
              <span>
                <strong>合併匯入（推薦）：</strong>保留這台裝置現有的文獻，只加入備份檔裡沒有的新文獻與新專案。
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="importMode"
                checked={importMode === 'overwrite'}
                onChange={() => setImportMode('overwrite')}
                className="mt-0.5"
              />
              <span>
                <strong>完全覆蓋還原：</strong>清空目前瀏覽器的資料，完整替換成備份檔的內容。
              </span>
            </label>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded border border-black/25 dark:border-white/25 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            <Upload size={15} />
            選擇 JSON 備份檔並匯入
          </button>
        </div>

        {backupMsg && (
          <div
            className={`flex items-start gap-2 rounded-md p-2.5 text-xs ${
              backupMsg.type === 'ok'
                ? 'bg-green-500/10 text-green-800 dark:text-green-300'
                : 'bg-red-500/10 text-red-700 dark:text-red-300'
            }`}
          >
            {backupMsg.type === 'ok' ? (
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
            )}
            <span>{backupMsg.text}</span>
          </div>
        )}
      </section>
    </div>
  );
}
