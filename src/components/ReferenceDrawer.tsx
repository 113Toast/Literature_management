import { useEffect, useState } from 'react';
import {
  Archive,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Quote,
  Sparkles,
  StickyNote,
  Table,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type { Store } from '../store';
import {
  copyRichText,
  detectLanguage,
  formatApaReference,
  formatInTextCitation,
  getMissingFields,
  type Author,
  type ReadStatus,
  type ReferenceItem,
  type ReferenceType,
  type StanceTag,
} from '../utils/apaEngine';
import {
  extractMatrixFromAbstract,
  getSavedGeminiKey,
} from '../utils/geminiMatrix';

const STATUS: Record<ReadStatus, string> = {
  unread: '未讀',
  reading: '精讀中',
  cited: '已引用',
};
const TAGS: StanceTag[] = ['支持論點', '反方觀點', '背景數據', '研究方法參考'];
const TYPES: Record<ReferenceType, string> = {
  journal: '期刊',
  website: '網頁',
  thesis: '博碩士論文',
  book: '書籍',
};
const inp =
  'w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm';

function parseAuthors(s: string): Author[] {
  return s
    .split(/[;；、]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [family, given] = p.split(',').map((x) => x.trim());
      return { family, given };
    });
}

function formatAuthorsForInput(authors: Author[]): string {
  return authors
    .map((a) => (a.given ? `${a.family}, ${a.given}` : a.family))
    .join('; ');
}

