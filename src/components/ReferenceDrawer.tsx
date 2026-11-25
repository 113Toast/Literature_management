import { useEffect, useState } from 'react';
import {
  BookOpen,
  Copy,
  ExternalLink,
  Plus,
  Quote,
  StickyNote,
  Trash2,
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

  // 引用句輸入狀態
  const [quoteText, setQuoteText] = useState('');
  const [quoteNote, setQuoteNote] = useState('');

  // 自由筆記（自動儲存）
  const [notes, setNotes] = useState('');
  const [noteSavedHint, setNoteSavedHint] = useState('');

  // 書目修改表單狀態
  const [draft, setDraft] = useState<Partial<ReferenceItem>>({});
  const [authorsTxt, setAuthorsTxt] = useState('');

  // 切換不同文獻時，同步載入該文獻資料
  useEffect(() => {
    if (!item) return;
    setQuoteText('');
    setQuoteNote('');
    setNotes(item.notes || '');
    setNoteSavedHint('');
    setDraft({ ...item });
    setAuthorsTxt(formatAuthorsForInput(item.authors || []));
  }, [item?.id]);

  // 自由筆記停頓 500ms 自動儲存
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

  const lang = detectLanguage(item);
  const apa = formatApaReference(item);
  const quotes = item.quotes || [];
  const setField = (patch: Partial<ReferenceItem>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

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

      {/* 右側抽屜主體（手機滿版、電腦固定寬度） */}
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
          {/* 區塊 1：重點引用句收集 */}
          <section className="space-y-2.5">
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

          {/* 區塊 2：自由閱讀筆記 */}
          <section className="space-y-2">
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

          {/* 區塊 3：書目資料與專案歸屬修改 */}
          <section className="space-y-3 border-t border-black/10 dark:border-white/10 pt-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <BookOpen size={15} />
              <span>書目資料與分類修改</span>
            </div>

            {/* 完整 APA 預覽 */}
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
                    <option key={p} value={p}>
                      {p}
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
