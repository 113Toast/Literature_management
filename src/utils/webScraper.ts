import type { Author, ReferenceItem, ReferenceType } from './apaEngine';

export interface ScrapedWebResult {
  detectedSite: string;
  metadata: Partial<ReferenceItem>;
  authorsText: string;
  snapshotText: string;
}

export function parseWesternYear(raw?: string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  const adMatch = s.match(/\b(19\d{2}|20\d{2})\b/);
  if (adMatch) return adMatch[1];

  const rocMatch = s.match(/(?:民國\s*)?(\d{2,3})\s*(?:年|學年度|[./-]|$)/);
  if (rocMatch) {
    const num = parseInt(rocMatch[1], 10);
    if (num >= 60 && num <= 200) return String(num + 1911);
  }
  return '';
}

function cleanTitleSuffix(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .replace(
      /\s*[-–—|｜::]\s*(臺灣博碩士論文知識加值系統|華藝線上圖書館|Airiti Library|聯合新聞網|自由時報電子報|中時新聞網|中央社\s*CNA|ETtoday新聞雲|風傳媒|關鍵評論網|報導者|衛生福利部.*|全國法規資料庫).*$/i,
      ''
    )
    .trim();
}

function splitAuthorsToArray(authorsText: string): Author[] {
  return authorsText
    .split(/[;；、]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [family, given] = p.split(',').map((x) => x.trim());
      return { family, given };
    });
}

