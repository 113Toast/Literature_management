import * as pdfjsLib from 'pdfjs-dist';
import {
  fetchMetadataByDOI,
  type Author,
  type ReferenceItem,
  type ReferenceType,
} from './apaEngine';
import { getSavedGeminiKey } from './geminiMatrix';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const DB_NAME = 'litlib_pdf_db';
const STORE_NAME = 'pdfs';

function openPdfDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePdfBlob(id: string, blob: Blob): Promise<void> {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPdfBlob(id: string): Promise<Blob | null> {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as Blob) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePdfBlob(id: string): Promise<void> {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function parseChineseRocNum(str: string): number | null {
  const clean = str.replace(/\s+/g, '');
  if (/^\d{2,3}$/.test(clean)) return parseInt(clean, 10);
  const map: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  if (clean.startsWith('一百')) {
    const rest = clean.slice(2);
    if (!rest) return 100;
    if (rest.startsWith('十')) {
      const u = rest[1] ? map[rest[1]] ?? 0 : 0;
      return 110 + u;
    }
    if (rest.includes('十')) {
      const [tChar, uChar] = rest.split('十');
      return 100 + (map[tChar] ?? 0) * 10 + (uChar ? map[uChar] ?? 0 : 0);
    }
    if (rest.startsWith('零') && rest[1]) {
      return 100 + (map[rest[1]] ?? 0);
    }
  }
  return null;
}

/** 無 DOI 且無 AI 金鑰時的規則式 PDF 封面辨識（支援台灣博碩士論文與中英文期刊） */
function parsePdfByHeuristics(
  firstPagesText: string,
  fileName: string
): { metadata: Partial<ReferenceItem>; authorsText: string } {
  const lines = firstPagesText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const fallbackTitle = fileName.replace(/\.pdf$/i, '').trim();

  // 判斷是否為台灣博碩士論文封面
  const isThesis =
    /碩士論文|博士論文|學位論文|Master\s+Thesis|Doctoral\s+Dissertation/i.test(
      firstPagesText.slice(0, 2000)
    );

  if (isThesis) {
    let school = '';
    let dept = '';
    let author = '';
    let year = '';
    let title = '';

    for (const line of lines.slice(0, 35)) {
      if (!school) {
        const sm = line.match(/([\u4e00-\u9fff]{2,10}(?:科技大學|大學|學院))/);
        if (sm) school = sm[1];
      }
      if (!dept) {
        const dm = line.match(/([\u4e00-\u9fff]{2,15}(?:研究所|學系|碩士班|博士班))/);
        if (dm) dept = dm[1];
      }
      if (!author) {
        const am = line.match(/^(?:研究生|研\s*究\s*生|作\s*者)\s*[:：]?\s*([\u4e00-\u9fff]{2,5})/);
        if (am) author = am[1];
      }
      if (!year) {
        const ym = line.match(/中華民國\s*([一二三四五六七八九十零〇\d]{2,5})\s*年/);
        if (ym) {
          const roc = parseChineseRocNum(ym[1]);
          if (roc && roc >= 60 && roc <= 200) year = String(roc + 1911);
        }
      }
    }

    // 嘗試抓出論文標題（排除學校、系所、學位論文、指導教授、研究生、日期行）
    const candidateLines = lines.slice(0, 20).filter(
      (l) =>
        l.length >= 6 &&
        l.length <= 80 &&
        !/(大學|學院|研究所|學系|碩士論文|博士論文|指導教授|研究生|中華民國|Advisor|University|Department)/i.test(
          l
        )
    );
    if (candidateLines.length > 0) {
      title = candidateLines[0];
    }

    return {
      authorsText: author,
      metadata: {
        type: 'thesis',
        title: title || fallbackTitle,
        authors: author ? [{ family: author }] : [],
        year,
        publisher: `${school}${dept}`.trim(),
      },
    };
  }

  // 一般期刊或文件：找年份與首行標題
  const adMatch = firstPagesText.slice(0, 2500).match(/\b(19\d{2}|20\d{2})\b/);
  const titleCandidate =
    lines.find(
      (l) =>
        l.length >= 8 &&
        l.length <= 140 &&
        !/^(vol\.|issue|issn|doi|received|accepted|http|www\.)/i.test(l)
    ) || fallbackTitle;

  return {
    authorsText: '',
    metadata: {
      type: 'journal',
      title: titleCandidate,
      authors: [],
      year: adMatch ? adMatch[1] : '',
    },
  };
}

/** 透過 Gemini API 從 PDF 前幾頁文字精準萃取出 APA 書目欄位 */
async function extractPdfWithGemini(
  apiKey: string,
  firstPagesText: string
): Promise<{ metadata: Partial<ReferenceItem>; authorsText: string }> {
  const prompt = `你是一位專業的圖書館學與 APA 第七版編目助理。請閱讀以下 PDF 文獻前幾頁萃取出的文字，辨識並回傳結構化書目 JSON。

規則：
1. type 只能是 "journal"（期刊論文）、"thesis"（博碩士論文）、"book"（書籍）、"website"（網頁或報告）其中之一。
2. 若為台灣博碩士論文，type 設為 "thesis"，authors 填入研究生姓名（不要填指導教授），publisher 填入「校院名稱＋系所名稱」（例如「嘉南藥理大學藥學系」），並將民國年換算為西元年（民國年 + 1911）。
3. authors 陣列格式為 [{"family": "姓氏或中文全名", "given": "英文名字（中文請留空字串）"}]。
4. 找不到資訊的欄位請回傳空字串 "" 或空陣列 []，切勿憑空捏造。

請只回傳合法 JSON 物件：
{
  "type": "journal",
  "title": "",
  "authors": [{"family": "", "given": ""}],
  "year": "",
  "journal": "",
  "volume": "",
  "issue": "",
  "pages": "",
  "publisher": "",
  "siteName": "",
  "doi": ""
}

【PDF 前幾頁文字】
${firstPagesText.slice(0, 6000)}`;

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!res.ok) continue;
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) continue;

    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned) as {
      type?: ReferenceType;
      title?: string;
      authors?: Author[];
      year?: string;
      journal?: string;
      volume?: string;
      issue?: string;
      pages?: string;
      publisher?: string;
      siteName?: string;
      doi?: string;
    };

    const validAuthors: Author[] = Array.isArray(parsed.authors)
      ? parsed.authors
          .filter((a) => a && typeof a.family === 'string' && a.family.trim())
          .map((a) => ({
            family: a.family.trim(),
            given: typeof a.given === 'string' ? a.given.trim() : '',
          }))
      : [];

    const authorsText = validAuthors
      .map((a) => (a.given ? `${a.family}, ${a.given}` : a.family))
      .join('; ');

    return {
      authorsText,
      metadata: {
        type: parsed.type || 'journal',
        title: parsed.title?.trim() || '',
        authors: validAuthors,
        year: parsed.year ? String(parsed.year).trim() : '',
        journal: parsed.journal?.trim() || '',
        volume: parsed.volume?.trim() || '',
        issue: parsed.issue?.trim() || '',
        pages: parsed.pages?.trim() || '',
        publisher: parsed.publisher?.trim() || '',
        siteName: parsed.siteName?.trim() || '',
        doi: parsed.doi?.trim() || '',
      },
    };
  }

  throw new Error('AI 解析無法使用');
}

