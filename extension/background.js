const WEB_APP_URL = 'https://113toast.github.io/Literature_management/';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-quote-to-litlib',
    title: '存到文獻庫（引用句＋出處）',
    contexts: ['selection'],
  });
});

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

function flashBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 3500);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-quote-to-litlib' || !info.selectionText) return;

  const selectedText = info.selectionText.trim();
  const pageUrl = tab?.url || '';
  const pageTitle = tab?.title || '未命名網頁';

  const auth = await getValidAuth();
  if (!auth) {
    // 若尚未設定雲端連線，改開啟網頁版帶入資料
    const params = new URLSearchParams({
      url: pageUrl,
      title: pageTitle,
      text: selectedText,
    });
    chrome.tabs.create({ url: `${WEB_APP_URL}?${params.toString()}` });
    return;
  }

  try {
    // 取得目標專案（優先使用上次選的專案，否則取第一個專案）
    const projRes = await fetch(
      `${auth.supabaseUrl}/rest/v1/projects?select=id,name&order=created_at.asc`,
      {
        headers: {
          apikey: auth.supabaseAnonKey,
          Authorization: `Bearer ${auth.accessToken}`,
        },
      }
    );
    const projects = projRes.ok ? await projRes.json() : [];
    if (!projects.length) {
      flashBadge('!', '#dc2626');
      return;
    }

    const lastProj = (await chrome.storage.local.get(['lastProjectId'])).lastProjectId;
    const targetProject = projects.find((p) => p.id === lastProj) || projects[0];
    const now = new Date().toISOString();

    // 檢查該專案是否已經存過同網址的文獻
    const refsRes = await fetch(
      `${auth.supabaseUrl}/rest/v1/lit_references?project_id=eq.${encodeURIComponent(targetProject.id)}&select=id,data`,
      {
        headers: {
          apikey: auth.supabaseAnonKey,
          Authorization: `Bearer ${auth.accessToken}`,
        },
      }
    );
    const rows = refsRes.ok ? await refsRes.json() : [];
    const matched = rows.find((r) => r.data && r.data.url === pageUrl);

    if (matched) {
      // 已有此文獻 -> 直接把引用句附加進 quotes 陣列
      const prevQuotes = Array.isArray(matched.data.quotes) ? matched.data.quotes : [];
      const updatedData = {
        ...matched.data,
        quotes: [{ text: selectedText, createdAt: now }, ...prevQuotes],
        updatedAt: now,
      };

      const patchRes = await fetch(
        `${auth.supabaseUrl}/rest/v1/lit_references?id=eq.${encodeURIComponent(matched.id)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: auth.supabaseAnonKey,
            Authorization: `Bearer ${auth.accessToken}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            data: updatedData,
            updated_at: now,
            updated_by: auth.userId || null,
          }),
        }
      );
      if (!patchRes.ok) throw new Error('更新引用句失敗');
      flashBadge('+1', '#15803d');
    } else {
      // 尚未存過此網頁 -> 自動建檔並存入該引用句
      let siteName = '';
      try {
        siteName = new URL(pageUrl).hostname;
      } catch {}

      const id = crypto.randomUUID();
      const newRef = {
        id,
        projectId: targetProject.id,
        type: 'website',
        title: pageTitle,
        authors: [],
        year: String(new Date().getFullYear()),
        url: pageUrl,
        accessDate: now.slice(0, 10),
        siteName,
        status: 'unread',
        stanceTags: [],
        quotes: [{ text: selectedText, createdAt: now }],
        matrix: {},
        createdAt: now,
        updatedAt: now,
      };

      const postRes = await fetch(`${auth.supabaseUrl}/rest/v1/lit_references`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: auth.supabaseAnonKey,
          Authorization: `Bearer ${auth.accessToken}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id,
          project_id: targetProject.id,
          data: newRef,
          updated_at: now,
          updated_by: auth.userId || null,
        }),
      });
      if (!postRes.ok) throw new Error('新增引用句失敗');
      flashBadge('OK', '#15803d');
    }
  } catch {
    flashBadge('ERR', '#dc2626');
  }
});
