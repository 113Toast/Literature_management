import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Upload } from 'lucide-react';
import type { BackupPayload, Store } from '../store';

export default function Settings({ store }: { store: Store }) {
  // Gemini API Key 狀態
  const [key, setKey] = useState(() => localStorage.getItem('litlib.geminiKey') || '');
  const [saved, setSaved] = useState(false);

  // JSON 備份與還原狀態
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [backupMsg, setBackupMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function handleExportJson() {
    const payload: BackupPayload = {
      app: 'Literature_management',
      version: 1,
      exportedAt: new Date().toISOString(),
      projects: store.projects,
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
    e.target.value = ''; // 清空選擇，允許重複選同一個檔案
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
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">設定</h2>

      {/* 區塊 1：Gemini API Key */}
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
          {saved && <span className="text-sm text-green-700 dark:text-green-400">已儲存</span>}
        </div>
      </section>

      {/* 區塊 2：資料備份與還原（JSON） */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-4">
        <div>
          <h3 className="text-base font-semibold">資料備份與跨裝置搬移（JSON）</h3>
          <p className="mt-1 text-xs opacity-70 leading-relaxed">
            目前資料儲存在這台瀏覽器中（共 <strong>{store.projects.length}</strong> 個專案、
            <strong>{store.refs.length}</strong> 筆文獻）。定期匯出 JSON 備份檔存到雲端硬碟，即可防止清除瀏覽器資料時遺失，也能匯入到手機或平板。
          </p>
        </div>

        {/* 匯出備份 */}
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

        {/* 匯入還原 */}
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
