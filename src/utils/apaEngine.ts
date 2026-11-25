// src/utils/apaEngine.ts

export type ReferenceType = 'journal' | 'website' | 'thesis' | 'book';
export type ReadStatus = 'unread' | 'reading' | 'cited';
export type StanceTag = '支持論點' | '反方觀點' | '背景數據' | '研究方法參考';

export interface Author {
  family: string; // 英文姓氏，或中文全名（中文建議整串放 family，given 留空）
  given?: string; // 英文名字（如 "John David"）
}

export interface MatrixFields {
  target?: string;      // 研究對象
  sampleSize?: string;  // 樣本數
  method?: string;      // 研究方法
  findings?: string;    // 核心結果
  limitations?: string; // 研究限制
  [key: string]: string | undefined;
}

export interface ReferenceItem {
  id: string;
  projectId: string;
  type: ReferenceType;
  language?: 'zh' | 'en'; // 若未指定會自動偵測
  title: string;
  authors: Author[];
  year: string; // 如 "2024" 或 "n.d."
  // 期刊欄位
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  // 網頁 / 書籍 / 論文欄位
  url?: string;
  accessDate?: string; // YYYY-MM-DD（網站類用）
  siteName?: string;   // 機構或網站名稱
  publisher?: string;  // 出版社或學校系所
  // 管理與特色功能欄位
  status: ReadStatus;
  stanceTags: StanceTag[];
  pdfUrl?: string;
  quotes?: { text: string; note?: string; createdAt: string }[];
  matrix: MatrixFields;
  notes?: string;
  // 狀態警示
  isRetracted?: boolean;
  isPreprint?: boolean;
  createdAt: string;
}

/** 偵測是否為中文文獻（標題或第一位作者含中文字元） */
export function detectLanguage(item: Pick<ReferenceItem, 'title' | 'authors' | 'language'>): 'zh' | 'en' {
  if (item.language) return item.language;
  const cjkRegex = /[\u4e00-\u9fff]/;
  const firstAuthor = item.authors[0]?.family || '';
  return cjkRegex.test(item.title) || cjkRegex.test(firstAuthor) ? 'zh' : 'en';
}

/** 格式化單一英文作者為 "Last, F. M." */
function formatEnAuthor(author: Author): string {
  const family = author.family.trim();
  if (!author.given?.trim()) return family;
  const initials = author.given
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ');
  return `${family}, ${initials}`;
}

/** 格式化參考文獻列表的作者群（APA 7th） */
function formatAuthorsList(authors: Author[], lang: 'zh' | 'en'): string {
  if (!authors.length) return lang === 'zh' ? '無作者' : 'Anonymous';

  if (lang === 'zh') {
    const names = authors.map((a) => `${a.family}${a.given || ''}`.trim());
    if (names.length <= 20) return names.join('、');
    return `${names.slice(0, 19).join('、')}……${names[names.length - 1]}`;
  } else {
    const names = authors.map(formatEnAuthor);
    if (names.length === 1) return names[0];
    if (names.length <= 20) {
      return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
    }
    return `${names.slice(0, 19).join(', ')}, ... ${names[names.length - 1]}`;
  }
}

/** 產出文中引用：括弧引用 vs. 敘述引用 */
export function formatInTextCitation(
  item: ReferenceItem,
  style: 'parenthetical' | 'narrative'
): string {
  const lang = detectLanguage(item);
  const year = item.year || (lang === 'zh' ? '無日期' : 'n.d.');
  const authors = item.authors;

  if (!authors.length) {
    const shortTitle = item.title.slice(0, 15);
    return lang === 'zh'
      ? style === 'parenthetical' ? `（${shortTitle}，${year}）` : `${shortTitle}（${year}）`
      : style === 'parenthetical' ? `("${shortTitle}," ${year})` : `"${shortTitle}" (${year})`;
  }

  if (lang === 'zh') {
    const names = authors.map((a) => `${a.family}${a.given || ''}`.trim());
    if (names.length === 1) {
      return style === 'parenthetical' ? `（${names[0]}，${year}）` : `${names[0]}（${year}）`;
    }
    if (names.length === 2) {
      return style === 'parenthetical'
        ? `（${names[0]}、${names[1]}，${year}）`
        : `${names[0]}與${names[1]}（${year}）`;
    }
    return style === 'parenthetical'
      ? `（${names[0]}等人，${year}）`
      : `${names[0]}等人（${year}）`;
  } else {
    const families = authors.map((a) => a.family.trim());
    if (families.length === 1) {
      return style === 'parenthetical' ? `(${families[0]}, ${year})` : `${families[0]} (${year})`;
    }
    if (families.length === 2) {
      return style === 'parenthetical'
        ? `(${families[0]} & ${families[1]}, ${year})`
        : `${families[0]} and ${families[1]} (${year})`;
    }
    return style === 'parenthetical'
      ? `(${families[0]} et al., ${year})`
      : `${families[0]} et al. (${year})`;
  }
}

