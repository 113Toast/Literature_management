import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ExternalLink,
  FileText,
  Quote,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Store } from '../store';
import { formatInTextCitation } from '../utils/apaEngine';
import { getPdfBlob } from '../utils/pdfStorage';

type ReaderTab = 'pdf' | 'text';
type NullableString = string | null;

export default function ReaderModal({
  itemId,
  onClose,
  store,
  onToast,
}: {
  itemId: NullableString;
  onClose: () => void;
  store: Store;
  onToast: (msg: string) => void;
}) {
  const item = store.refs.find((r) => r.id === itemId) || null;

  const [tab, setTab] = useState<ReaderTab>('text');
  const [pdfBlobUrl, setPdfBlobUrl] = useState<NullableString>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [fontSize, setFontSize] = useState(15);
  const [selectedText, setSelectedText] = useState('');
  const textContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!item) return;
    let activeUrl: NullableString = null;
    let cancelled = false;

    setSelectedText('');
    setPdfBlobUrl(null);
    setLoadingPdf(true);

    getPdfBlob(item.id)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          activeUrl = URL.createObjectURL(blob);
          setPdfBlobUrl(activeUrl);
          setTab('pdf');
        } else if (item.snapshotText) {
          setTab('text');
        } else if (item.pdfUrl) {
          setTab('pdf');
        } else {
          setTab('text');
        }
      })
      .catch(() => {
        if (!cancelled) setTab('text');
      })
      .finally(() => {
        if (!cancelled) setLoadingPdf(false);
      });

    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [item?.id]);

  if (!item) return null;

  function handleTextSelection() {
    const sel = window.getSelection();
    const txt = sel?.toString().trim() || '';
    if (txt.length >= 2) {
      setSelectedText(txt);
    } else {
      setSelectedText('');
    }
  }

  function handleSaveHighlightAsQuote() {
    if (!item || !selectedText) return;
    const prevQuotes = item.quotes || [];
    const nextQuotes = [
      {
        text: selectedText,
        createdAt: new Date().toISOString(),
      },
      ...prevQuotes,
    ];
    store.update(item.id, { quotes: nextQuotes });
    onToast('已將反白段落存為引用句！');
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
  }

  const hasAnyPdf = Boolean(pdfBlobUrl || item.pdfUrl);
  const pdfTabClass =
    tab === 'pdf'
      ? 'flex items-center gap-1 rounded px-2.5 py-1 bg-[#1f3a5f] text-white'
      : 'flex items-center gap-1 rounded px-2.5 py-1 opacity-75 hover:opacity-100';
  const textTabClass =
    tab === 'text'
      ? 'flex items-center gap-1 rounded px-2.5 py-1 bg-[#1f3a5f] text-white'
      : 'flex items-center gap-1 rounded px-2.5 py-1 opacity-75 hover:opacity-100';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-0 md:p-5">
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden md:rounded-xl border border-black/15 dark:border-white/15 bg-[#f6f5f1] dark:bg-[#14181d] shadow-2xl">
        {/* 頂部閱讀工具列 */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-[#1f3a5f] dark:text-sky-300 font-semibold">
              <BookOpen size="14" />
              <span>{formatInTextCitation(item, 'narrative')}</span>
            </div>
            <h3 className="truncate text-sm md:text-base font-semibold mt-0.5" title={item.title}>
              {item.title}
            </h3>
          </div>

          {/* 切換 PDF 原檔 / 純文字全文 */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-black/20 dark:border-white/20 p-0.5 text-xs">
              {hasAnyPdf && (
                <button
                  type="button"
                  onClick={() => setTab('pdf')}
                  className={pdfTabClass}
                >
                  <FileText size="13" />
                  PDF 原檔
                </button>
              )}
              <button
                type="button"
                onClick={() => setTab('text')}
                className={textTabClass}
              >
                <BookOpen size="13" />
                純文字全文
              </button>
            </div>

            {tab === 'text' && (
              <div className="hidden sm:flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-1.5 py-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.max(12, s - 1))}
                  title="縮小字體"
                  className="p-1 opacity-75 hover:opacity-100"
                >
                  <ZoomOut size="13" />
                </button>
                <span>{fontSize}px</span>
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.min(24, s + 1))}
                  title="放大字體"
                  className="p-1 opacity-75 hover:opacity-100"
                >
                  <ZoomIn size="13" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="關閉閱讀器"
              className="rounded-md p-1.5 opacity-75 hover:bg-black/5 dark:hover:bg-white/10 hover:opacity-100"
            >
              <X size="20" />
            </button>
          </div>
        </header>

        {/* 反白即存引用句浮動列 */}
        {tab === 'text' && selectedText && (
          <div className="flex items-center justify-between gap-2 bg-[#1f3a5f] text-white px-4 py-2 text-xs">
            <span className="truncate">
              已選取：「{selectedText.slice(0, 60)}
              {selectedText.length > 60 ? '...' : ''}」
            </span>
            <button
              type="button"
              onClick={handleSaveHighlightAsQuote}
              className="shrink-0 inline-flex items-center gap-1 rounded bg-amber-400 text-black font-semibold px-3 py-1"
            >
              <Quote size="12" />
              ＋ 存為引用句
            </button>
          </div>
        )}

        {/* 主閱讀區 */}
        <div className="flex-1 overflow-y-auto">
          {loadingPdf ? (
            <div className="flex h-64 items-center justify-center text-sm opacity-65">
              正在載入文獻內容...
            </div>
          ) : tab === 'pdf' ? (
            pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                title={item.title}
                className="h-full w-full min-h-[75vh] border-0"
              />
            ) : item.pdfUrl ? (
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm opacity-80">
                  此文獻綁定了外部雲端 PDF 連結：
                </p>
                <a
                  href={item.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded bg-[#1f3a5f] text-white px-4 py-2 text-sm"
                >
                  <ExternalLink size="15" />
                  在新分頁開啟雲端 PDF
                </a>
                {item.snapshotText && (
                  <button
                    type="button"
                    onClick={() => setTab('text')}
                    className="text-xs underline opacity-75"
                  >
                    或切換為「純文字全文」直接閱讀
                  </button>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-sm opacity-65">
                尚未上傳此文獻的 PDF 檔案。
              </div>
            )
          ) : item.snapshotText ? (
            <div
              ref={textContainerRef}
              onMouseUp={handleTextSelection}
              onTouchEnd={handleTextSelection}
              style={{ fontSize: `${fontSize}px` }}
              className="mx-auto max-w-3xl whitespace-pre-wrap p-5 md:p-8 leading-relaxed selection:bg-amber-300/60"
            >
              <div className="mb-4 rounded-md bg-black/[0.04] dark:bg-white/[0.05] px-3 py-2 text-xs opacity-75">
                提示：用滑鼠或手指反白任何一段文字，即可一鍵存為這篇文獻的「重點引用句」。
              </div>
              {item.snapshotText}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <p className="text-sm opacity-75">
                這篇文獻目前尚未儲存 PDF 原檔或網頁全文快照。
              </p>
              <p className="text-xs opacity-60 max-w-md leading-relaxed">
                你可以點擊文獻卡片上的「編輯」，上傳這篇文獻的 PDF 檔案；或是使用電腦版 Chrome 擴充功能「文獻庫助手」重新收藏網頁以自動保存全文。
              </p>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded border border-black/25 dark:border-white/25 px-4 py-2 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <ExternalLink size="14" />
                  前往原始網址查看
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