export function parseHtmlDocument(doc: Document, pageUrl: string): ScrapedWebResult {
  let host = '';
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    host = '';
  }

  const getMeta = (names: string[]): string => {
    for (const n of names) {
      const el =
        doc.querySelector(`meta[name="${n}" i]`) ||
        doc.querySelector(`meta[property="${n}" i]`);
      const content = el?.getAttribute('content')?.trim();
      if (content) return content;
    }
    return '';
  };

  const rawText = (doc.body?.textContent || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 25000);

  const today = new Date().toISOString().slice(0, 10);

  // ============================================================
  // 1. 臺灣博碩士論文知識加值系統 (ndltd.ncl.edu.tw)
  // ============================================================
  if (
    host.includes('ndltd.ncl.edu.tw') ||
    rawText.includes('臺灣博碩士論文知識加值系統')
  ) {
    const fieldMap: Record<string, string> = {};
    doc.querySelectorAll('tr').forEach((tr) => {
      const cells = tr.querySelectorAll('th, td');
      if (cells.length >= 2) {
        const key = (cells[0].textContent || '').replace(/[:：\s\u00a0]/g, '');
        const val = (cells[1].textContent || '').trim();
        if (key && val && !fieldMap[key]) {
          fieldMap[key] = val;
        }
      }
    });

    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const m = line.match(
        /^(論文名稱|研究生|作者|校院名稱|系所名稱|畢業學年度|出版年|學位類別|論文出版年)\s*[:：]\s*(.+)$/
      );
      if (m && !fieldMap[m[1]]) {
        fieldMap[m[1]] = m[2].trim();
      }
    }

    let thesisTitle =
      fieldMap['論文名稱'] ||
      getMeta(['citation_title', 'og:title']) ||
      cleanTitleSuffix(doc.title || '');
    if (thesisTitle.includes('\n')) {
      const parts = thesisTitle
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      if (parts.length > 0) thesisTitle = parts[0];
    }

    const authorsText = (
      fieldMap['研究生'] ||
      fieldMap['作者'] ||
      getMeta(['citation_author']) ||
      ''
    )
      .replace(/[\r\n]+/g, '、')
      .trim();

    const school = (fieldMap['校院名稱'] || '').trim();
    const dept = (fieldMap['系所名稱'] || '').trim();
    const publisher =
      `${school}${dept}`.trim() ||
      getMeta(['citation_dissertation_institution']);

    const year = parseWesternYear(
      fieldMap['出版年'] ||
        fieldMap['論文出版年'] ||
        fieldMap['畢業學年度'] ||
        getMeta(['citation_date'])
    );

    return {
      detectedSite: '臺灣博碩士論文知識加值系統',
      authorsText,
      snapshotText: rawText,
      metadata: {
        type: 'thesis',
        title: thesisTitle,
        authors: splitAuthorsToArray(authorsText),
        year,
        publisher,
        url: pageUrl,
      },
    };
  }

  // ============================================================
  // 2. 華藝線上圖書館 (airitilibrary.com)
  // ============================================================
  if (host.includes('airitilibrary.com')) {
    const authorEls = Array.from(
      doc.querySelectorAll('meta[name="citation_author" i]')
    );
    const metaAuthors = authorEls
      .map((el) => el.getAttribute('content')?.trim())
      .filter((x): x is string => Boolean(x));

    const fieldMap: Record<string, string> = {};
    doc.querySelectorAll('tr, li, div').forEach((el) => {
      const txt = (el.textContent || '').trim();
      const m = txt.match(/^(作者|刊名|期刊名稱|卷期頁|出版年|DOI)\s*[:：]\s*(.+)$/);
      if (m && !fieldMap[m[1]] && m[2].length < 200) {
        fieldMap[m[1]] = m[2].trim();
      }
    });

    const title =
      getMeta(['citation_title', 'og:title']) ||
      cleanTitleSuffix(doc.title || '');
    const authorsText = metaAuthors.length
      ? metaAuthors.join('；')
      : (fieldMap['作者'] || '').replace(/[,，;；]/g, '、');
    const journal =
      getMeta(['citation_journal_title']) ||
      fieldMap['刊名'] ||
      fieldMap['期刊名稱'] ||
      '';
    const year = parseWesternYear(
      getMeta(['citation_publication_date', 'citation_date']) || fieldMap['出版年']
    );
    const doi = getMeta(['citation_doi']) || fieldMap['DOI'] || '';
    const firstPage = getMeta(['citation_firstpage']);
    const lastPage = getMeta(['citation_lastpage']);

    return {
      detectedSite: '華藝線上圖書館 (Airiti)',
      authorsText,
      snapshotText: rawText,
      metadata: {
        type: 'journal',
        title,
        authors: splitAuthorsToArray(authorsText),
        year,
        journal,
        volume: getMeta(['citation_volume']),
        issue: getMeta(['citation_issue']),
        pages:
          firstPage && lastPage
            ? `${firstPage}-${lastPage}`
            : firstPage || '',
        doi,
        url: pageUrl,
      },
    };
  }

  // ============================================================
  // 3. JSON-LD 結構化資料（新聞報導、部落格、學術文章）
  // ============================================================
  let ldTitle = '';
  let ldAuthors: string[] = [];
  let ldYear = '';
  let ldPublisher = '';
  let ldType: ReferenceType | '' = '';

  const flattenLd = (node: unknown): Record<string, unknown>[] => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(flattenLd);
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) {
      return [obj, ...obj['@graph'].flatMap(flattenLd)];
    }
    return [obj];
  };

  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const parsed = JSON.parse(s.textContent || '');
      const items = flattenLd(parsed);
      for (const item of items) {
        const rawType = item['@type'];
        const t = Array.isArray(rawType) ? rawType.join(',') : String(rawType || '');
        if (/Article|NewsArticle|BlogPosting|Report|ScholarlyArticle|Thesis|WebPage/i.test(t)) {
          if (!ldTitle && (item.headline || item.name)) {
            ldTitle = String(item.headline || item.name).trim();
          }
          if (!ldYear && (item.datePublished || item.dateCreated || item.dateModified)) {
            ldYear = parseWesternYear(
              String(item.datePublished || item.dateCreated || item.dateModified)
            );
          }
          const pub = item.publisher as { name?: string } | undefined;
          if (!ldPublisher && pub?.name) {
            ldPublisher = String(pub.name).trim();
          }
          if (item.author && ldAuthors.length === 0) {
            const arr = Array.isArray(item.author) ? item.author : [item.author];
            ldAuthors = arr
              .map((a) =>
                typeof a === 'string'
                  ? a
                  : typeof a === 'object' && a !== null && 'name' in a
                  ? String((a as { name?: string }).name || '')
                  : ''
              )
              .map((n) => n.trim())
              .filter(Boolean);
          }
          if (/ScholarlyArticle/i.test(t)) ldType = 'journal';
          if (/Thesis/i.test(t)) ldType = 'thesis';
        }
      }
    } catch {
      // 忽略單一 JSON-LD 區塊錯誤
    }
  });

  // ============================================================
  // 4. Meta 標籤與一般網頁 / 政府公告 / 新聞 / 部落格備援
  // ============================================================
  const citationAuthorEls = Array.from(
    doc.querySelectorAll('meta[name="citation_author" i]')
  );
  const citationAuthors = citationAuthorEls
    .map((el) => el.getAttribute('content')?.trim())
    .filter((x): x is string => Boolean(x));

  const metaAuthor = getMeta(['author', 'dc.creator', 'article:author']);
  let domAuthor = '';
  if (!citationAuthors.length && !ldAuthors.length && !metaAuthor) {
    const authorEl = doc.querySelector(
      '[rel="author"], .author-name, .article-content__author, .byline'
    );
    if (authorEl) {
      domAuthor = (authorEl.textContent || '')
        .replace(/^(記者|文／|作者：|撰文／)\s*/g, '')
        .replace(/[／/].*$/, '')
        .trim();
      if (domAuthor.length > 25) domAuthor = '';
    }
  }

  let doi = getMeta(['citation_doi', 'dc.identifier', 'prism.doi']);
  if (!doi) {
    const m = rawText.slice(0, 5000).match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
    if (m) doi = m[0].replace(/[.,;)]+$/, '');
  }

  const journalTitle = getMeta(['citation_journal_title', 'prism.publicationName']);
  const rawPageTitle =
    getMeta(['citation_title', 'og:title']) || ldTitle || doc.title || '';
  const cleanedTitle = cleanTitleSuffix(rawPageTitle);
  const siteName =
    getMeta(['og:site_name', 'application-name']) || ldPublisher || host;

  let year = parseWesternYear(
    getMeta([
      'citation_publication_date',
      'citation_date',
      'article:published_time',
      'dc.date',
      'pubdate',
    ]) || ldYear
  );
  if (!year) {
    const headText = rawText.slice(0, 800);
    const pubMatch = headText.match(
      /(?:發布日期|刊登日期|更新日期|日期)\s*[:：]?\s*([^\n]{4,20})/
    );
    if (pubMatch) year = parseWesternYear(pubMatch[1]);
    if (!year) year = parseWesternYear(headText);
  }

  let finalType: ReferenceType = ldType || (journalTitle ? 'journal' : 'website');
  let authorsText = citationAuthors.length
    ? citationAuthors.join('；')
    : ldAuthors.length
    ? ldAuthors.join('；')
    : metaAuthor || domAuthor;
  let finalSiteName = siteName;
  let detectedSite = '';

  if (host.endsWith('.gov.tw') || host.includes('.gov.tw')) {
    detectedSite = '政府機關網站';
    finalType = 'website';
    if (!authorsText && siteName && !siteName.includes('.gov.tw')) {
      authorsText = siteName;
      finalSiteName = '';
    }
  } else if (journalTitle) {
    detectedSite = '學術期刊網頁';
  } else if (ldAuthors.length || domAuthor) {
    detectedSite = '新聞報導／部落格文章';
  }

  const firstPage = getMeta(['citation_firstpage']);
  const lastPage = getMeta(['citation_lastpage']);

  const metadata: Partial<ReferenceItem> = {
    type: finalType,
    title: cleanedTitle,
    authors: splitAuthorsToArray(authorsText),
    year: year || String(new Date().getFullYear()),
    doi: doi || undefined,
    url: pageUrl,
  };

  if (finalType === 'journal') {
    metadata.journal = journalTitle;
    metadata.volume = getMeta(['citation_volume']);
    metadata.issue = getMeta(['citation_issue']);
    metadata.pages =
      firstPage && lastPage ? `${firstPage}-${lastPage}` : firstPage || '';
  } else {
    metadata.siteName = finalSiteName;
    metadata.accessDate = today;
  }

  return {
    detectedSite,
    metadata,
    authorsText,
    snapshotText: rawText,
  };
}

/** 透過公開 CORS Proxy 抓取網頁原始碼並自動解析（支援手機、平板與無擴充功能環境） */
export async function fetchAndParseUrl(rawUrl: string): Promise<ScrapedWebResult> {
  const url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('請輸入以 http:// 或 https:// 開頭的完整網址');
  }

  let html = '';

  // 代理 1：allorigins
  try {
    const res1 = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    );
    if (res1.ok) {
      const json = await res1.json();
      if (typeof json?.contents === 'string' && json.contents.length > 100) {
        html = json.contents;
      }
    }
  } catch {
    // 改用備援代理
  }

  // 代理 2：corsproxy.io
  if (!html) {
    try {
      const res2 = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
      if (res2.ok) {
        html = await res2.text();
      }
    } catch {
      // 兩個代理皆失敗
    }
  }

  if (!html) {
    throw new Error(
      '此網站有防爬蟲保護，無法從網頁直接讀取；建議在電腦使用 Chrome 擴充功能「文獻庫助手」一鍵抓取'
    );
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return parseHtmlDocument(doc, url);
}