/** 產出完整 APA 7th 參考文獻（回傳含 <i> 斜體的 HTML 與純文字） */
export function formatApaReference(item: ReferenceItem): { html: string; plain: string } {
  const lang = detectLanguage(item);
  const authorsStr = formatAuthorsList(item.authors, lang);
  const year = item.year || (lang === 'zh' ? '無日期' : 'n.d.');
  const doiLink = item.doi ? (item.doi.startsWith('http') ? item.doi : `https://doi.org/${item.doi}`) : '';

  let html = '';

  if (lang === 'zh') {
    if (item.type === 'journal') {
      const volIssue = item.volume
        ? `<i>${item.volume}</i>${item.issue ? `（${item.issue}）` : ''}`
        : '';
      const pages = item.pages ? `，${item.pages}` : '';
      html = `${authorsStr}（${year}）。${item.title}。<i>${item.journal || ''}</i>${volIssue ? `，${volIssue}` : ''}${pages}。${doiLink ? ` ${doiLink}` : ''}`;
    } else if (item.type === 'website') {
      const site = item.siteName ? `${item.siteName}。` : '';
      html = `${authorsStr}（${year}）。<i>${item.title}</i>。${site}${item.url ? ` ${item.url}` : ''}`;
    } else if (item.type === 'thesis') {
      html = `${authorsStr}（${year}）。<i>${item.title}</i>〔未出版之博碩士論文〕。${item.publisher || ''}。`;
    } else {
      html = `${authorsStr}（${year}）。<i>${item.title}</i>。${item.publisher || ''}。`;
    }
  } else {
    if (item.type === 'journal') {
      const volIssue = item.volume
        ? `<i>${item.volume}</i>${item.issue ? `(${item.issue})` : ''}`
        : '';
      const pages = item.pages ? `, ${item.pages}` : '';
      html = `${authorsStr} (${year}). ${item.title}. <i>${item.journal || ''}</i>${volIssue ? `, ${volIssue}` : ''}${pages}.${doiLink ? ` ${doiLink}` : ''}`;
    } else if (item.type === 'website') {
      const site = item.siteName ? `${item.siteName}. ` : '';
      html = `${authorsStr} (${year}). <i>${item.title}</i>. ${site}${item.url || ''}`;
    } else if (item.type === 'thesis') {
      html = `${authorsStr} (${year}). <i>${item.title}</i> [Unpublished thesis]. ${item.publisher || ''}.`;
    } else {
      html = `${authorsStr} (${year}). <i>${item.title}</i>. ${item.publisher || ''}.`;
    }
  }

  const plain = html.replace(/<\/?i>/g, '').trim();
  return { html: html.trim(), plain };
}

/** 排序：中文文獻在前（依繁中筆畫），英文文獻在後（依 A-Z） */
export function sortReferencesBilingual(items: ReferenceItem[]): ReferenceItem[] {
  return [...items].sort((a, b) => {
    const langA = detectLanguage(a);
    const langB = detectLanguage(b);
    if (langA !== langB) return langA === 'zh' ? -1 : 1;

    const keyA = a.authors[0]?.family || a.title;
    const keyB = b.authors[0]?.family || b.title;

    if (langA === 'zh') {
      return keyA.localeCompare(keyB, 'zh-Hant-TW-u-co-stroke');
    }
    return keyA.localeCompare(keyB, 'en', { sensitivity: 'base' });
  });
}

/** 防呆檢查：回傳缺少的必要欄位名稱 */
export function getMissingFields(item: ReferenceItem): string[] {
  const missing: string[] = [];
  if (!item.title?.trim()) missing.push('標題');
  if (!item.authors?.length) missing.push('作者');
  if (!item.year?.trim()) missing.push('年份');

  if (item.type === 'journal') {
    if (!item.journal) missing.push('期刊名稱');
    if (!item.volume) missing.push('卷數');
    if (!item.pages && !item.doi) missing.push('頁碼或 DOI');
  } else if (item.type === 'website') {
    if (!item.url) missing.push('網址');
    if (!item.accessDate) missing.push('存取日期');
  }
  return missing;
}

/** 富文本複製（貼進 Word / Google Docs 可保留斜體與懸掛縮排） */
export async function copyRichText(htmlContent: string, plainText: string): Promise<void> {
  const styledHtml = `<div style="font-family: 'Times New Roman', 'PMingLiU', serif; font-size: 12pt; line-height: 1.5; padding-left: 2em; text-indent: -2em;">${htmlContent}</div>`;
  try {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      const htmlBlob = new Blob([styledHtml], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
      ]);
      return;
    }
  } catch {
    // 若瀏覽器不支援 ClipboardItem，自動降級為純文字複製
  }
  await navigator.clipboard.writeText(plainText);
}

/** 透過 Crossref API 以 DOI 抓取書目，並偵測撤稿／預印本狀態 */
export async function fetchMetadataByDOI(rawDoi: string): Promise<Partial<ReferenceItem>> {
  const cleanDoi = rawDoi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`);
  if (!res.ok) throw new Error('找不到此 DOI，請確認編號是否正確');

  const { message } = await res.json();
  const title: string = Array.isArray(message.title) ? message.title[0] : message.title || '';
  const authors: Author[] = (message.author || []).map((a: { family?: string; given?: string }) => ({
    family: a.family || '',
    given: a.given || '',
  }));

  const dateParts =
    message['published-print']?.['date-parts']?.[0] ||
    message['published-online']?.['date-parts']?.[0] ||
    message.issued?.['date-parts']?.[0];
  const year = dateParts?.[0] ? String(dateParts[0]) : '';

  const isRetracted =
    /retract/i.test(title) ||
    Boolean(message['update-to']?.some((u: { type?: string }) => u.type === 'retraction')) ||
    Boolean(message.relation?.['is-retracted-by']);

  const isPreprint = message.type === 'posted-content';

  return {
    type: 'journal',
    title,
    authors,
    year,
    journal: message['container-title']?.[0] || '',
    volume: message.volume || '',
    issue: message.issue || '',
    pages: message.page || '',
    doi: cleanDoi,
    url: message.URL || `https://doi.org/${cleanDoi}`,
    isRetracted,
    isPreprint,
  };
}