const WEB_APP_URL = 'https://113toast.github.io/Literature_management/';

const $ = (id) => document.getElementById(id);

let pageSnapshotText = '';
let extraJournalMeta = { volume: '', issue: '', pages: '' };
let activeAuth = null; // { supabaseUrl, supabaseAnonKey, accessToken, refreshToken, userId, email }

function showMsg(type, text) {
  const box = $('msgBox');
  box.className = 'msg ' + type;
  box.textContent = text;
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

  // 使用 refresh_token 換取最新有效的 access_token
  try {
    const res = await fetch(`${conn.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: conn.supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: conn.refreshToken }),
    });

    if (!res.ok) {
      return null;
    }

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

        const authorEls = Array.from(document.querySelectorAll('meta[name="citation_author" i]'));
        const citationAuthors = authorEls
          .map((el) => el.getAttribute('content')?.trim())
          .filter(Boolean);

        const doiMeta = getMeta(['citation_doi', 'dc.identifier', 'prism.doi']);
        let doi = doiMeta;
        if (!doi) {
          const bodySnippet = (document.body?.innerText || '').slice(0, 5000);
          const m = bodySnippet.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
          if (m) doi = m[0].replace(/[.,;)]+$/, '');
        }

        const rawText = (document.body?.innerText || '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 15000);

        return {
          title: getMeta(['citation_title', 'og:title']) || document.title || '',
          authors: citationAuthors.length ? citationAuthors.join('; ') : getMeta(['author', 'dc.creator']),
          date: getMeta(['citation_publication_date', 'citation_date', 'article:published_time', 'dc.date']),
          journal: getMeta(['citation_journal_title', 'prism.publicationName']),
          volume: getMeta(['citation_volume']),
          issue: getMeta(['citation_issue']),
          firstPage: getMeta(['citation_firstpage']),
          lastPage: getMeta(['citation_lastpage']),
          siteName: getMeta(['og:site_name', 'application-name']) || location.hostname,
          doi,
          snapshotText: rawText,
        };
      },
    });

    const info = results?.[0]?.result;
    if (!info) return;

    if (info.title) $('titleInput').value = info.title;
    if (info.authors) $('authorsInput').value = info.authors;
    if (info.date) {
      const yearMatch = info.date.match(/\d{4}/);
      if (yearMatch) $('yearInput').value = yearMatch[0];
    } else {
      $('yearInput').value = String(new Date().getFullYear());
    }
    if (info.doi) {
      $('doiInput').value = info.doi;
    }
    if (info.journal) {
      $('typeSelect').value = 'journal';
      $('sourceLabel').firstChild.textContent = '期刊名稱';
      $('sourceInput').value = info.journal;
      extraJournalMeta = {
        volume: info.volume || '',
        issue: info.issue || '',
        pages: info.firstPage && info.lastPage ? `${info.firstPage}-${info.lastPage}` : info.firstPage || '',
      };
    } else if (info.siteName) {
      $('sourceInput').value = info.siteName;
    }

    pageSnapshotText = info.snapshotText || '';
  } catch {
    // 部分受保護頁面（如 PDF 檢視器）無法注入腳本，保留基本標題與網址即可
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
    $('sourceLabel').firstChild.textContent = '期刊名稱';
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

    // 先檢查同專案是否已有相同 DOI 或網址
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
    const v = e.target.value;
    $('sourceLabel').firstChild.textContent =
      v === 'journal' ? '期刊名稱' : v === 'thesis' ? '學校系所' : v === 'book' ? '出版社' : '網站或機構名稱';
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

  // 初始化檢查連線
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
