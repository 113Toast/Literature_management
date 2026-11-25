import { useEffect, useState } from 'react';
import { FileText, Plus, RotateCcw, Settings2, X } from 'lucide-react';
import type { Store } from '../store';
import { formatInTextCitation, type ReferenceItem } from '../utils/apaEngine';

function MatrixCell({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [val, setVal] = useState(value);

  useEffect(() => {
    setVal(value);
  }, [value]);

  useEffect(() => {
    if (val === value) return;
    const timer = setTimeout(() => onSave(val), 500);
    return () => clearTimeout(timer);
  }, [val, value, onSave]);

  return (
    <textarea
      rows={2}
      className="w-full min-w-[150px] resize-y rounded border border-black/10 md:border-transparent md:hover:border-black/20 focus:border-[#1f3a5f] dark:border-white/10 md:dark:border-transparent md:dark:hover:border-white/20 dark:focus:border-sky-400 bg-transparent p-1.5 text-xs leading-relaxed focus:outline-none focus:bg-white/60 dark:focus:bg-white/5"
      placeholder={placeholder || '點擊輸入...'}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val !== value) onSave(val);
      }}
    />
  );
}

export default function MatrixView({
  items,
  store,
  onSelect,
}: {
  items: ReferenceItem[];
  store: Store;
  onSelect?: (id: string) => void;
}) {
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [managingCols, setManagingCols] = useState(false);

  function handleAddCol() {
    if (!newColName.trim()) return;
    store.addMatrixCol(newColName);
    setNewColName('');
    setAddingCol(false);
  }

  if (!items.length) {
    return (
      <p className="opacity-60 text-sm">
        這個專案還沒有文獻。請先新增文獻，即可在此進行橫向比較。
      </p>
    );
  }

  return (
    <div>
      {/* 矩陣工具列：新增欄位與管理欄位 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="opacity-60">
          點擊格子即可直接編輯，內容會自動儲存；點左側標題可開筆記
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {addingCol ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                autoFocus
                placeholder="輸入欄位名稱..."
                className="rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1 text-xs"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCol();
                  if (e.key === 'Escape') setAddingCol(false);
                }}
              />
              <button
                onClick={handleAddCol}
                className="rounded bg-[#1f3a5f] text-white px-2.5 py-1"
              >
                確定
              </button>
              <button
                onClick={() => setAddingCol(false)}
                className="rounded border border-black/20 dark:border-white/20 px-2 py-1"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingCol(true)}
              className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2.5 py-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <Plus size={13} />
              新增欄位
            </button>
          )}

          <button
            onClick={() => setManagingCols(!managingCols)}
            className={`flex items-center gap-1 rounded border px-2.5 py-1 ${
              managingCols
                ? 'border-[#1f3a5f] bg-[#1f3a5f] text-white'
                : 'border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            <Settings2 size={13} />
            {managingCols ? '完成管理' : '管理欄位'}
          </button>

          {managingCols && (
            <button
              onClick={() => {
                if (confirm('要恢復成預設的 5 個欄位嗎？（已填寫的資料不會遺失）')) {
                  store.resetMatrixCols();
                }
              }}
              className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2.5 py-1 opacity-80 hover:opacity-100"
            >
              <RotateCcw size={13} />
              恢復預設
            </button>
          )}
        </div>
      </div>

      {/* 手機版管理欄位標籤列 */}
      {managingCols && (
        <div className="md:hidden mb-3 flex flex-wrap gap-1.5 rounded-lg border border-black/15 dark:border-white/15 p-2.5 text-xs">
          {store.matrixCols.map((col) => (
            <span
              key={col.key}
              className="inline-flex items-center gap-1 rounded bg-black/5 dark:bg-white/10 px-2 py-1"
            >
              {col.label}
              {store.matrixCols.length > 1 && (
                <button
                  onClick={() => store.removeMatrixCol(col.key)}
                  aria-label={`移除 ${col.label}`}
                  className="text-red-600 dark:text-red-400"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* 電腦與橫向平板：橫向比較表格 */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-black/15 dark:border-white/15">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-black/15 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04]">
              <th className="sticky left-0 z-10 w-52 min-w-[200px] border-r border-black/10 dark:border-white/10 bg-[#f6f5f1] dark:bg-[#14181d] p-2.5 font-semibold">
                文獻（作者／年份）
              </th>
              {store.matrixCols.map((col) => (
                <th
                  key={col.key}
                  className="min-w-[170px] border-r last:border-r-0 border-black/10 dark:border-white/10 p-2.5 font-semibold"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>{col.label}</span>
                    {managingCols && store.matrixCols.length > 1 && (
                      <button
                        onClick={() => store.removeMatrixCol(col.key)}
                        title="移除此欄位"
                        className="rounded p-0.5 text-red-600 hover:bg-red-500/10"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {items.map((r) => (
              <tr key={r.id} className="align-top hover:bg-black/[0.015] dark:hover:bg-white/[0.02]">
                <td className="sticky left-0 z-10 border-r border-black/10 dark:border-white/10 bg-[#f6f5f1] dark:bg-[#14181d] p-2.5">
                  <button
                    type="button"
                    onClick={() => onSelect?.(r.id)}
                    className="text-left group w-full"
                  >
                    <div className="flex items-center justify-between gap-1 font-semibold text-[#1f3a5f] dark:text-sky-300 group-hover:underline">
                      <span>{formatInTextCitation(r, 'narrative')}</span>
                      <FileText size={12} className="shrink-0 opacity-50 group-hover:opacity-100" />
                    </div>
                    <div className="mt-0.5 line-clamp-2 opacity-75 group-hover:opacity-100" title={r.title}>
                      {r.title}
                    </div>
                  </button>
                </td>
                {store.matrixCols.map((col) => (
                  <td
                    key={col.key}
                    className="border-r last:border-r-0 border-black/10 dark:border-white/10 p-1.5"
                  >
                    <MatrixCell
                      value={r.matrix?.[col.key] || ''}
                      placeholder={`輸入${col.label}...`}
                      onSave={(val) => store.updateMatrix(r.id, col.key, val)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 手機版：卡片堆疊檢視 */}
      <div className="md:hidden space-y-3">
        {items.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-black/15 dark:border-white/15 p-3 space-y-2.5"
          >
            <button
              type="button"
              onClick={() => onSelect?.(r.id)}
              className="w-full text-left border-b border-black/10 dark:border-white/10 pb-2"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-[#1f3a5f] dark:text-sky-300">
                <span>{formatInTextCitation(r, 'narrative')}</span>
                <span className="inline-flex items-center gap-1 opacity-75">
                  <FileText size={12} />
                  筆記／詳情
                </span>
              </div>
              <div className="text-sm font-medium mt-0.5">{r.title}</div>
            </button>
            <div className="space-y-2">
              {store.matrixCols.map((col) => (
                <div key={col.key}>
                  <label className="block text-xs font-medium opacity-70 mb-0.5">
                    {col.label}
                  </label>
                  <MatrixCell
                    value={r.matrix?.[col.key] || ''}
                    placeholder={`輸入${col.label}...`}
                    onSave={(val) => store.updateMatrix(r.id, col.key, val)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
