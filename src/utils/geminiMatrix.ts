import type { MatrixColumn } from '../store';

export const GEMINI_KEY_STORAGE = 'litlib.geminiKey';

export function getSavedGeminiKey(): string {
  try {
    return (localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim();
  } catch {
    return '';
  }
}

async function callGeminiJson(apiKey: string, prompt: string): Promise<string> {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError = '無法連線至 Gemini API';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini 回傳內容為空，請稍後再試');
      return text;
    }

    // 若模型名稱不支援 (404) 則嘗試下一個備援模型，其餘錯誤直接回報
    let errMsg = `HTTP ${res.status}`;
    try {
      const errData = await res.json();
      if (errData?.error?.message) errMsg = errData.error.message;
    } catch {
      // 忽略 JSON 解析失敗
    }

    if (res.status === 404) {
      lastError = errMsg;
      continue;
    }

    if (res.status === 400 || res.status === 403) {
      throw new Error(`API Key 無效或權限不足（${errMsg}）`);
    }
    throw new Error(`Gemini 服務錯誤：${errMsg}`);
  }

  throw new Error(`找不到可用的 Gemini 模型：${lastError}`);
}

export async function extractMatrixFromAbstract(
  abstractText: string,
  cols: MatrixColumn[],
  paperTitle?: string
): Promise<Record<string, string>> {
  const apiKey = getSavedGeminiKey();
  if (!apiKey) {
    throw new Error('尚未設定 Gemini API Key，請先至「設定」頁面輸入並儲存');
  }

  const trimmed = abstractText.trim();
  if (!trimmed) {
    throw new Error('請先貼上論文摘要或內文');
  }

  const fieldSpecs = cols
    .map((c) => `- "${c.key}": ${c.label}`)
    .join('\n');

  const prompt = `你是一位嚴謹的學術研究助理。請閱讀以下文獻${
    paperTitle ? `（標題：${paperTitle}）` : ''
  }的摘要內容，並萃取出對應以下各欄位的重點，以「繁體中文」精簡扼要填寫（每欄約 15～60 字，直接寫重點，不要加多餘前綴）。

若摘要中完全沒有提到某個欄位的資訊，請該欄位填入空字串 ""，絕對不要憑空捏造數據。

請只回傳一個合法的 JSON 物件，鍵名（key）必須完全符合以下清單：
${fieldSpecs}

【文獻摘要內容】
${trimmed}`;

  const rawText = await callGeminiJson(apiKey, prompt);
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI 回傳格式解析失敗，請再試一次');
  }

  const result: Record<string, string> = {};
  for (const col of cols) {
    const val = parsed[col.key];
    result[col.key] = typeof val === 'string' ? val.trim() : val != null ? String(val) : '';
  }
  return result;
}
