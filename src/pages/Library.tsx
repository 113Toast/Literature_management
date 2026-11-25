import { useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileUp,
  Globe,
  List,
  Loader2,
  RefreshCw,
  StickyNote,
  Table,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import type { Store } from '../store';
import MatrixView from '../components/MatrixView';
import ReaderModal from '../components/ReaderModal';
import ReferenceDrawer from '../components/ReferenceDrawer';
import {
  copyRichText,
  fetchMetadataByDOI,
  formatApaReference,
  formatInTextCitation,
  getMissingFields,
  sortReferencesBilingual,
  type Author,
  type ReadStatus,
  type ReferenceItem,
  type ReferenceType,
  type StanceTag,
} from '../utils/apaEngine';
import {
  deletePdfBlob,
  extractPdfTextAndMetadata,
  savePdfBlob,
} from '../utils/pdfStorage';
import { fetchAndParseUrl } from '../utils/webScraper';

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

export default function Library({
  store,
  pid,
  adding = false,
}: {
  store: Store;
  pid: string;
  adding?: boolean;
}) {
  const q = new URLSearchParams(window.location.search);
  const sharedUrl = q.get('url') || '';
  const sharedText = q.get('text') || '';
  const initialUrl = sharedUrl || (sharedText.startsWith('http') ? sharedText : '');
  const initialQuote = sharedUrl && sharedText ? sharedText : '';

  const currentProject = store.projects.find((p) => p.id === pid);
  const projectName = currentProject?.name || pid;

  const pdfFileRef = useRef<HTMLInputElement null |>(null);

  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [drawerState, setDrawerState] = useState<{
    id: string;
    focus: 'notes' | 'edit';
  } | null>(null);
  const [readerId, setReaderId] = useState<string | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL');
  const [open, setOpen] = useState(adding || !!initialUrl);
  const [toast, setToast] = useState('');

  // 自動抓取與 PDF 辨識狀態
  const [doi, setDoi] = useState('');
  const [webUrlInput, setWebUrlInput] = useState(initialUrl);
  const [fetchingWeb, setFetchingWeb] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File null |>(null);
  const [extractedFullText, setExtractedFullText] = useState('');

  const [d, setD] = useState<Partial<ReferenceItem>>({
    type: initialUrl ? 'website' : 'journal',
    url: initialUrl,
    title: q.get('title') || '',
    year: '',
    status: 'unread',
    stanceTags: [],
    accessDate: initialUrl ? new Date().toISOString().slice(0, 10) : '',
  });
  const [authorsTxt, setAuthorsTxt] = useState('');
  const set = (p: Partial<ReferenceItem>) => setD((x) => ({ ...x, ...p }));
  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2200);
  };

  const projectRefs = sortReferencesBilingual(
    store.refs.filter((r) => r.projectId === pid)
  );
  const assignees = Array.from(
    new Set(projectRefs.map((r) => r.assignee).filter((a): a is string => Boolean(a)))
  );
  const list =
    filterAssignee === 'ALL'
      ? projectRefs
      : filterAssignee === 'UNASSIGNED'
      ? projectRefs.filter((r) => !r.assignee)
      : projectRefs.filter((r) => r.assignee === filterAssignee);

  const draft = { ...d, authors: parseAuthors(authorsTxt) } as ReferenceItem;
  const missing = getMissingFields(draft);

  async function fetchDoi() {
    try {
      const m = await fetchMetadataByDOI(doi);
      set(m);
      setAuthorsTxt(
        (m.authors || [])
          .map((a) => (a.given ? `${a.family}, ${a.given}` : a.family))
          .join('; ')
      );
      say('已成功抓取 DOI 書目');
    } catch (e) {
      say((e as Error).message);
    }
  }

  async function handleFetchWebUrl() {
    if (!webUrlInput.trim()) return say('請先貼上網頁網址');
    setFetchingWeb(true);
    try {
      const res = await fetchAndParseUrl(webUrlInput);
      set(res.metadata);
      setAuthorsTxt(res.authorsText);
      if (res.snapshotText) {
        setExtractedFullText(res.snapshotText);
      }
      say(
        res.detectedSite
          ? `已自動辨識「${res.detectedSite}」並填入欄位！`
          : '已自動抓取網頁書目與全文！'
      );
    } catch (e) {
      say((e as Error).message);
    } finally {
      setFetchingWeb(false);
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setParsingPdf(true);
    setPendingPdfFile(file);
    try {
      const res = await extractPdfTextAndMetadata(file);
      set(res.metadata);
      setAuthorsTxt(res.authorsText);
      setExtractedFullText(res.fullText);
      say(res.methodUsed);
    } catch (err) {
      say(`PDF 辨識發生問題：${(err as Error).message}`);
    } finally {
      setParsingPdf(false);
    }
  }

  async function save(force = false) {
    if (!draft.title?.trim()) return say('請輸入標題');
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newItem: ReferenceItem = {
      ...draft,
      id: newId,
      projectId: pid,
      hasLocalPdf: Boolean(pendingPdfFile),
      snapshotText: extractedFullText || undefined,
      snapshotDate: extractedFullText ? now : undefined,
      assignee: draft.assignee?.trim() || undefined,
      quotes: initialQuote
        ? [{ text: initialQuote, createdAt: now }]
        : [],
      matrix: {},
      createdAt: now,
    } as ReferenceItem;

    const res = await store.add(newItem, force);
    if (!res.ok && res.duplicate) {
      const goOn = confirm(
        `此專案已收錄過相似文獻：\n「${res.duplicate.title}」\n\n確定仍要重複新增嗎？`
      );
      if (goOn) {
        await save(true);
      }
      return;
    }

    if (pendingPdfFile) {
      try {
        await savePdfBlob(newId, pendingPdfFile);
      } catch {
        // 若儲存空間受限仍保留文字書目
      }
    }

    setD({
      type: 'journal',
      title: '',
      year: '',
      status: 'unread',
      stanceTags: [],
    });
    setAuthorsTxt('');
    setDoi('');
    setWebUrlInput('');
    setPendingPdfFile(null);
    setExtractedFullText('');
    setOpen(false);
    say('已儲存文獻');
    if (location.search) history.replaceState(null, '', location.pathname + '#/');
  }

  async function copy(html: string, plain: string, msg: string) {
    await copyRichText(html, plain);
    say(msg);
  }

  async function exportCited() {
    const cited = sortReferencesBilingual(
      projectRefs.filter((r) => r.status === 'cited')
    ).map((r) => formatApaReference(r));
    if (!cited.length) return say('尚無「已引用」文獻');
    const html = cited.map((c) => `<p style="margin:0">${c.html}</p>`).join('');
    await copyRichText(html, cited.map((c) => c.plain).join('\n'));
    say(`已複製 ${cited.length} 筆`);
  }

  const f = (k: keyof ReferenceItem, label: string, ph = '') => (
    <label className="text-xs">
      {label}
      <input
        className={inp}
        placeholder={ph}
        value={(d[k] as string) || ''}
        onChange={(e) => set({ [k]: e.target.value })}
      />
    </label>
  );

  return (
    <div>
      {/* 標題與操作列 */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">
            {projectName}（{list.length}）
          </h2>
          <div className="inline-flex rounded-md border border-black/20 dark:border-white/20 p-0.5 text-xs">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1 rounded px-2.5 py-1 ${
                view === 'list'
                  ? 'bg-[#1f3a5f] text-white'
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              <List size="{13}"/>
              清單
            </button>
            <button
              onClick={() => setView('matrix')}
              className={`flex items-center gap-1 rounded px-2.5 py-1 ${
                view === 'matrix'
                  ? 'bg-[#1f3a5f] text-white'
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              <Table size="{13}"/>
              比較矩陣
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportCited}
            className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm"
          >
            <Download size="{14}"/>
            匯出已引用
          </button>
          <button
            onClick={() => setOpen(!open)}
            className="rounded bg-[#1f3a5f] text-white px-3 py-1.5 text-sm"
          >
            新增文獻
          </button>
        </div>
      </div>

      {/* 小組共編資訊列 */}
      {currentProject?.isCloud && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#1f3a5f]/20 dark:border-sky-400/20 bg-[#1f3a5f]/[0.03] dark:bg-sky-400/[0.05] px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 font-medium">
              <Users size="{13}"/>
              共編成員：{currentProject.members?.length || 1} 人
            </span>
            {currentProject.inviteCode && (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(currentProject.inviteCode!);
                  say(`已複製邀請碼：${currentProject.inviteCode}`);
                }}
                className="inline-flex items-center gap-1 rounded border border-black/20 dark:border-white/20 bg-white/70 dark:bg-white/10 px-2 py-0.5 font-mono font-semibold"
              >
                邀請碼：{currentProject.inviteCode}
                <Copy size="{11}"/>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={store.syncing}
            onClick={async () => {
              await store.syncFromCloud();
              say('已與雲端同步最新資料');
            }}
            className="inline-flex items-center gap-1 opacity-80 hover:opacity-100"
          >
            <RefreshCw ''} 'animate-spin' : ? className="{store.syncing" size="{12}"/>
            {store.syncing ? '同步中...' : '立即同步'}
          </button>
        </div>
      )}

      {/* 負責人快速篩選列 */}
      {assignees.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="opacity-60">篩選負責人：</span>
          <button
            onClick={() => setFilterAssignee('ALL')}
            className={`rounded-full px-2.5 py-0.5 border ${
              filterAssignee === 'ALL'
                ? 'bg-[#1f3a5f] text-white border-[#1f3a5f]'
                : 'border-black/20 dark:border-white/20'
            }`}
          >
            全部（{projectRefs.length}）
          </button>
          {assignees.map((a) => (
            <button
              key={a}
              onClick={() => setFilterAssignee(a)}
              className={`rounded-full px-2.5 py-0.5 border ${
                filterAssignee === a
                  ? 'bg-[#1f3a5f] text-white border-[#1f3a5f]'
                  : 'border-black/20 dark:border-white/20'
              }`}
            >
              {a}
            </button>
          ))}
          <button
            onClick={() => setFilterAssignee('UNASSIGNED')}
            className={`rounded-full px-2.5 py-0.5 border ${
              filterAssignee === 'UNASSIGNED'
                ? 'bg-[#1f3a5f] text-white border-[#1f3a5f]'
                : 'border-black/20 dark:border-white/20'
            }`}
          >
            未指派
          </button>
        </div>
      )}

      {/* 新增文獻表單 */}
      {open && (
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-black/15 dark:border-white/15 p-4">
          {/* 智慧匯入列 1：上傳 PDF 自動辨識 */}
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[#1f3a5f]/40 dark:border-sky-400/40 bg-[#1f3a5f]/[0.03] dark:bg-sky-400/[0.05] p-2.5 text-xs">
            <div>
              <span className="font-semibold">
                {pendingPdfFile
                  ? `已選取 PDF：${pendingPdfFile.name}`
                  : '上傳 PDF 論文／博碩士論文，自動辨識書目並可直接在網站閱讀'}
              </span>
            </div>
            <input
              ref={pdfFileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handlePdfUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={parsingPdf}
              onClick={() => pdfFileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded bg-[#1f3a5f] text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {parsingPdf ? (
                <>
                  <Loader2 className="animate-spin" size="{13}"/>
                  辨識 PDF 中...
                </>
              ) : (
                <>
                  <FileUp size="{13}"/>
                  選擇 PDF 檔案
                </>
              )}
            </button>
          </div>

          {/* 智慧匯入列 2：貼上網頁網址自動抓取（支援博碩士論文網、華藝、政府機關、新聞） */}
          <div className="col-span-2 flex gap-2">
            <input
              className={inp}
              placeholder="貼上網頁網址（支援臺灣博碩士論文網、華藝、政府公告、新聞）"
              value={webUrlInput}
              onChange={(e) => setWebUrlInput(e.target.value)}
            />
            <button
              type="button"
              disabled={fetchingWeb}
              onClick={handleFetchWebUrl}
              className="shrink-0 inline-flex items-center gap-1 rounded border border-black/25 dark:border-white/25 px-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
            >
              {fetchingWeb ? (
                <Loader2 className="animate-spin" size="{13}"/>
              ) : (
                <Globe size="{13}"/>
              )}
              抓取網址
            </button>
          </div>

          {/* 智慧匯入列 3：DOI 自動抓取 */}
          <div className="col-span-2 flex gap-2">
            <input
              className={inp}
              placeholder="或貼上論文 DOI 編號自動帶入書目"
              value={doi}
              onChange={(e) => setDoi(e.target.value)}
            />
            <button
              onClick={fetchDoi}
              className="shrink-0 rounded border border-black/25 dark:border-white/25 px-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              抓取 DOI
            </button>
          </div>

          <label className="text-xs">
            類型
            <select
              className={inp}
              value={d.type}
              onChange={(e) => set({ type: e.target.value as ReferenceType })}
            >
              {Object.entries(TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {f('year', '年份（西元年）', '2025')}
          <div className="col-span-2">{f('title', '標題')}</div>
          <label className="col-span-2 text-xs">
            作者／研究生（中文用「、」分隔；英文「Smith, John; Lee, Amy」）
            <input
              className={inp}
              value={authorsTxt}
              onChange={(e) => setAuthorsTxt(e.target.value)}
            />
          </label>
          {d.type === 'journal' && (
            <>
              {f('journal', '期刊名稱')}
              {f('volume', '卷')}
              {f('issue', '期')}
              {f('pages', '頁碼')}
              {f('doi', 'DOI')}
            </>
          )}
          {d.type === 'website' && (
            <>
              {f('url', '網址')}
              {f('accessDate', '存取日期', '2026-11-25')}
              {f('siteName', '機構／網站名稱')}
            </>
          )}
          {(d.type === 'thesis' || d.type === 'book') &&
            f(
              'publisher',
              d.type === 'thesis'
                ? '學校系所（校院名稱＋系所名稱）'
                : '出版社'
            )}
          {f('pdfUrl', '外部 PDF 雲端連結（選填）')}
          {f('assignee', '負責組員（選填）', '例如：王小明')}
          {initialQuote && (
            <p className="col-span-2 rounded bg-black/5 dark:bg-white/10 p-2 text-xs">
              已帶入反白引用句：「{initialQuote}」
            </p>
          )}
          <div className="col-span-2 flex flex-wrap gap-2 text-xs">
            {TAGS.map((t) => (
              <label key={t} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={d.stanceTags?.includes(t)}
                  onChange={(e) =>
                    set({
                      stanceTags: e.target.checked
                        ? [...(d.stanceTags || []), t]
                        : (d.stanceTags || []).filter((x) => x !== t),
                    })
                  }
                />
                {t}
              </label>
            ))}
          </div>
          {(d.isRetracted || d.isPreprint) && (
            <p className="col-span-2 text-sm">
              {d.isRetracted && (
                <span className="text-red-600 font-semibold">
                  ⚠ 此文獻已被撤稿 
                </span>
              )}
              {d.isPreprint && (
                <span className="text-amber-600 font-semibold">
                  ⚠ 預印本，尚未經同儕審查
                </span>
              )}
            </p>
          )}
          {missing.length > 0 && (
            <p className="col-span-2 text-xs text-amber-700 dark:text-amber-400">
              尚缺：{missing.join('、')}
            </p>
          )}
          <button
            onClick={() => save(false)}
            className="col-span-2 rounded bg-[#1f3a5f] text-white py-2 text-sm font-medium"
          >
            儲存文獻
          </button>
        </div>
      )}

      {/* 清單或比較矩陣 */}
      {view === 'matrix' ? (
        <MatrixView items="{list}" onSelect="{(id)" store="{store}"> setDrawerState({ id, focus: 'notes' })}
        />
      ) : (
        <>
          {!list.length && !open && (
            <p className="opacity-60 text-sm">
              目前沒有符合條件的文獻。按「新增文獻」，上傳 PDF 或貼上網址／DOI 即可開始。
            </p>
          )}
          <ul className="space-y-3">
            {list.map((r) => {
              const apa = formatApaReference(r);
              const miss = getMissingFields(r);
              const quoteCount = r.quotes?.length || 0;
              const hasNotes = Boolean(r.notes?.trim());
              const hasReadableContent = Boolean(
                r.hasLocalPdf || r.snapshotText || r.pdfUrl
              );
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-black/10 dark:border-white/10 p-3"
                >
                  <div className="flex flex-wrap gap-1 mb-1 text-xs">
                    {r.isRetracted && (
                      <span className="rounded bg-red-600 text-white px-1.5">
                        已撤稿
                      </span>
                    )}
                    {r.isPreprint && (
                      <span className="rounded bg-amber-400 text-black px-1.5">
                        預印本
                      </span>
                    )}
                    {miss.length > 0 && (
                      <span className="rounded bg-amber-100 text-amber-900 px-1.5">
                        缺 {miss.join('、')}
                      </span>
                    )}
                    {r.assignee && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/15 text-sky-900 dark:text-sky-200 px-1.5">
                        <UserCheck size="{11}"/>
                        {r.assignee}
                      </span>
                    )}
                    {(r.hasLocalPdf || r.snapshotText) && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 px-1.5">
                        <Archive size="{11}"/>
                        {r.hasLocalPdf ? '已存 PDF' : '可讀全文'}
                      </span>
                    )}
                    {r.stanceTags.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-black/20 dark:border-white/20 px-1.5"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  {/* 點擊文獻標題可直接開啟閱讀器 */}
                  <div
                    onClick={() => setReaderId(r.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setReaderId(r.id);
                    }}
                    title="點擊直接閱讀文獻內容"
                    className="ref text-sm cursor-pointer rounded px-1 -mx-1 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    dangerouslySetInnerHTML={{ __html: apa.html }}
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <button
                      className={`flex items-center gap-1 rounded border px-2 py-1 ${
                        hasReadableContent
                          ? 'border-[#1f3a5f] bg-[#1f3a5f] text-white'
                          : 'border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                      onClick={() => setReaderId(r.id)}
                    >
                      <BookOpen size="{12}"/>
                      閱讀內容
                    </button>
                    <button
                      className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => setDrawerState({ id: r.id, focus: 'edit' })}
                    >
                      <Edit3 size="{12}"/>
                      編輯
                    </button>
                    <button
                      className={`flex items-center gap-1 rounded border px-2 py-1 ${
                        hasNotes || quoteCount > 0
                          ? 'border-[#1f3a5f]/50 bg-[#1f3a5f]/10 text-[#1f3a5f] dark:border-sky-400/50 dark:bg-sky-400/10 dark:text-sky-300 font-medium'
                          : 'border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                      onClick={() => setDrawerState({ id: r.id, focus: 'notes' })}
                    >
                      <StickyNote size="{12}"/>
                      筆記／矩陣{quoteCount > 0 ? ` (${quoteCount})` : ''}
                    </button>
                    <button
                      className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => {
                        const c = formatInTextCitation(r, 'parenthetical');
                        copy(c, c, '已複製括弧引用');
                      }}
                    >
                      <Copy size="{12}"/>
                      括弧
                    </button>
                    <button
                      className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => {
                        const c = formatInTextCitation(r, 'narrative');
                        copy(c, c, '已複製敘述引用');
                      }}
                    >
                      <Copy size="{12}"/>
                      敘述
                    </button>
                    <button
                      className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => copy(apa.html, apa.plain, '已複製完整 APA')}
                    >
                      <Copy size="{12}"/>
                      完整 APA
                    </button>
                    <select
                      className="rounded border border-black/20 dark:border-white/20 bg-transparent px-1 py-1"
                      value={r.status}
                      onChange={(e) =>
                        store.update(r.id, {
                          status: e.target.value as ReadStatus,
                        })
                      }
                    >
                      {Object.entries(STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    {r.pdfUrl && (
                      <a
                        href={r.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 underline"
                      >
                        <ExternalLink size="{12}"/>
                        外部連結
                      </a>
                    )}
                    <button
                      className="ml-auto opacity-60 hover:opacity-100"
                      aria-label="刪除"
                      onClick={async () => {
                        if (confirm('刪除這筆文獻？')) {
                          await deletePdfBlob(r.id).catch(() => {});
                          store.remove(r.id);
                        }
                      }}
                    >
                      <Trash2 size="{14}"/>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* 右側詳情與編輯抽屜 */}
      <ReferenceDrawer 'notes'} initialFocus="{drawerState?.focus" itemId="{drawerState?.id" null} onOpenReader="{(id)" ||> setReaderId(id)}
        onClose={() => setDrawerState(null)}
        store={store}
        onToast={say}
      />

      {/* 內建文獻閱讀器 */}
      <ReaderModal itemId="{readerId}" onClose="{()"> setReaderId(null)}
        store={store}
        onToast={say}
      />

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded bg-black text-white px-3 py-1.5 text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
