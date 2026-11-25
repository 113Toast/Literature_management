import {
  BookMarked,
  Chrome,
  Cloud,
  Copy,
  ListChecks,
  Smartphone,
  Sparkles,
  Table,
  Users,
} from 'lucide-react';

export default function Guide() {
  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-xl font-semibold">使用說明與功能指南</h2>
        <p className="mt-1 text-sm opacity-75">
          專為中英文混排報告設計的輕量級文獻管理工具，支援電腦、平板、手機與小組共編。
        </p>
      </div>

      {/* 1. 新增文獻與 APA 排版 */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-2 text-sm">
        <h3 className="flex items-center gap-2 font-semibold text-base text-[#1f3a5f] dark:text-sky-300">
          <BookMarked size={17} />
          1. 新增文獻與 APA 第七版雙語自動排版
        </h3>
        <ul className="list-disc pl-5 space-y-1.5 opacity-90 leading-relaxed">
          <li>
            <strong>DOI 一鍵抓取：</strong>點「新增文獻」，貼上論文的 DOI 編號按「抓取」，系統會自動帶入作者、年份、期刊、卷期頁碼，並自動檢查是否為<strong>已撤稿（紅標）</strong>或<strong>尚未同儕審查的預印本（黃標）</strong>。
          </li>
          <li>
            <strong>中英文自動辨識規則：</strong>中文文獻自動套用全形標點、作者頓號（、）與「等人」；英文文獻自動套用半形標點、<code>&amp;</code> 與 <em>et al.</em>。
          </li>
          <li>
            <strong>三種一鍵複製（保留斜體與縮排）：</strong>
            <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded border border-black/20 dark:border-white/20 text-xs">
              <Copy size={11} /> 括弧引用
            </span>
            產生 <code>（王小明，2024）</code>；<strong>敘述引用</strong>產生 <code>王小明（2024）</code>；<strong>完整 APA</strong> 貼進 Word 或 Google Docs 時會自動保留期刊斜體與懸掛縮排。
          </li>
          <li>
            <strong>交稿一鍵匯出：</strong>將文章中實際用到的文獻狀態改為「已引用」，按右上角「匯出已引用」，系統會自動依<strong>中文在前（姓氏筆畫排序）、英文在後（A–Z 排序）</strong>整理好並複製到剪貼簿。
          </li>
        </ul>
      </section>

      {/* 2. 比較矩陣、筆記抽屜與 AI 自動填表 */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-2 text-sm">
        <h3 className="flex items-center gap-2 font-semibold text-base text-[#1f3a5f] dark:text-sky-300">
          <Table size={17} />
          2. 比較矩陣、筆記抽屜與 AI 摘要填表
        </h3>
        <ul className="list-disc pl-5 space-y-1.5 opacity-90 leading-relaxed">
          <li>
            <strong>比較矩陣：</strong>在文獻庫上方切換成「比較矩陣」，電腦與橫向平板可像 Excel 一樣橫向對照各篇文獻的「研究對象、樣本數、研究方法、核心結果、研究限制」，也能自行新增欄位；手機版會自動轉為卡片堆疊方便單手瀏覽。
          </li>
          <li>
            <strong>筆記／詳情抽屜：</strong>點擊任一篇文獻的「筆記／詳情」，可收藏<strong>重點引用句</strong>（點「複製引用句＋出處」會自動附上 <code>「原文」（作者，年份）</code>）、撰寫自動儲存的閱讀筆記，或修改書目與搬移專案。
          </li>
          <li>
            <strong><Sparkles size={13} className="inline mr-1" />AI 自動填表（選配）：</strong>到 Google AI Studio 申請免費的 Gemini API Key 並貼進本網站「設定」頁後，只要在抽屜貼上英文或中文論文摘要，按「AI 自動填入矩陣」，系統就會自動整理成繁體中文重點填入各欄位。
          </li>
        </ul>
      </section>

      {/* 3. 引用核對器 */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-2 text-sm">
        <h3 className="flex items-center gap-2 font-semibold text-base text-[#1f3a5f] dark:text-sky-300">
          <ListChecks size={17} />
          3. 內文與文末引用防漏核對器
        </h3>
        <p className="opacity-90 leading-relaxed">
          寫完報告交稿前，切換到「核對器」分頁，把整篇報告草稿貼進文字框按「開始核對」。系統會自動掃描內文所有的中英文引用，並用紅黃綠燈列出<strong>「🔴 內文有引但文末漏放」</strong>與<strong>「🟡 文末有放但內文未引」</strong>的文獻，避免低級失誤。
        </p>
      </section>

      {/* 4. 小組共編與雲端同步 */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-2 text-sm">
        <h3 className="flex items-center gap-2 font-semibold text-base text-[#1f3a5f] dark:text-sky-300">
          <Users size={17} />
          4. 小組報告共編教學（邀請碼機制）
        </h3>
        <ol className="list-decimal pl-5 space-y-1.5 opacity-90 leading-relaxed">
          <li>
            <strong>組長建立專案：</strong>點左側欄（或手機上方）的「Google 登入」後，按「＋ 新增專案」，專案上方會產生一組 <strong>6 碼邀請碼</strong>（例如 <code>A8K92P</code>）。
          </li>
          <li>
            <strong>組員輸入邀請碼加入：</strong>組員打開同一個網站並登入 Google，點「輸入邀請碼加入」，貼上 6 碼邀請碼就能立刻進入同一個專案資料夾。
          </li>
          <li>
            <strong>分工與防重複：</strong>在文獻詳情抽屜可指定「負責人」，上方可用負責人名字篩選；若組員不小心新增到相同 DOI 或相同標題的文獻，系統會自動跳出重複提醒。
          </li>
        </ol>
      </section>

      {/* 5. 安裝成手機 / 平板 / 電腦 App */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-2 text-sm">
        <h3 className="flex items-center gap-2 font-semibold text-base text-[#1f3a5f] dark:text-sky-300">
          <Smartphone size={17} />
          5. 安裝成手機／平板 App 與系統一鍵分享
        </h3>
        <ul className="list-disc pl-5 space-y-1.5 opacity-90 leading-relaxed">
          <li>
            <strong>Android 手機／平板（Chrome）：</strong>開啟網站後點右上角 <code>⋮</code> →「安裝應用程式」。安裝後，在手機瀏覽器看到文章只要按系統「分享」→ 選「文獻庫」，就會自動帶入標題與網址。
          </li>
          <li>
            <strong>iPhone／iPad（Safari）：</strong>點下方中間的「分享」圖示 → 往下滑選「加入主畫面」。
          </li>
          <li>
            <strong>電腦（Chrome / Edge）：</strong>點網址列最右側的「安裝」小圖示，即可變成獨立視窗 App。
          </li>
        </ul>
      </section>

      {/* 6. Chrome 瀏覽器擴充功能 */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-2 text-sm">
        <h3 className="flex items-center gap-2 font-semibold text-base text-[#1f3a5f] dark:text-sky-300">
          <Chrome size={17} />
          6. 安裝電腦版 Chrome 瀏覽器擴充功能
        </h3>
        <ol className="list-decimal pl-5 space-y-1.5 opacity-90 leading-relaxed">
          <li>
            從本專案 GitHub 倉庫下載並解壓縮 <code>extension</code> 資料夾到電腦中（請勿刪除該資料夾）。
          </li>
          <li>
            打開電腦 Chrome 瀏覽器，在網址列輸入 <code>chrome://extensions</code>，開啟右上角的<strong>「開發人員模式」</strong>。
          </li>
          <li>
            點左上角<strong>「載入未封裝項目」</strong>，選擇剛才解壓縮出來的 <code>extension</code> 資料夾即安裝完成。
          </li>
          <li>
            <strong>連接雲端帳號：</strong>在本網站「設定」頁面登入 Google 後，按「複製 Chrome 擴充功能連線碼」，打開擴充功能右上角「雲端連線設定」貼上即可使用：
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>瀏覽網頁或論文時點擴充功能圖示，自動抓取標題、作者、年份、DOI 與<strong>網頁純文字快照（防原網址失效 404）</strong>。</li>
              <li>在網頁上用滑鼠反白一段重點文字 → 按右鍵選<strong>「存到文獻庫（引用句＋出處）」</strong>，即可直接收進文獻詳情裡。</li>
            </ul>
          </li>
        </ol>
      </section>

      {/* 7. 資料備份提醒 */}
      <section className="rounded-lg border border-black/15 dark:border-white/15 p-4 space-y-1.5 text-sm">
        <h3 className="flex items-center gap-2 font-semibold text-base text-[#1f3a5f] dark:text-sky-300">
          <Cloud size={17} />
          7. 資料備份與安全提醒
        </h3>
        <p className="opacity-90 leading-relaxed">
          未登入 Google 時，資料僅儲存在目前這台瀏覽器中；登入 Google 後會自動同步至雲端。建議定期至「設定」頁面下載 JSON 備份檔（匯出時會自動排除你的私人 API Key，可安心分享給同學）。
        </p>
      </section>
    </div>
  );
}
