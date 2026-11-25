import { useState } from 'react';
import type { Store } from '../store';

interface Cite { raw: string; name: string; year: string }

function extract(text: string): Cite[] {
  const out: Cite[] = [];
  const pats: RegExp[] = [
    /[（(]([\u4e00-\u9fff]{2,}(?:[、與][\u4e00-\u9fff]{2,})*)(?:等人)?[，,]\s*(\d{4}[a-z]?|無日期)[）)]/g, // （陳大明，2024）
    /([\u4e00-\u9fff]{2,12})(?:等人)?[（(](\d{4}[a-z]?)[）)]/g,                                              // 陳大明（2024）
    /([A-Z][A-Za-z'’-]+)(?: et al\.|(?: (?:&|and) [A-Z][A-Za-z'’-]+))?,? ?\(?(\d{4}[a-z]?)\)/g,           // (Smith et al., 2024)
  ];
  for (const p of pats) for (const m of text.matchAll(p)) out.push({ raw: m[0], name: m[1], year: m[2].slice(0, 4) });
  return out;
}

export default function Checker({ store, pid }: { store: Store; pid: string }) {
  const [text, setText] = useState('');
  const [ran, setRan] = useState(false);
  const refs = store.refs.filter((r) => r.projectId === pid);
  const cites = extract(text);
  const matches = (c: Cite, r: (typeof refs)[number]) =>
    r.year.slice(0, 4) === c.year &&
    (c.name.toLowerCase() === r.authors[0]?.family.toLowerCase() || (/[\u4e00-\u9fff]/.test(c.name) && c.name.includes(r.authors[0]?.family || '\0')));
  const missingInList = cites.filter((c) => !refs.some((r) => matches(c, r)));
  const uncited = refs.filter((r) => !cites.some((c) => matches(c, r)));
  const uniq = (a: Cite[]) => [...new Map(a.map((c) => [c.raw, c])).values()];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">內文與文末核對</h2>
      <p className="text-sm opacity-70 mb-3">貼上草稿，與「{pid}」的文獻比對。</p>
      <textarea className="w-full h-56 rounded border border-black/20 bg-transparent p-2 text-sm" value={text} onChange={(e) => { setText(e.target.value); setRan(false); }} placeholder="貼上含 (陳大明, 2024)、陳大明（2024）、(Smith et al., 2024) 的段落" />
      <button onClick={() => setRan(true)} className="mt-2 rounded bg-[#1f3a5f] text-white px-4 py-1.5 text-sm">開始核對</button>
      {ran && (
        <div className="mt-5 space-y-4 text-sm">
          <section>
            <h3 className="font-semibold">🔴 內文有引、文末漏放（{uniq(missingInList).length}）</h3>
            {uniq(missingInList).map((c) => <p key={c.raw} className="text-red-600">{c.raw}</p>)}
          </section>
          <section>
            <h3 className="font-semibold">🟡 文末有放、內文未引（{uncited.length}）</h3>
            {uncited.map((r) => <p key={r.id} className="text-amber-600">{r.authors[0]?.family}（{r.year}）{r.title}</p>)}
          </section>
          <section>
            <h3 className="font-semibold">🟢 已對應（{refs.length - uncited.length}）</h3>
            {refs.filter((r) => !uncited.includes(r)).map((r) => <p key={r.id} className="text-green-700">{r.authors[0]?.family}（{r.year}）</p>)}
          </section>
        </div>
      )}
    </div>
  );
}