export default function ReferenceDrawer({
  itemId,
  onClose,
  store,
  onToast,
}: {
  itemId: string | null;
  onClose: () => void;
  store: Store;
  onToast: (msg: string) => void;
}) {
  const item = store.refs.find((r) => r.id === itemId) || null;
  const currentProject = item
    ? store.projects.find((p) => p.id === item.projectId)
    : undefined;

  // AI 摘要自動填入狀態
  const [abstractTxt, setAbstractTxt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // 引用句輸入狀態
  const [quoteText, setQuoteText] = useState('');
  const [quoteNote, setQuoteNote] = useState('');

  // 自由筆記（自動儲存）
  const [notes, setNotes] = useState('');
  const [noteSavedHint, setNoteSavedHint] = useState('');

  // 快照展開狀態
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  // 書目修改表單狀態
  const [draft, setDraft] = useState<Partial<ReferenceItem>>({});
  const [authorsTxt, setAuthorsTxt] = useState('');

  useEffect(() => {
    if (!item) return;
    setAbstractTxt('');
    setAiLoading(false);
    setAiError('');
    setQuoteText('');
    setQuoteNote('');
    setNotes(item.notes || '');
    setNoteSavedHint('');
    setSnapshotOpen(false);
    setDraft({ ...item });
    setAuthorsTxt(formatAuthorsForInput(item.authors || []));
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    if (notes === (item.notes || '')) return;
    setNoteSavedHint('儲存中...');
    const timer = setTimeout(() => {
      store.update(item.id, { notes });
      setNoteSavedHint('已自動儲存');
    }, 500);
    return () => clearTimeout(timer);
  }, [notes, item, store]);

  if (!item) return null;

  const hasApiKey = Boolean(getSavedGeminiKey());
  const lang = detectLanguage(item);
  const apa = formatApaReference(item);
  const quotes = item.quotes || [];
  const members = currentProject?.members || [];
  const setField = (patch: Partial<ReferenceItem>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  async function handleAiFillMatrix() {
    if (!item) return;
    setAiError('');
    if (!abstractTxt.trim()) {
      setAiError('請先在上方貼上論文摘要');
      return;
    }

    const hasExisting = store.matrixCols.some((c) =>
      Boolean(item.matrix?.[c.key]?.trim())
    );
    if (
      hasExisting &&
      !confirm('部分比較矩陣欄位已有內容，要用 AI 產生的結果覆蓋嗎？')
    ) {
      return;
    }

    setAiLoading(true);
    try {
      const extracted = await extractMatrixFromAbstract(
        abstractTxt,
        store.matrixCols,
        item.title
      );
      const nextMatrix = { ...(item.matrix || {}) };
      let filledCount = 0;
      for (const col of store.matrixCols) {
        if (extracted[col.key]) {
          nextMatrix[col.key] = extracted[col.key];
          filledCount++;
        }
      }
      store.update(item.id, { matrix: nextMatrix });
      onToast(`AI 已自動填入 ${filledCount} 個欄位`);
    } catch (err) {
      setAiError((err as Error).message || 'AI 處理失敗');
    } finally {
      setAiLoading(false);
    }
  }

  function handleAddQuote() {
    if (!item) return;
    const trimmed = quoteText.trim();
    if (!trimmed) return onToast('請輸入要收藏的引用句');
    const nextQuotes = [
      {
        text: trimmed,
        note: quoteNote.trim() || undefined,
        createdAt: new Date().toISOString(),
      },
      ...quotes,
    ];
    store.update(item.id, { quotes: nextQuotes });
    setQuoteText('');
    setQuoteNote('');
    onToast('已新增引用句');
  }

  function handleRemoveQuote(index: number) {
    if (!item) return;
    const nextQuotes = quotes.filter((_, idx) => idx !== index);
    store.update(item.id, { quotes: nextQuotes });
  }

  async function handleCopyQuoteWithCite(text: string) {
    if (!item) return;
    const cite = formatInTextCitation(item, 'parenthetical');
    const formatted = lang === 'zh' ? `「${text}」${cite}` : `"${text}" ${cite}`;
    await copyRichText(formatted, formatted);
    onToast('已複製引用句與出處');
  }

  function handleSaveMetadata() {
    if (!item) return;
    if (!draft.title?.trim()) return onToast('標題不能為空');
    store.update(item.id, {
      ...draft,
      title: draft.title.trim(),
      assignee: draft.assignee?.trim() || undefined,
      authors: parseAuthors(authorsTxt),
    });
    onToast('已更新書目資料');
  }

  const editDraftFull = {
    ...item,
    ...draft,
    authors: parseAuthors(authorsTxt),
  } as ReferenceItem;
  const missing = getMissingFields(editDraftFull);

  const renderInput = (k: keyof ReferenceItem, label: string, ph = '') => (
    <label className="text-xs">
      {label}
      <input
        className={inp}
        placeholder={ph}
        value={(draft[k] as string) || ''}
        onChange={(e) => setField({ [k]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* 半透明背景遮罩 */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* 右側抽屜主體 */}
      <aside className="relative z-50 flex h-full w-full md:w-[520px] flex-col border-l border-black/15 dark:border-white/15 bg-[#f6f5f1] dark:bg-[#14181d] shadow-2xl">
        {/* 頂部標題列 */}
        <div className="flex items-start justify-between gap-3 border-b border-black/10 dark:border-white/10 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[#1f3a5f] dark:text-sky-300">
                {formatInTextCitation(item, 'narrative')}
              </span>
              <select
                className="rounded border border-black/20 dark:border-white/20 bg-transparent px-1.5 py-0.5 text-xs"
                value={item.status}
                onChange={(e) =>
                  store.update(item.id, { status: e.target.value as ReadStatus })
                }
              >
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {item.pdfUrl && (
                <a
                  href={item.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline opacity-80 hover:opacity-100"
                >
                  <ExternalLink size={12} />
                  開啟 PDF
                </a>
              )}
            </div>
            <h3 className="mt-1 text-sm font-semibold leading-snug">
              {item.title}
            </h3>

            {/* 小組共編：快速指派負責人 */}
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <UserCheck size={13} className="opacity-65 shrink-0" />
              <span className="opacity-70 shrink-0">負責人：</span>
              <input
                list="project-members-list"
                className="w-44 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-0.5 text-xs"
                placeholder="輸入或選擇負責組員..."
                value={item.assignee || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setField({ assignee: val });
                  store.update(item.id, { assignee: val.trim() || undefined });
                }}
              />
              {members.length > 0 && (
                <datalist id="project-members-list">
                  {members.map((m) => (
                    <option
                      key={m.user_id}
                      value={m.user_name || m.user_email || m.user_id}
                    />
                  ))}
                </datalist>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉抽屜"
            className="shrink-0 rounded-md p-1.5 opacity-70 hover:bg-black/5 dark:hover:bg-white/10 hover:opacity-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* 可捲動內容區 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
          {/* 區塊 1：比較矩陣欄位 + Gemini AI 摘要自動填入 */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Table size={15} />
                <span>比較矩陣整理</span>
              </div>
              <span className="text-xs opacity-60">貼上摘要可由 AI 自動萃取</span>
            </div>

            <div className="rounded-lg border border-[#1f3a5f]/25 dark:border-sky-400/25 bg-[#1f3a5f]/[0.03] dark:bg-sky-400/[0.05] p-3 space-y-2">
              <textarea
                rows={3}
                className={inp}
                placeholder="貼上這篇論文的英文或中文摘要（Abstract），AI 會自動整理並填入下方各欄位..."
                value={abstractTxt}
                onChange={(e) => {
                  setAbstractTxt(e.target.value);
                  if (aiError) setAiError('');
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {!hasApiKey ? (
                  <a
                    href="#/settings"
                    onClick={onClose}
                    className="text-xs text-amber-700 dark:text-amber-400 underline"
                  >
                    尚未設定 Gemini API Key，點此前往設定 →
                  </a>
                ) : (
                  <span className="text-xs opacity-60">
                    將依目前矩陣設定自動填入 {store.matrixCols.length} 個欄位
                  </span>
                )}
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleAiFillMatrix}
                  className="ml-auto inline-flex items-center gap-1.5 rounded bg-[#1f3a5f] text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="animate-spin" size={13} />
                      AI 分析中...
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      AI 自動填入矩陣
                    </>
                  )}
                </button>
              </div>
              {aiError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  ⚠ {aiError}
                </p>
              )}
            </div>

            <div className="space-y-2 pt-1">
              {store.matrixCols.map((col) => (
                <div key={col.key}>
                  <label className="block text-xs font-medium opacity-75 mb-0.5">
                    {col.label}
                  </label>
                  <textarea
                    rows={2}
                    className={`${inp} text-xs leading-relaxed`}
                    placeholder={`輸入${col.label}...`}
                    value={item.matrix?.[col.key] || ''}
                    onChange={(e) =>
                      store.updateMatrix(item.id, col.key, e.target.value)
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          {/* 區塊 2：重點引用句收集 */}
          <section className="space-y-2.5 border-t border-black/10 dark:border-white/10 pt-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Quote size={15} />
              <span>重點引用句（{quotes.length}）</span>
            </div>

            <div className="rounded-lg border border-black/15 dark:border-white/15 p-3 space-y-2">
              <textarea
                rows={2}
                className={inp}
                placeholder="貼上這篇文獻中想引用的關鍵句子..."
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className={inp}
                  placeholder="頁碼或簡短備註（選填，如 p. 12）"
                  value={quoteNote}
                  onChange={(e) => setQuoteNote(e.target.value)}
                />
                <button
                  onClick={handleAddQuote}
                  className="shrink-0 inline-flex items-center gap-1 rounded bg-[#1f3a5f] text-white px-3 py-1.5 text-xs"
                >
                  <Plus size={14} />
                  加入
                </button>
              </div>
            </div>

            {quotes.length > 0 && (
              <ul className="space-y-2">
                {quotes.map((q, idx) => (
                  <li
                    key={`${q.createdAt}-${idx}`}
                    className="rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-2.5 text-xs space-y-1.5"
                  >
                    <p className="leading-relaxed">「{q.text}」</p>
                    {q.note && (
                      <p className="opacity-65">備註：{q.note}</p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => handleCopyQuoteWithCite(q.text)}
                        className="inline-flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        <Copy size={12} />
                        複製引用句＋出處
                      </button>
                      <button
                        onClick={() => handleRemoveQuote(idx)}
                        aria-label="刪除引用句"
                        className="opacity-50 hover:opacity-100 text-red-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 區塊 3：自由閱讀筆記 */}
          <section className="space-y-2 border-t border-black/10 dark:border-white/10 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <StickyNote size={15} />
                <span>閱讀筆記</span>
              </div>
              {noteSavedHint && (
                <span className="text-xs opacity-60">{noteSavedHint}</span>
              )}
            </div>
            <textarea
              rows={5}
              className={`${inp} leading-relaxed`}
              placeholder="記錄閱讀心得、研究缺口、與其他文獻的關聯（輸入後自動儲存）..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (item.notes || '')) {
                  store.update(item.id, { notes });
                  setNoteSavedHint('已自動儲存');
                }
              }}
            />
          </section>

          {/* 區塊 4：網頁永久快照（防死鏈） */}
          {item.snapshotText && (
            <section className="space-y-2 border-t border-black/10 dark:border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setSnapshotOpen(!snapshotOpen)}
                className="flex w-full items-center justify-between text-left text-sm font-semibold"
              >
                <span className="flex items-center gap-1.5">
                  <Archive size={15} />
                  <span>網頁永久快照（防死鏈備份）</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-normal opacity-70">
                  {item.snapshotDate ? item.snapshotDate.slice(0, 10) : ''}
                  {snapshotOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </button>
              {snapshotOpen && (
                <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.03] p-3 text-xs leading-relaxed">
                  {item.snapshotText}
                </div>
              )}
            </section>
          )}

          {/* 區塊 5：書目資料與專案歸屬修改 */}
          <section className="space-y-3 border-t border-black/10 dark:border-white/10 pt-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <BookOpen size={15} />
              <span>書目資料與分類修改</span>
            </div>

            <div className="rounded bg-black/[0.03] dark:bg-white/[0.04] p-2.5 text-xs leading-relaxed">
              <span className="block opacity-60 mb-1">目前 APA 格式預覽：</span>
              <p dangerouslySetInnerHTML={{ __html: apa.html }} />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="text-xs">
                所屬專案
                <select
                  className={inp}
                  value={draft.projectId || item.projectId}
                  onChange={(e) => setField({ projectId: e.target.value })}
                >
                  {store.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs">
                類型
                <select
                  className={inp}
                  value={draft.type || item.type}
                  onChange={(e) =>
                    setField({ type: e.target.value as ReferenceType })
                  }
                >
                  {Object.entries(TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <div className="col-span-2">
                {renderInput('title', '標題')}
              </div>

              <label className="col-span-2 text-xs">
                作者（中文用「、」分隔；英文「Smith, John; Lee, Amy」）
                <input
                  className={inp}
                  value={authorsTxt}
                  onChange={(e) => setAuthorsTxt(e.target.value)}
                />
              </label>

              {renderInput('year', '年份', '2024')}

              {(draft.type || item.type) === 'journal' && (
                <>
                  {renderInput('journal', '期刊名稱')}
                  {renderInput('volume', '卷')}
                  {renderInput('issue', '期')}
                  {renderInput('pages', '頁碼')}
                  {renderInput('doi', 'DOI')}
                </>
              )}

              {(draft.type || item.type) === 'website' && (
                <>
                  {renderInput('url', '網址')}
                  {renderInput('accessDate', '存取日期', '2026-11-25')}
                  {renderInput('siteName', '機構／網站名稱')}
                </>
              )}

              {((draft.type || item.type) === 'thesis' ||
                (draft.type || item.type) === 'book') &&
                renderInput(
                  'publisher',
                  (draft.type || item.type) === 'thesis' ? '學校系所' : '出版社'
                )}

              <div className="col-span-2">
                {renderInput('pdfUrl', 'PDF 雲端連結（Google Drive 等）')}
              </div>

              <div className="col-span-2 flex flex-wrap gap-2 text-xs pt-1">
                {TAGS.map((t) => (
                  <label key={t} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={draft.stanceTags?.includes(t) || false}
                      onChange={(e) =>
                        setField({
                          stanceTags: e.target.checked
                            ? [...(draft.stanceTags || []), t]
                            : (draft.stanceTags || []).filter((x) => x !== t),
                        })
                      }
                    />
                    {t}
                  </label>
                ))}
              </div>

              {missing.length > 0 && (
                <p className="col-span-2 text-xs text-amber-700 dark:text-amber-400">
                  尚缺：{missing.join('、')}
                </p>
              )}

              <button
                onClick={handleSaveMetadata}
                className="col-span-2 rounded bg-[#1f3a5f] text-white py-2 text-xs font-medium"
              >
                儲存書目修改
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
