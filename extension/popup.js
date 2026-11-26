const WEB_APP_URL = 'https://113toast.github.io/Literature_management/';

const $ = (id) => document.getElementById(id);

let pageSnapshotText = '';
let extraJournalMeta = { volume: '', issue: '', pages: '' };
let activeAuth = null;

function showMsg(type, text) {
  const box = $('msgBox');
  box.className = 'msg ' + type;
  box.textContent = text;
}

function updateSourceLabel(type) {
  const lbl = $('sourceLabelText');
  const inp = $('sourceInput');
  if (type === 'journal') {
    lbl.textContent = '期刊名稱';
    inp.placeholder = '例如：臺灣公共衛生雜誌';
  } else if (type === 'thesis') {
    lbl.textContent = '學校系所（校院名稱＋系所名稱）';
    inp.placeholder = '例如：嘉南藥理大學藥學系';
  } else if (type === 'book') {
    lbl.textContent = '出版社';
    inp.placeholder = '例如：五南圖書';
  } else {
    lbl.textContent = '網站或機構名稱（若已填為作者可留空）';
    inp.placeholder = '例如：衛生福利部';
  }
}

function parseAuthors(str) {
  return str
    .split(/[;；、]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const parts = p.split(',').map((x) => x.trim());
      return { family: parts[0] || '', given: parts[1] || '' };
    });
}

