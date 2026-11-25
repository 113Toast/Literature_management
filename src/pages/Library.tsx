import { useState } from 'react';
import { Copy, Download, ExternalLink, List, StickyNote, Table, Trash2 } from 'lucide-react';
import type { Store } from '../store';
import MatrixView from '../components/MatrixView';
import ReferenceDrawer from '../components/ReferenceDrawer';
import {
  copyRichText, fetchMetadataByDOI, formatApaReference, formatInTextCitation, getMissingFields,
  sortReferencesBilingual, type Author, type ReadStatus, type ReferenceItem, type ReferenceType, type StanceTag,
} from '../utils/apaEngine';

const STATUS: Record<ReadStatus, string> = { unread: '未讀', reading: '精讀中', cited: '已引用' };
const TAGS: StanceTag[] = ['支持論點', '反方觀點', '背景數據', '研究方法參考'];
const TYPES: Record<ReferenceType, string> = { journal: '期刊', website: '網頁', thesis: '博碩士論文', book: '書籍' };
const inp = 'w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm';

function parseAuthors(s: string): Author[] {
  return s.split(/[;；、]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const [family, given] = p.split(',').map((x) => x.trim());
    return { family, given };
  });
}

export default function Library({ store, pid, adding = false }: { store: Store; pid: string; adding?: boolean }) {
  const q = new URLSearchParams(window.location.search); // PWA share_target 帶入
  const shared = q.get('url') || q.get('text') || '';
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(adding || !!shared);
  const [toast, setToast] = useState('');
  const [doi, setDoi] = useState('');
  const [d, setD] = useState<Partial<ReferenceItem>>({ type: shared ? 'website' : 'journal', url: shared, title: q.get('title') || '', year: '', status: 'unread', stanceTags: [] });
  const [authorsTxt, setAuthorsTxt] = useState('');
  const set = (p: Partial<ReferenceItem>) => setD((x) => ({ ...x, ...p }));
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 1500); };

  const list = sortReferencesBilingual(store.refs.filter((r) => r.projectId === pid));
  const draft = { ...d, authors: parseAuthors(authorsTxt) } as ReferenceItem;
  const missing = getMissingFields(draft);

  async function fetchDoi() {
    try {
      const m = await fetchMetadataByDOI(doi);
      set(m);
      setAuthorsTxt((m.authors || []).map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join('; '));
    } catch (e) { say((e as Error).message); }
  }
  function save() {
    if (!draft.title?.trim()) return say('請輸入標題');
    store.add({ ...draft, id: crypto.randomUUID(), projectId: pid, matrix: {}, createdAt: new Date().toISOString() } as ReferenceItem);
    setD({ type: 'journal', title: '', year: '', status: 'unread', stanceTags: [] }); setAuthorsTxt(''); setDoi(''); setOpen(false);
    if (location.search) history.replaceState(null, '', location.pathname + '#/');
  }
  async function copy(html: string, plain: string, msg: string) { await copyRichText(html, plain); say(msg); }
  async function exportCited() {
    const cited = sortReferencesBilingual(list.filter((r) => r.status === 'cited')).map((r) => formatApaReference(r));
    if (!cited.length) return say('尚無「已引用」文獻');
    const html = cited.map((c) => `<p style="margin:0">${c.html}</p>`).join('');
    await copyRichText(html, cited.map((c) => c.plain).join('\n'));
    say(`已複製 ${cited.length} 筆`);
  }
  const f = (k: keyof ReferenceItem, label: string, ph = '') => (
    <label className="text-xs">{label}<input className={inp} placeholder={ph} value={(d[k] as string) || ''} onChange={(e) => set({ [k]: e.target.value })} /></label>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{pid}（{list.length}）</h2>
          {/* 清單 / 比較矩陣 切換鈕 */}
          <div className="inline-flex rounded-md border border-black/20 dark:border-white/20 p-0.5 text-xs">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1 rounded px-2.5 py-1 ${
                view === 'list' ? 'bg-[#1f3a5f] text-white' : 'opacity-75 hover:opacity-100'
              }`}
            >
              <List size={13} />
              清單
            </button>
            <button
              onClick={() => setView('matrix')}
              className={`flex items-center gap-1 rounded px-2.5 py-1 ${
                view === 'matrix' ? 'bg-[#1f3a5f] text-white' : 'opacity-75 hover:opacity-100'
              }`}
            >
              <Table size={13} />
              比較矩陣
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={exportCited} className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm"><Download size={14} />匯出已引用</button>
          <button onClick={() => setOpen(!open)} className="rounded bg-[#1f3a5f] text-white px-3 py-1.5 text-sm">新增文獻</button>
        </div>
      </div>

      {open && (
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-black/15 dark:border-white/15 p-4">
          <div className="col-span-2 flex gap-2">
            <input className={inp} placeholder="貼上 DOI 自動帶入書目" value={doi} onChange={(e) => setDoi(e.target.value)} />
            <button onClick={fetchDoi} className="shrink-0 rounded border border-black/20 px-3 text-sm">抓取</button>
          </div>
          <label className="text-xs">類型
            <select className={inp} value={d.type} onChange={(e) => set({ type: e.target.value as ReferenceType })}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {f('year', '年份', '2024')}
          <div className="col-span-2">{f('title', '標題')}</div>
          <label className="col-span-2 text-xs">作者（中文用「、」分隔；英文「Smith, John; Lee, Amy」）
            <input className={inp} value={authorsTxt} onChange={(e) => setAuthorsTxt(e.target.value)} />
          </label>
          {d.type === 'journal' && <>{f('journal', '期刊名稱')}{f('volume', '卷')}{f('issue', '期')}{f('pages', '頁碼')}{f('doi', 'DOI')}</>}
          {d.type === 'website' && <>{f('url', '網址')}{f('accessDate', '存取日期', '2026-11-25')}{f('siteName', '機構／網站名稱')}</>}
          {(d.type === 'thesis' || d.type === 'book') && f('publisher', d.type === 'thesis' ? '學校系所' : '出版社')}
          {f('pdfUrl', 'PDF 雲端連結（Google Drive 等）')}
          <div className="col-span-2 flex flex-wrap gap-2 text-xs">
            {TAGS.map((t) => (
              <label key={t} className="flex items-center gap-1">
                <input type="checkbox" checked={d.stanceTags?.includes(t)} onChange={(e) => set({ stanceTags: e.target.checked ? [...(d.stanceTags || []), t] : (d.stanceTags || []).filter((x) => x !== t) })} />{t}
              </label>
            ))}
          </div>
          {(d.isRetracted || d.isPreprint) && <p className="col-span-2 text-sm">{d.isRetracted && <span className="text-red-600 font-semibold">⚠ 此文獻已被撤稿 </span>}{d.isPreprint && <span className="text-amber-600 font-semibold">⚠ 預印本，尚未經同儕審查</span>}</p>}
          {missing.length > 0 && <p className="col-span-2 text-xs text-amber-700 dark:text-amber-400">尚缺：{missing.join('、')}</p>}
          <button onClick={save} className="col-span-2 rounded bg-[#1f3a5f] text-white py-2 text-sm">儲存文獻</button>
        </div>
      )}

      {view === 'matrix' ? (
        <MatrixView items={list} store={store} onSelect={setSelectedId} />
      ) : (
        <>
          {!list.length && !open && <p className="opacity-60 text-sm">這個專案還沒有文獻。按「新增文獻」，貼上 DOI 即可開始。</p>}
          <ul className="space-y-3">
            {list.map((r) => {
              const apa = formatApaReference(r);
              const miss = getMissingFields(r);
              const quoteCount = r.quotes?.length || 0;
              const hasNotes = Boolean(r.notes?.trim());
              return (
                <li key={r.id} className="rounded-lg border border-black/10 dark:border-white/10 p-3">
                  <div className="flex flex-wrap gap-1 mb-1 text-xs">
                    {r.isRetracted && <span className="rounded bg-red-600 text-white px-1.5">已撤稿</span>}
                    {r.isPreprint && <span className="rounded bg-amber-400 text-black px-1.5">預印本</span>}
                    {miss.length > 0 && <span className="rounded bg-amber-100 text-amber-900 px-1.5">缺 {miss.join('、')}</span>}
                    {r.stanceTags.map((t) => <span key={t} className="rounded border border-black/20 px-1.5">{t}</span>)}
                  </div>
                  <p className="ref text-sm" dangerouslySetInnerHTML={{ __html: apa.html }} />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <button className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { const c = formatInTextCitation(r, 'parenthetical'); copy(c, c, '已複製括弧引用'); }}><Copy size={12} />括弧引用</button>
                    <button className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { const c = formatInTextCitation(r, 'narrative'); copy(c, c, '已複製敘述引用'); }}><Copy size={12} />敘述引用</button>
                    <button className="flex items-center gap-1 rounded border border-black/20 dark:border-white/20 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => copy(apa.html, apa.plain, '已複製完整 APA')}><Copy size={12} />完整 APA</button>
                    <button
                      className={`flex items-center gap-1 rounded border px-2 py-1 ${
                        hasNotes || quoteCount > 0
                          ? 'border-[#1f3a5f]/50 bg-[#1f3a5f]/10 text-[#1f3a5f] dark:border-sky-400/50 dark:bg-sky-400/10 dark:text-sky-300 font-medium'
                          : 'border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <StickyNote size={12} />
                      筆記／詳情{quoteCount > 0 ? ` (${quoteCount})` : ''}
                    </button>
                    <select className="rounded border border-black/20 dark:border-white/20 bg-transparent px-1 py-1" value={r.status} onChange={(e) => store.update(r.id, { status: e.target.value as ReadStatus })}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><ExternalLink size={12} />PDF</a>}
                    <button className="ml-auto opacity-60 hover:opacity-100" aria-label="刪除" onClick={() => confirm('刪除這筆文獻？') && store.remove(r.id)}><Trash2 size={14} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* 右側詳細資訊與筆記抽屜 */}
      <ReferenceDrawer
        itemId={selectedId}
        onClose={() => setSelectedId(null)}
        store={store}
        onToast={say}
      />

      {toast && <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded bg-black text-white px-3 py-1.5 text-sm">{toast}</div>}
    </div>
  );
}