/** 上傳 PDF 並自動萃取全文與書目欄位 */
export async function extractPdfTextAndMetadata(file: File): Promise<{
  metadata: Partial<ReferenceItem>;
  authorsText: string;
  fullText: string;
  methodUsed: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const maxPages = Math.min(pdf.numPages, 60);
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let pageStr = '';

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Array.isArray(item.transform) ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
        pageStr += '\n';
      } else if (pageStr && !pageStr.endsWith(' ') && !pageStr.endsWith('\n')) {
        pageStr += ' ';
      }
      pageStr += item.str;
      if (item.hasEOL) {
        pageStr += '\n';
      }
      if (y !== null) lastY = y;
    }

    pageTexts.push(`--- 第 ${pageNum} 頁 ---\n${pageStr.trim()}`);
  }

  const fullText = pageTexts.join('\n\n').slice(0, 80000);
  const firstPagesText = pageTexts.slice(0, 3).join('\n\n');

  // 步驟 1：檢查前兩頁是否有 DOI，若有則向 Crossref 抓最精準的期刊資料
  const doiMatch = pageTexts
    .slice(0, 2)
    .join('\n')
    .match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
  if (doiMatch) {
    const cleanDoi = doiMatch[0].replace(/[.,;)]+$/, '');
    try {
      const meta = await fetchMetadataByDOI(cleanDoi);
      const authorsText = (meta.authors || [])
        .map((a) => (a.given ? `${a.family}, ${a.given}` : a.family))
        .join('; ');
      return {
        metadata: meta,
        authorsText,
        fullText,
        methodUsed: '偵測到 PDF 內含 DOI，已自動從 Crossref 補齊書目',
      };
    } catch {
      // Crossref 查無此 DOI 時繼續往下用 AI 或規則解析
    }
  }

  // 步驟 2：若有設定 Gemini API Key，使用 AI 辨識中文／英文論文或碩博士論文封面
  const apiKey = getSavedGeminiKey();
  if (apiKey && firstPagesText.trim().length > 30) {
    try {
      const aiRes = await extractPdfWithGemini(apiKey, firstPagesText);
      if (aiRes.metadata.title) {
        return {
          ...aiRes,
          fullText,
          methodUsed: '已透過 Gemini AI 自動辨識 PDF 書目欄位',
        };
      }
    } catch {
      // AI 失敗則自動降級為內建規則辨識
    }
  }

  // 步驟 3：內建規則式辨識（博碩士論文封面與一般文件）
  const heuristic = parsePdfByHeuristics(firstPagesText, file.name);
  return {
    ...heuristic,
    fullText,
    methodUsed: '已從 PDF 萃取出文字並自動帶入基本欄位',
  };
}