async function getValidAuth() {
  const stored = await chrome.storage.local.get(['litlibConn']);
  const conn = stored.litlibConn;
  if (!conn || !conn.supabaseUrl || !conn.supabaseAnonKey || !conn.refreshToken) {
    return null;
  }

  try {
    const res = await fetch(`${conn.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: conn.supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: conn.refreshToken }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const updated = {
      supabaseUrl: conn.supabaseUrl,
      supabaseAnonKey: conn.supabaseAnonKey,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || conn.refreshToken,
      userId: data.user?.id || conn.userId,
      email: data.user?.email || conn.email || '',
    };
    await chrome.storage.local.set({ litlibConn: updated });
    return updated;
  } catch {
    return null;
  }
}

async function loadCloudProjects(auth) {
  const res = await fetch(
    `${auth.supabaseUrl}/rest/v1/projects?select=id,name,invite_code&order=created_at.asc`,
    {
      headers: {
        apikey: auth.supabaseAnonKey,
        Authorization: `Bearer ${auth.accessToken}`,
      },
    }
  );
  if (!res.ok) throw new Error('無法讀取專案清單');
  const projects = await res.json();
  const select = $('projectSelect');
  select.innerHTML = '';
  if (!projects.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '（尚無雲端專案，請先在網站建立）';
    select.appendChild(opt);
    return;
  }
  const lastProj = (await chrome.storage.local.get(['lastProjectId'])).lastProjectId;
  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.invite_code ? `${p.name}（邀請碼：${p.invite_code}）` : p.name;
    if (p.id === lastProj) opt.selected = true;
    select.appendChild(opt);
  }
}

async function scrapeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  $('urlInput').value = tab.url || '';
  $('titleInput').value = tab.title || '';
  $('accessDateInput').value = new Date().toISOString().slice(0, 10);

  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const href = location.href;
        const host = location.hostname.toLowerCase();

        const getMeta = (names) => {
          for (const n of names) {
            const el =
              document.querySelector(`meta[name="${n}" i]`) ||
              document.querySelector(`meta[property="${n}" i]`);
            if (el && el.getAttribute('content')) {
              return el.getAttribute('content').trim();
            }
          }
          return '';
        };

        const parseYear = (raw) => {
          if (!raw) return '';
          const s = String(raw).trim();
          // 西元 4 位數年份
          const adMatch = s.match(/\b(19\d{2}|20\d{2})\b/);
          if (adMatch) return adMatch[1];
          // 民國年（例如 114、115年、民國114年）
          const rocMatch = s.match(/(?:民國\s*)?(\d{2,3})\s*(?:年|學年度|[./-]|$)/);
          if (rocMatch) {
            const num = parseInt(rocMatch[1], 10);
            if (num >= 60 && num <= 200) return String(num + 1911);
          }
          return '';
        };

        const cleanTitleSuffix = (rawTitle) => {
          if (!rawTitle) return '';
          return rawTitle
            .replace(/\s*[-–—|｜::]\s*(臺灣博碩士論文知識加值系統|華藝線上圖書館|Airiti Library|聯合新聞網|自由時報電子報|中時新聞網|中央社\s*CNA|ETtoday新聞雲|風傳媒|關鍵評論網|報導者|衛生福利部.*|全國法規資料庫).*$/i, '')
            .trim();
        };

        const rawText = (document.body?.innerText || '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 20000);

        // ============================================================
        // 1. 專屬解析：臺灣博碩士論文知識加值系統 (ndltd.ncl.edu.tw)
        // ============================================================
        if (host.includes('ndltd.ncl.edu.tw') || document.body?.innerText?.includes('臺灣博碩士論文知識加值系統')) {
          const fieldMap = {};
          document.querySelectorAll('tr').forEach((tr) => {
            const cells = tr.querySelectorAll('th, td');
            if (cells.length >= 2) {
              const key = (cells[0].innerText || '').replace(/[:：\s\u00a0]/g, '');
              const val = (cells[1].innerText || '').trim();
              if (key && val && !fieldMap[key]) {
                fieldMap[key] = val;
              }
            }
          });

          // 從純文字逐行備援抓取（避免表格巢狀結構漏抓）
          const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
          for (const line of lines) {
            const m = line.match(/^(論文名稱|研究生|作者|校院名稱|系所名稱|畢業學年度|出版年|學位類別|論文出版年)\s*[:：]\s*(.+)$/);
            if (m && !fieldMap[m[1]]) {
              fieldMap[m[1]] = m[2].trim();
            }
          }

          let thesisTitle = fieldMap['論文名稱'] || getMeta(['citation_title', 'og:title']) || cleanTitleSuffix(document.title);
          // 若論文名稱同時包含中文與英文（換行分隔），優先保留中文標題
          if (thesisTitle.includes('\n')) {
            const parts = thesisTitle.split('\n').map((x) => x.trim()).filter(Boolean);
            if (parts.length > 0) thesisTitle = parts[0];
          }

          const author = (fieldMap['研究生'] || fieldMap['作者'] || getMeta(['citation_author']) || '')
            .replace(/[\r\n]+/g, '、')
            .trim();
          const school = (fieldMap['校院名稱'] || '').trim();
          const dept = (fieldMap['系所名稱'] || '').trim();
          const publisher = `${school}${dept}`.trim() || getMeta(['citation_dissertation_institution']);
          const year = parseYear(fieldMap['出版年'] || fieldMap['論文出版年'] || fieldMap['畢業學年度'] || getMeta(['citation_date']));

          return {
            detectedSite: '臺灣博碩士論文知識加值系統',
            type: 'thesis',
            title: thesisTitle,
            authors: author,
            year,
            source: publisher,
            volume: '',
            issue: '',
            pages: '',
            doi: '',
            snapshotText: rawText,
          };
        }

        // ============================================================
        // 2. 專屬解析：華藝線上圖書館 (airitilibrary.com)
        // ============================================================
        if (host.includes('airitilibrary.com')) {
          const authorEls = Array.from(document.querySelectorAll('meta[name="citation_author" i]'));
          const metaAuthors = authorEls.map((el) => el.getAttribute('content')?.trim()).filter(Boolean);

          const fieldMap = {};
          document.querySelectorAll('tr, li, div').forEach((el) => {
            const txt = (el.innerText || '').trim();
            const m = txt.match(/^(作者|刊名|期刊名稱|卷期頁|出版年|DOI)\s*[:：]\s*(.+)$/);
            if (m && !fieldMap[m[1]] && m[2].length < 200) {
              fieldMap[m[1]] = m[2].trim();
            }
          });

          const title = getMeta(['citation_title', 'og:title']) || cleanTitleSuffix(document.title);
          const authors = metaAuthors.length
            ? metaAuthors.join('；')
            : (fieldMap['作者'] || '').replace(/[,，;；]/g, '、');
          const journal = getMeta(['citation_journal_title']) || fieldMap['刊名'] || fieldMap['期刊名稱'] || '';
          const year = parseYear(getMeta(['citation_publication_date', 'citation_date']) || fieldMap['出版年']);
          const doi = getMeta(['citation_doi']) || fieldMap['DOI'] || '';
          const firstPage = getMeta(['citation_firstpage']);
          const lastPage = getMeta(['citation_lastpage']);

          return {
            detectedSite: '華藝線上圖書館 (Airiti)',
            type: 'journal',
            title,
            authors,
            year,
            source: journal,
            volume: getMeta(['citation_volume']),
            issue: getMeta(['citation_issue']),
            pages: firstPage && lastPage ? `${firstPage}-${lastPage}` : firstPage || '',
            doi,
            snapshotText: rawText,
          };
        }

        // ============================================================
        // 3. 解析 JSON-LD 結構化資料（新聞報導、部落格、學術網頁通用）
        // ============================================================
        let ldTitle = '';
        let ldAuthors = [];
        let ldYear = '';
        let ldPublisher = '';
        let ldType = '';

        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        const flattenLd = (node) => {
          if (!node || typeof node !== 'object') return [];
          if (Array.isArray(node)) return node.flatMap(flattenLd);
          if (Array.isArray(node['@graph'])) return [node, ...node['@graph'].flatMap(flattenLd)];
          return [node];
        };

        for (const s of scripts) {
          try {
            const parsed = JSON.parse(s.textContent || '');
            const items = flattenLd(parsed);
            for (const item of items) {
              const t = Array.isArray(item['@type']) ? item['@type'].join(',') : String(item['@type'] || '');
              if (/Article|NewsArticle|BlogPosting|Report|ScholarlyArticle|Thesis|WebPage/i.test(t)) {
                if (!ldTitle && (item.headline || item.name)) {
                  ldTitle = String(item.headline || item.name).trim();
                }
                if (!ldYear && (item.datePublished || item.dateCreated || item.dateModified)) {
                  ldYear = parseYear(item.datePublished || item.dateCreated || item.dateModified);
                }
                if (!ldPublisher && item.publisher?.name) {
                  ldPublisher = String(item.publisher.name).trim();
                }
                if (item.author && ldAuthors.length === 0) {
                  const arr = Array.isArray(item.author) ? item.author : [item.author];
                  ldAuthors = arr
                    .map((a) => (typeof a === 'string' ? a : a?.name || ''))
                    .map((n) => n.trim())
                    .filter(Boolean);
                }
                if (/ScholarlyArticle/i.test(t)) ldType = 'journal';
                if (/Thesis/i.test(t)) ldType = 'thesis';
              }
            }
          } catch {}
        }

        // ============================================================
        // 4. Meta 標籤與一般網頁 / 政府公告 / 新聞 / 部落格備援
        // ============================================================
        const citationAuthorEls = Array.from(document.querySelectorAll('meta[name="citation_author" i]'));
        const citationAuthors = citationAuthorEls
          .map((el) => el.getAttribute('content')?.trim())
          .filter(Boolean);

        const metaAuthor = getMeta(['author', 'dc.creator', 'article:author']);
        let domAuthor = '';
        if (!citationAuthors.length && !ldAuthors.length && !metaAuthor) {
          const authorEl = document.querySelector('[rel="author"], .author-name, .article-content__author, .byline');
          if (authorEl) {
            domAuthor = (authorEl.textContent || '')
              .replace(/^(記者|文／|作者：|撰文／)\s*/g, '')
              .replace(/[／/].*$/, '')
              .trim();
            if (domAuthor.length > 25) domAuthor = '';
          }
        }

        const doiMeta = getMeta(['citation_doi', 'dc.identifier', 'prism.doi']);
        let doi = doiMeta;
        if (!doi) {
          const bodySnippet = rawText.slice(0, 5000);
          const m = bodySnippet.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
          if (m) doi = m[0].replace(/[.,;)]+$/, '');
        }

        const journalTitle = getMeta(['citation_journal_title', 'prism.publicationName']);
        const rawPageTitle = getMeta(['citation_title', 'og:title']) || ldTitle || document.title || '';
        const cleanedTitle = cleanTitleSuffix(rawPageTitle);
        const siteName = getMeta(['og:site_name', 'application-name']) || ldPublisher || location.hostname;

        let year = parseYear(
          getMeta(['citation_publication_date', 'citation_date', 'article:published_time', 'dc.date', 'pubdate']) ||
            ldYear
        );
        if (!year) {
          // 從正文前 800 字找發布日期或民國年
          const headText = rawText.slice(0, 800);
          const pubMatch = headText.match(/(?:發布日期|刊登日期|更新日期|日期)\s*[:：]?\s*([^\n]{4,20})/);
          if (pubMatch) year = parseYear(pubMatch[1]);
          if (!year) year = parseYear(headText);
        }

        let finalType = ldType || (journalTitle ? 'journal' : 'website');
        let finalAuthors = citationAuthors.length
          ? citationAuthors.join('；')
          : ldAuthors.length
          ? ldAuthors.join('；')
          : metaAuthor || domAuthor;
        let finalSource = journalTitle || siteName;
        let detectedSite = '';

        // 政府機關網站 (.gov.tw)：若無個人作者，將機關名稱設為作者（符合 APA 7th 機構作者規範）
        if (host.endsWith('.gov.tw') || host.includes('.gov.tw')) {
          detectedSite = '政府機關網站';
          finalType = 'website';
          if (!finalAuthors && siteName && !siteName.includes('.gov.tw')) {
            finalAuthors = siteName;
            finalSource = '';
          }
        } else if (journalTitle) {
          detectedSite = '學術期刊網頁';
        } else if (ldAuthors.length || domAuthor) {
          detectedSite = '新聞報導／部落格文章';
        }

        const firstPage = getMeta(['citation_firstpage']);
        const lastPage = getMeta(['citation_lastpage']);

        return {
          detectedSite,
          type: finalType,
          title: cleanedTitle,
          authors: finalAuthors,
          year: year || String(new Date().getFullYear()),
          source: finalSource,
          volume: getMeta(['citation_volume']),
          issue: getMeta(['citation_issue']),
          pages: firstPage && lastPage ? `${firstPage}-${lastPage}` : firstPage || '',
          doi,
          snapshotText: rawText,
        };
      },
    });

    const info = results?.[0]?.result;
    if (!info) return;

    if (info.detectedSite) {
      const badge = $('siteBadge');
      badge.style.display = 'block';
      badge.textContent = `已自動辨識來源：${info.detectedSite}`;
    }

    if (info.type) {
      $('typeSelect').value = info.type;
      updateSourceLabel(info.type);
    }
    if (info.title) $('titleInput').value = info.title;
    if (info.authors) $('authorsInput').value = info.authors;
    if (info.year) $('yearInput').value = info.year;
    if (info.doi) $('doiInput').value = info.doi;
    $('sourceInput').value = info.source || '';

    extraJournalMeta = {
      volume: info.volume || '',
      issue: info.issue || '',
      pages: info.pages || '',
    };

    pageSnapshotText = info.snapshotText || '';
  } catch {
    // 受保護頁面無法注入腳本時保留基本標題與網址
  }
}

async function fetchDoiDetails() {
  const rawDoi = $('doiInput').value.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (!rawDoi) {
    showMsg('err', '請先輸入 DOI 編號');
    return;
  }
  $('fetchDoiBtn').disabled = true;
  $('fetchDoiBtn').textContent = '抓取中...';
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(rawDoi)}`);
    if (!res.ok) throw new Error('找不到此 DOI');
    const { message } = await res.json();
    const title = Array.isArray(message.title) ? message.title[0] : message.title || '';
    const authors = (message.author || [])
      .map((a) => (a.given ? `${a.family}, ${a.given}` : a.family))
      .filter(Boolean)
      .join('; ');
    const dateParts =
      message['published-print']?.['date-parts']?.[0] ||
      message['published-online']?.['date-parts']?.[0] ||
      message.issued?.['date-parts']?.[0];
    const year = dateParts?.[0] ? String(dateParts[0]) : '';

    $('typeSelect').value = 'journal';
    updateSourceLabel('journal');
    if (title) $('titleInput').value = title;
    if (authors) $('authorsInput').value = authors;
    if (year) $('yearInput').value = year;
    $('sourceInput').value = message['container-title']?.[0] || '';
    extraJournalMeta = {
      volume: message.volume || '',
      issue: message.issue || '',
      pages: message.page || '',
    };
    showMsg('ok', '已從 Crossref 補齊期刊書目！');
  } catch (e) {
    showMsg('err', e.message || '抓取 DOI 失敗');
  } finally {
    $('fetchDoiBtn').disabled = false;
    $('fetchDoiBtn').textContent = '補抓書目';
  }
}

async function saveToCloud() {
  if (!activeAuth) {
    showMsg('err', '尚未連接雲端帳號！請先點右上角「雲端連線設定」貼上連線碼，或按下方「改用網頁版手動新增」。');
    $('connectBox').classList.add('open');
    return;
  }

  const projectId = $('projectSelect').value;
  if (!projectId) {
    showMsg('err', '請先在文獻庫網站建立至少一個專案');
    return;
  }

  const title = $('titleInput').value.trim();
  if (!title) {
    showMsg('err', '請輸入文獻標題');
    return;
  }

  const type = $('typeSelect').value;
  const sourceVal = $('sourceInput').value.trim();
  const doi = $('doiInput').value.trim();
  const url = $('urlInput').value.trim();
  const includeSnapshot = $('snapshotCheck').checked;

  $('saveBtn').disabled = true;
  $('saveBtn').textContent = '儲存中...';

  try {
    await chrome.storage.local.set({ lastProjectId: projectId });

    const checkRes = await fetch(
      `${activeAuth.supabaseUrl}/rest/v1/lit_references?project_id=eq.${encodeURIComponent(projectId)}&select=id,data`,
      {
        headers: {
          apikey: activeAuth.supabaseAnonKey,
          Authorization: `Bearer ${activeAuth.accessToken}`,
        },
      }
    );
    if (checkRes.ok) {
      const existingRows = await checkRes.json();
      const dup = existingRows.find((row) => {
        const d = row.data || {};
        if (doi && d.doi && d.doi.toLowerCase() === doi.toLowerCase()) return true;
        if (url && d.url && d.url === url) return true;
        if (d.title && d.title.trim().toLowerCase() === title.toLowerCase()) return true;
        return false;
      });
      if (dup) {
        showMsg('err', `此專案已收錄過相同文獻：「${dup.data?.title || title}」`);
        return;
      }
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const refItem = {
      id,
      projectId,
      type,
      title,
      authors: parseAuthors($('authorsInput').value),
      year: $('yearInput').value.trim(),
      journal: type === 'journal' ? sourceVal : undefined,
      volume: type === 'journal' ? extraJournalMeta.volume : undefined,
      issue: type === 'journal' ? extraJournalMeta.issue : undefined,
      pages: type === 'journal' ? extraJournalMeta.pages : undefined,
      doi: doi || undefined,
      url: url || undefined,
      accessDate: type === 'website' ? $('accessDateInput').value.trim() : undefined,
      siteName: type === 'website' ? sourceVal : undefined,
      publisher: type === 'thesis' || type === 'book' ? sourceVal : undefined,
      status: 'unread',
      stanceTags: [],
      matrix: {},
      snapshotText: includeSnapshot && pageSnapshotText ? pageSnapshotText : undefined,
      snapshotDate: includeSnapshot && pageSnapshotText ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    const insertRes = await fetch(`${activeAuth.supabaseUrl}/rest/v1/lit_references`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: activeAuth.supabaseAnonKey,
        Authorization: `Bearer ${activeAuth.accessToken}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        id,
        project_id: projectId,
        data: refItem,
        updated_at: now,
        updated_by: activeAuth.userId || null,
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error(`儲存失敗（${insertRes.status}）：${errText}`);
    }

    showMsg('ok', '已成功儲存至雲端文獻庫！');
  } catch (err) {
    showMsg('err', err.message || '儲存時發生錯誤');
  } finally {
    $('saveBtn').disabled = false;
    $('saveBtn').textContent = '儲存至雲端文獻庫';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await scrapeActiveTab();

  $('toggleConnectBtn').addEventListener('click', () => {
    $('connectBox').classList.toggle('open');
  });

  $('typeSelect').addEventListener('change', (e) => {
    updateSourceLabel(e.target.value);
  });

  $('fetchDoiBtn').addEventListener('click', fetchDoiDetails);
  $('saveBtn').addEventListener('click', saveToCloud);

  $('webFallbackBtn').addEventListener('click', () => {
    const params = new URLSearchParams({
      url: $('urlInput').value.trim(),
      title: $('titleInput').value.trim(),
    });
    chrome.tabs.create({ url: `${WEB_APP_URL}?${params.toString()}` });
  });

  $('saveConnBtn').addEventListener('click', async () => {
    try {
      const raw = $('tokenInput').value.trim();
      const parsed = JSON.parse(raw);
      if (!parsed.supabaseUrl || !parsed.supabaseAnonKey || !parsed.refreshToken) {
        throw new Error('連線碼格式不完整，請確認有完整複製');
      }
      await chrome.storage.local.set({ litlibConn: parsed });
      activeAuth = await getValidAuth();
      if (!activeAuth) throw new Error('連線碼已過期或無效，請回網站重新複製');
      $('connStatus').className = 'badge-ok';
      $('connStatus').textContent = `已連線：${activeAuth.email || '雲端帳號'}`;
      $('connectBox').classList.remove('open');
      $('tokenInput').value = '';
      await loadCloudProjects(activeAuth);
      showMsg('ok', '雲端連線成功！');
    } catch (e) {
      showMsg('err', e.message || '無法解析連線碼');
    }
  });

  $('clearConnBtn').addEventListener('click', async () => {
    await chrome.storage.local.remove(['litlibConn']);
    activeAuth = null;
    $('connStatus').className = 'badge-warn';
    $('connStatus').textContent = '已清除連線';
  });

  activeAuth = await getValidAuth();
  if (activeAuth) {
    $('connStatus').className = 'badge-ok';
    $('connStatus').textContent = `已連線：${activeAuth.email || '雲端帳號'}`;
    try {
      await loadCloudProjects(activeAuth);
    } catch (e) {
      showMsg('err', e.message);
    }
  }
});
