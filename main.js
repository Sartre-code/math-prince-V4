/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  數學王子的覺醒 — main.js  (D 組系統整合交付)                       ║
 * ║  依據《技術規範手冊 V4.0》+ 《技術交接與錯誤彙整報告 V4.1》         ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  · 嚴格對齊 index.html 所有 ID（以 HTML 為準）                      ║
 * ║  · openUnit 掛載至 window（§V4.1 全域作用域修正）                   ║
 * ║  · 補充注入 StorageGuard 所需 Modal DOM（HTML 未提供）               ║
 * ║  · 事件統一由 JS 管理，不依賴 HTML inline onclick                    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

/* ════════════════════════════════════════════════════════════════
   §0  單元映射表
   data-unit 屬性值  →  DATA/ 資料夾 JSON 路徑
   （GitHub 已確認資料夾名稱為大寫 DATA）
════════════════════════════════════════════════════════════════ */
const UNIT_MAP = {
  F: { file: 'DATA/unit1.json', name: '分數的運算',   unitNum: 1 },
  P: { file: 'DATA/unit2.json', name: '百分率與應用', unitNum: 2 },
  S: { file: 'DATA/unit3.json', name: '速率與時間',   unitNum: 3 },
  R: { file: 'DATA/unit4.json', name: '比與比例',     unitNum: 4 },
  C: { file: 'DATA/unit5.json', name: '圓與扇形',     unitNum: 5 },
  A: { file: 'DATA/unit6.json', name: '平均數問題',   unitNum: 6 },
  D: { file: 'DATA/unit7.json', name: '圖表判讀',     unitNum: 7 },
  E: { file: 'DATA/unit8.json', name: '一元一次方程', unitNum: 8 },
};

/* ════════════════════════════════════════════════════════════════
   §1  應用狀態（單一真實來源）
════════════════════════════════════════════════════════════════ */
const state = {
  points:        0,     // 累積覺醒積分
  currentUnit:   null,  // 目前開啟的單元碼（'F' | 'P' | ...）
  questions:     [],    // 從 JSON 載入的題目陣列
  currentIndex:  0,     // 目前題目索引
  isVariantMode: false, // false = 主題，true = 同題之 variant 版本
  answered:      false, // 本題是否已完成判定（防止重複計分）
};

/**
 * 取得目前應顯示的題目物件。
 *
 * 設計說明：「重新練習」按鈕只切換 isVariantMode flag，
 * 仍指向同一 questions[currentIndex]，僅選擇主體或 variant 子物件。
 * 完全不需要重新 fetch，切換為 O(1) 操作。
 */
function getCurrentQuestion() {
  const base = state.questions[state.currentIndex];
  if (!base) return null;
  return (state.isVariantMode && base.variant) ? base.variant : base;
}

/* ════════════════════════════════════════════════════════════════
   §2  DOM 快取（嚴格對齊 index.html 現有 ID，不自行命名）
════════════════════════════════════════════════════════════════ */
const $id = id => document.getElementById(id);

let DOM = {};

function initDOMCache() {
  DOM = {
    userPoints:      $id('user-points'),       // 積分顯示 <span>
    unitMenu:        $id('unit-menu'),          // 單元選單 <section>
    quizShell:       $id('quiz-shell'),         // 題目殼層 <main>
    questionDisplay: $id('question-display'),   // 題目渲染容器 <div>
    answerInput:     $id('answer-input'),       // 答案輸入框 <input>
    submitBtn:       $id('submit-btn'),         // 提交按鈕 <button>
    toastContainer:  $id('toast-container'),    // Toast 容器 <div>
  };
}

/* ════════════════════════════════════════════════════════════════
   §3  補充注入 StorageGuard 所需的 Modal DOM
   ─────────────────────────────────────────────────────────────
   C 組 math_prince_core.js 的 StorageGuard 依賴以下 ID：
     #backupModal · #codeDisplay · #copyBtn
     #modalErrorBanner · #privateWarning
   但 B 組 HTML 原型未提供這些元素。
   由 D 組在 DOMContentLoaded 時動態注入。
════════════════════════════════════════════════════════════════ */
function injectStorageGuardModals() {
  if ($id('backupModal')) return; // 冪等保護，避免重複注入

  /* ── 輔助 CSS ─────────────────────────────────────── */
  const styleEl = document.createElement('style');
  styleEl.id = 'mp-d-styles';
  styleEl.textContent = `
    /* §14.6.2 私密模式 / 儲存失敗警告橫幅 */
    #privateWarning {
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100%;
      background: var(--error, #8B1A1A);
      color: #fff;
      text-align: center;
      padding: 10px 1rem;
      font-size: 0.9rem;
      z-index: 10000;
      line-height: 1.6;
    }
    #privateWarning.show { display: block !important; }

    /* §14.6.3 備份碼 Modal 內的錯誤橫幅 */
    #modalErrorBanner {
      display: none;
      background: var(--error, #8B1A1A);
      color: #fff;
      border-radius: 6px;
      padding: 0.6rem 1rem;
      font-size: 0.85rem;
      margin-bottom: 1rem;
      text-align: center;
    }
    #modalErrorBanner.show { display: block !important; }

    /* 備份碼顯示框 */
    #codeDisplay {
      background: var(--navy-light, #E6ECF7);
      border-radius: 8px;
      padding: 1rem;
      font-size: 0.72rem;
      word-break: break-all;
      max-height: 130px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      margin-bottom: 1.5rem;
      outline: none;
      user-select: text;
      cursor: text;
      line-height: 1.7;
    }
    .copy-btn.success    { background: var(--success, #2D6A4F) !important; }
    .copy-btn.error-state { background: var(--error, #8B1A1A) !important; }

    /* ── 題目區淡入動畫 ────────────────────────────── */
    @keyframes mp-fade-in {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
    .mp-question-enter {
      animation: mp-fade-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    /* ── 載入旋轉器 ─────────────────────────────────── */
    @keyframes mp-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .mp-spinner {
      display: inline-block;
      animation: mp-spin 0.9s linear infinite;
      font-size: 2rem;
    }

    /* ── 單元卡片載入中 ──────────────────────────────── */
    .unit-card.mp-loading {
      opacity: 0.55;
      pointer-events: none;
    }

    /* ── 詳解折疊展開 ────────────────────────────────── */
    .mp-explanation {
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height 0.45s ease, opacity 0.3s ease, padding 0.3s ease;
      padding: 0 1.5rem;
    }
    .mp-explanation.open {
      max-height: 3000px;
      opacity: 1;
      padding: 1.2rem 1.5rem;
    }

    /* ── Unit 7 資料描述區塊 ─────────────────────────── */
    .mp-data-block {
      display: block;
      background: var(--chalk, #F0EDE6);
      border-left: 4px solid var(--gold, #C8960A);
      border-radius: 0 10px 10px 0;
      padding: 0.7rem 1.1rem;
      margin: 0.7rem 0;
      font-weight: 600;
      font-size: 0.95rem;
      line-height: 1.9;
    }

    /* ── 答對 / 答錯回饋動畫 ──────────────────────────── */
    @keyframes mp-pulse-green {
      0%   { box-shadow: 0 0 0 0 rgba(45,106,79,0.55); }
      70%  { box-shadow: 0 0 0 14px rgba(45,106,79,0); }
      100% { box-shadow: 0 0 0 0 rgba(45,106,79,0);    }
    }
    @keyframes mp-shake {
      0%,100% { transform: translateX(0); }
      20%     { transform: translateX(-7px); }
      40%     { transform: translateX(7px);  }
      60%     { transform: translateX(-4px); }
      80%     { transform: translateX(4px);  }
    }
    .mp-shake   { animation: mp-shake 0.4s ease; }
    .mp-correct { animation: mp-pulse-green 0.65s ease; }
  `;
  document.head.appendChild(styleEl);

  /* ── #privateWarning 橫幅 ────────────────────────── */
  const warning = document.createElement('div');
  warning.id = 'privateWarning';
  warning.textContent =
    '⚠ 偵測到儲存空間限制，進度已暫存於記憶體。請複製備份碼以保存您的進度。';
  document.body.appendChild(warning);

  /* ── #backupModal ────────────────────────────────── */
  const modal = document.createElement('div');
  modal.id = 'backupModal';
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '進度備份碼');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px;">
      <h2 style="
        font-family:'Noto Serif TC',serif;
        color:var(--navy-deep);
        font-size:1.5rem;
        margin-bottom:0.5rem;
      ">📋 進度備份碼</h2>
      <p style="font-size:0.88rem;color:#666;margin-bottom:1.2rem;line-height:1.65;">
        無法自動儲存進度。請複製以下備份碼，下次可貼入以恢復進度。
      </p>
      <div id="codeDisplay" tabindex="0"></div>
      <div id="modalErrorBanner">
        複製失敗，請手動框選文字後按 Ctrl+C（Mac：⌘C）。
      </div>
      <div style="display:flex;gap:0.8rem;justify-content:center;flex-wrap:wrap;">
        <button
          id="copyBtn"
          class="primary-btn copy-btn"
          onclick="copyCode()"
          style="min-width:160px;min-height:44px;"
        >一鍵複製進度碼</button>
        <button
          class="primary-btn"
          onclick="
            document.getElementById('backupModal').classList.remove('open');
            document.getElementById('backupModal').setAttribute('aria-hidden','true');
          "
          style="
            background:transparent;
            border:2px solid var(--navy-deep);
            color:var(--navy-deep);
            min-height:44px;
          "
        >關閉</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

/* ════════════════════════════════════════════════════════════════
   §4  UI 工具函式
════════════════════════════════════════════════════════════════ */

/** 同步更新畫面上的積分顯示 */
function updatePoints() {
  if (DOM.userPoints) DOM.userPoints.textContent = state.points;
}

/** Toast 捷徑（統一透過 InputGuard 的 Toast 系統） */
function showToast(msg, type = 'default', dur = 3000) {
  window.MathPrince.InputGuard.showToast(msg, type, dur);
}

/**
 * esc(str) — 統一 XSS 防護函式（§HTML 注入安全性修正）
 *
 * 設計說明：
 *   凡是將外部來源字串（JSON 題庫、unitCode、動態欄位）
 *   插入 innerHTML 模板字串前，必須通過此函式跳脫。
 *   涵蓋六個 HTML 危險字元：& < > " ' `
 *
 *   使用規則：
 *     ✅ 必要：q.question / q.explanation / q.answer / unitCode 等外部字串
 *     ✅ 必要：任何經 state 讀取後轉字串插入模板的欄位
 *     ⛔ 不需要：純 Number 型別（state.points / state.currentIndex 等）
 *     ⛔ 不需要：系統內部硬編碼常數（UNIT_MAP.name 等）
 *
 * @param {*} value - 任意值，強制轉型為字串後跳脫
 * @returns {string} 安全的 HTML 文字節點等效字串
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;')
    .replace(/`/g,  '&#96;');
}

/**
 * 顯示 / 隱藏答案輸入區（.answer-zone）。
 *
 * 設計說明：這是解決 InputGuard unlockUI 競態問題的核心策略。
 * InputGuard 的 finally 區塊會在 onValidSubmit 返回後重新啟用按鈕，
 * 若我們只靠 disabled 屬性來阻擋，會被 unlockUI 覆寫（V4.1 §冗餘邏輯衝突）。
 * 解法：答對後直接隱藏整個 .answer-zone，
 * InputGuard 的解鎖操作對隱藏元素不產生視覺影響。
 */
function setAnswerZoneVisible(visible) {
  // answer-zone 是 #answer-input 的祖先 <div class="answer-zone">
  const zone = DOM.answerInput?.closest('.answer-zone');
  if (zone) zone.style.display = visible ? '' : 'none';
}

/* ════════════════════════════════════════════════════════════════
   §5  Unit 7 統計單元：資料描述區塊化排版
════════════════════════════════════════════════════════════════ */

/**
 * 將題目文字轉換為安全 HTML 字串。
 *
 * Unit 7（圖表判讀）：題目內含「OOO：數字 單位、數字 單位…」
 * 格式的資料表描述，以 .mp-data-block 區塊加粗排版。
 * 其他單元：僅做 XSS 跳脫，保留 \n 換行（由 white-space:pre-wrap 渲染）。
 *
 * @param {string} question - 原始題目文字
 * @param {string} unitCode - 單元代碼
 * @returns {string} 安全的 HTML 字串
 */
function buildQuestionHTML(question, unitCode) {
  // 統一透過 esc() 執行六字元 XSS 跳脫（§HTML 注入安全性修正）
  // esc() 已涵蓋 & < > " ' ` 六個危險字元，無需重複實作
  const escaped = esc(question);

  if (unitCode !== 'D') {
    return escaped; // 非統計單元，直接回傳
  }

  // Unit 7：匹配「包含冒號 + 多個數字 + 分隔符」的資料列句子
  // 例："六年一班 18 棵、六年二班 25 棵、六年三班 21 棵、六年四班 30 棵、六年五班 16 棵"
  const DATA_PATTERN =
    /([^。\n]*[:：][^。\n]*\d+[^。\n]*[、，,][^。\n]*\d+[^。\n]*(?:。)?)/g;

  return escaped.replace(
    DATA_PATTERN,
    match => `<span class="mp-data-block">${match}</span>`
  );
}

/* ════════════════════════════════════════════════════════════════
   §6  題目渲染（核心 UI 組裝函式）
════════════════════════════════════════════════════════════════ */
function renderQuestion() {
  const q        = getCurrentQuestion();
  const baseQ    = state.questions[state.currentIndex];
  const unitCode = state.currentUnit;

  if (!q || !DOM.questionDisplay) return;

  const hasVariant     = !!(baseQ && baseQ.variant);
  const isLastQuestion = state.currentIndex >= state.questions.length - 1;

  /* ── 組裝 HTML 字串 ──────────────────────────────── */
  let html = `<div class="mp-question-enter">`;

  // 進度列
  html += `
    <div style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom:1.5rem;
      padding-bottom:1rem;
      border-bottom:2px solid var(--navy-light);
    ">
      <span style="font-size:0.85rem;color:var(--navy-mid);font-weight:600;">
        第 ${state.currentIndex + 1} / ${state.questions.length} 題
        ${state.isVariantMode
          ? `<span style="
              background:var(--gold-light);
              color:var(--gold-mid);
              border-radius:4px;
              padding:2px 8px;
              margin-left:8px;
              font-size:0.78rem;
              font-weight:700;
              letter-spacing:.03em;
            ">變體題</span>`
          : ''
        }
      </span>
      <span style="font-size:0.9rem;color:var(--gold-mid);font-weight:600;">
        🏆 ${state.points} 分
      </span>
    </div>`;

  // 題目本文（white-space:pre-wrap 確保 \n 換行正確顯示）
  html += `
    <div
      class="q-body"
      style="white-space:pre-wrap;line-height:1.95;margin-bottom:2rem;"
    >${buildQuestionHTML(q.question, unitCode)}</div>`;

  // 答對後：詳解區 + 操作按鈕
  if (state.answered) {
    const expHTML = buildQuestionHTML(q.explanation || '', unitCode);

    html += `
      <div id="mp-explanation-zone" style="margin-top:0.5rem;">
        <button
          id="toggle-explanation-btn"
          style="
            background: var(--gold-light);
            border: 1px solid var(--gold);
            color: var(--gold-mid);
            padding: 0.55rem 1.3rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            transition: background 0.2s;
          "
        >📖 查看詳解</button>

        <div
          id="mp-explanation-content"
          class="mp-explanation"
          style="
            background: var(--chalk);
            border-left: 4px solid var(--gold);
            border-radius: 0 12px 12px 0;
            white-space: pre-wrap;
            line-height: 1.9;
            font-size: 0.93rem;
          "
        >${expHTML}</div>
      </div>

      <div style="display:flex;gap:0.8rem;flex-wrap:wrap;margin-top:1.8rem;">
        ${hasVariant
          ? `<button
               id="retry-variant-btn"
               class="primary-btn"
               style="background:var(--gold-mid);min-height:44px;"
             >🔄 ${state.isVariantMode ? '切回原題' : '重新練習（變體）'}</button>`
          : ''
        }
        <button
          id="next-question-btn"
          class="primary-btn"
          style="background:var(--success,#2D6A4F);min-height:44px;"
        >${isLastQuestion ? '完成單元 🎉' : '下一題 →'}</button>
      </div>`;
  }

  html += `</div>`; // 關閉 .mp-question-enter

  /* ── 寫入 DOM ─────────────────────────────────────── */
  DOM.questionDisplay.innerHTML = html;

  /* ── 動態按鈕事件綁定（統一由 JS 管理）──────────────
     注意：每次 renderQuestion 都重新建立 DOM，
     所以需要在此重新綁定，不會有重複監聽器問題。      */
  $id('toggle-explanation-btn')
    ?.addEventListener('click', toggleExplanation);

  $id('retry-variant-btn')
    ?.addEventListener('click', window.retryVariant);

  $id('next-question-btn')
    ?.addEventListener('click', window.nextQuestion);

  /* ── 答案輸入區可見性 ─────────────────────────────── */
  setAnswerZoneVisible(!state.answered);

  if (!state.answered && DOM.answerInput) {
    DOM.answerInput.value    = '';
    DOM.answerInput.disabled = false;
    // 小延遲聚焦，避免動畫未完成時的佈局抖動
    setTimeout(() => DOM.answerInput?.focus(), 160);
  }
}

/* ════════════════════════════════════════════════════════════════
   §7  詳解區展開 / 收起
════════════════════════════════════════════════════════════════ */
function toggleExplanation() {
  const content = $id('mp-explanation-content');
  const btn     = $id('toggle-explanation-btn');
  if (!content) return;

  const isOpen = content.classList.contains('open');
  content.classList.toggle('open', !isOpen);
  if (btn) {
    btn.textContent = isOpen ? '📖 查看詳解' : '📖 收起詳解';
  }
}

/* ════════════════════════════════════════════════════════════════
   §8  答題核心邏輯（由 InputGuard.init 的 onValidSubmit 觸發）
════════════════════════════════════════════════════════════════ */
function handleValidSubmit(cleanValue) {
  // 最終防線：若本題已作答則靜默返回（InputGuard 鎖定是第一道防線）
  if (state.answered) return;

  const { SmartGrader, StorageGuard } = window.MathPrince;
  const q = getCurrentQuestion();
  if (!q) return;

  const result = SmartGrader.gradeAnswer(cleanValue, q.answer, 'auto');

  if (result.verdict === 'correct') {
    /* ── 答對流程 ──────────────────────────────────── */
    state.points  += 10;
    state.answered = true;
    updatePoints();

    // 隱藏輸入區（規避 InputGuard.unlockUI 競態，見 §4 setAnswerZoneVisible 說明）
    setAnswerZoneVisible(false);

    // 視覺回饋（CSS 動畫）
    DOM.submitBtn?.classList.add('mp-correct');
    setTimeout(() => DOM.submitBtn?.classList.remove('mp-correct'), 700);

    showToast('🎉 答對了！+10 覺醒積分', 'success', 3000);

    // 存檔（StorageGuard 自動處理失敗 → 觸發 #backupModal）
    StorageGuard.safeSave({
      progress: state.currentIndex,
      points:   state.points,
      unit:     state.currentUnit,
    });

    // 重繪：顯示詳解按鈕與下一步控制
    renderQuestion();

  } else if (result.verdict === 'wrong') {
    /* ── 答錯流程（允許重試，不鎖定）─────────────────── */
    DOM.answerInput?.classList.add('mp-shake');
    setTimeout(() => DOM.answerInput?.classList.remove('mp-shake'), 420);
    showToast('再想想看，你可以的！💪', 'error', 2500);
    // InputGuard 的 finally 會自動解鎖 UI

  }
  // verdict === 'invalid' 已由 InputGuard 內部友善提示，此處不重複處理
}

/* ════════════════════════════════════════════════════════════════
   §9  全域互動函式（掛載至 window）
   ─────────────────────────────────────────────────────────────
   依據 V4.1 §全域作用域修正：所有需與 HTML 互動的函式，
   必須明確掛載於 window 物件，禁止鎖在私有 IIFE 作用域。
════════════════════════════════════════════════════════════════ */

/**
 * window.retryVariant
 * 「重新練習（變體）」/ 「切回原題」按鈕觸發。
 * 核心設計：只改 isVariantMode flag，指向同一題的不同欄位，無需重新 fetch。
 *
 * 邊界條件（§V4.1 總監修正指令）：
 *   Case A — 嘗試切換至 variant，但 variant 欄位不存在或為空：
 *     → 顯示 Toast 告知使用者，自動回退至原題模式，禁止渲染空數據。
 *   Case B — 已在 variant 模式，點擊「切回原題」：
 *     → 正常切回，不受邊界條件影響。
 *   Case C — baseQ 本身不存在（陣列越界防護）：
 *     → 靜默 return，不做任何操作。
 */
window.retryVariant = function retryVariant() {
  /* ── Case C：baseQ 越界防護 ──────────────────────── */
  const baseQ = state.questions[state.currentIndex];
  if (!baseQ) {
    console.warn('[retryVariant] baseQ 不存在，跳過操作');
    return;
  }

  /* ── Case B：已在 variant 模式 → 切回原題 ────────── */
  if (state.isVariantMode) {
    state.isVariantMode = false;
    state.answered      = false;
    renderQuestion();
    showToast('🔄 已切換回原題目', 'default', 1800);
    return;
  }

  /* ── Case A：嘗試切換至 variant，先驗證欄位完整性 ──────────────────────
     檢查層次：
       1. variant 欄位本身存在（非 undefined / null）
       2. variant 不是空物件 {}（typeof object 但無 question key）
       3. variant.question 有實際字串內容（非空字串）
       4. variant.answer   有實際字串內容（非空字串）
     任一條件不符 → 強制回退原題模式，禁止渲染空殼物件        */
  const v = state.questions[state.currentIndex].variant;
  const variantIsValid = v &&
    typeof v === 'object' &&
    typeof v.question === 'string' && v.question.trim() !== '' &&
    typeof v.answer   === 'string' && v.answer.trim()   !== '';

  if (!variantIsValid) {
    // 確保維持原題模式，防止 getCurrentQuestion() 回傳空殼
    state.isVariantMode = false;
    state.answered      = false;
    showToast('此題已是最終型態，請直接重新挑戰原題', 'default', 2800);
    return;
  }

  /* ── 正常切換至 variant ───────────────────────────── */
  state.isVariantMode = true;
  state.answered      = false;
  renderQuestion();
  showToast('🔄 已切換至變體題目', 'default', 1800);
};

/**
 * window.nextQuestion
 * 「下一題」按鈕觸發。
 */
window.nextQuestion = function nextQuestion() {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex++;
    state.isVariantMode = false;
    state.answered      = false;
    renderQuestion();
  } else {
    showFinishScreen();
  }
};

/**
 * window.openUnit
 * 由單元卡片點擊觸發。
 * 必須為全域（V4.1 §全域作用域修正）。
 *
 * @param {string} unitCode - 'F' | 'P' | 'S' | 'R' | 'C' | 'A' | 'D' | 'E'
 */
window.openUnit = async function openUnit(unitCode) {
  if (!UNIT_MAP[unitCode]) {
    showToast('找不到對應單元資料', 'error');
    return;
  }
  // 視圖切換：隱藏選單，顯示題目殼層
  if (DOM.unitMenu)  DOM.unitMenu.style.display  = 'none';
  if (DOM.quizShell) DOM.quizShell.style.display = 'block';

  await loadUnit(unitCode);
};

/* ════════════════════════════════════════════════════════════════
   §10  資料載入（Task 1：fetch JSON，§14.7 降級機制）
════════════════════════════════════════════════════════════════ */
async function loadUnit(unitCode) {
  const info = UNIT_MAP[unitCode];

  /* ── 顯示載入動畫 ─────────────────────────────────── */
  if (DOM.questionDisplay) {
    DOM.questionDisplay.innerHTML = `
      <div style="text-align:center;padding:4rem 2rem;color:var(--navy-mid);">
        <div class="mp-spinner">⟳</div>
        <p style="margin-top:1.2rem;font-size:0.95rem;line-height:1.6;">
          正在載入《${info.name}》⋯
        </p>
      </div>
    `;
  }
  setAnswerZoneVisible(false);

  try {
    const response = await fetch(info.file);

    // HTTP 非 2xx 視為失敗（如 404）
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — ${info.file}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('題庫 JSON 格式異常或為空陣列');
    }

    /* ── 載入成功：更新狀態並渲染 ─────────────────── */
    state.questions     = data;
    state.currentIndex  = 0;
    state.isVariantMode = false;
    state.answered      = false;
    state.currentUnit   = unitCode;

    setAnswerZoneVisible(true);
    renderQuestion();

  } catch (err) {
    /* ── §14.7 降級處理 ──────────────────────────────
       禁止跳出技術性報錯視窗，改以友善提示引導使用者。  */
    console.error('[Main] 資料載入失敗：', err.message);

    if (DOM.questionDisplay) {
      DOM.questionDisplay.innerHTML = `
        <div style="text-align:center;padding:3.5rem 1rem;">
          <div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>
          <h3 style="
            color:var(--error,#8B1A1A);
            font-family:'Noto Serif TC',serif;
            margin-bottom:0.8rem;
          ">資料讀取異常</h3>
          <p style="color:#666;font-size:0.9rem;margin-bottom:2rem;line-height:1.7;">
            請確認網路連線正常後重試。<br>
            若問題持續，請返回首頁重新選擇單元。
          </p>
          <div style="display:flex;gap:0.8rem;justify-content:center;flex-wrap:wrap;">
            <button
              class="primary-btn"
              onclick="window.openUnit('${esc(unitCode)}')"
              style="min-height:44px;"
            >🔄 重新載入</button>
            <button
              class="primary-btn"
              onclick="location.reload()"
              style="
                background:transparent;
                border:2px solid var(--navy-deep);
                color:var(--navy-deep);
                min-height:44px;
              "
            >← 返回首頁</button>
          </div>
        </div>
      `;
    }

    // §14.7 Toast 友善提示（確保有文字提示）
    showToast('資料讀取異常，請檢查網路', 'error', 4500);
  }
}

/* ════════════════════════════════════════════════════════════════
   §11  完成畫面
════════════════════════════════════════════════════════════════ */
function showFinishScreen() {
  if (!DOM.questionDisplay) return;

  // 存儲最終進度
  window.MathPrince.StorageGuard.safeSave({
    progress: state.questions.length,
    points:   state.points,
    unit:     state.currentUnit,
    completed: true,
  });

  DOM.questionDisplay.innerHTML = `
    <div class="mp-question-enter" style="text-align:center;padding:3.5rem 1rem;">
      <div style="font-size:3.5rem;margin-bottom:1.2rem;">🎓</div>
      <h2 style="
        font-family:'Noto Serif TC',serif;
        color:var(--navy-deep);
        font-size:1.8rem;
        margin-bottom:0.6rem;
      ">恭喜完成本單元！</h2>
      <p style="
        color:var(--gold-mid);
        font-size:1.15rem;
        margin-bottom:2.5rem;
        font-weight:600;
        line-height:1.7;
      ">
        本次共獲得<br>
        <span style="font-size:2.2rem;font-family:'Crimson Pro',serif;">
          ${state.points}
        </span>
        覺醒積分 ✨
      </p>
      <button
        class="primary-btn"
        onclick="location.reload()"
        style="min-height:44px;padding:1rem 3rem;font-size:1.05rem;"
      >← 返回單元選單</button>
    </div>
  `;
  setAnswerZoneVisible(false);
}

/* ════════════════════════════════════════════════════════════════
   §12  事件綁定：單元卡片（統一由 JS 管理，不用 HTML onclick）
════════════════════════════════════════════════════════════════ */
function bindUnitCardEvents() {
  const cards = document.querySelectorAll('#unit-menu .unit-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const code = card.dataset.unit;
      if (!code) return;
      // 點擊視覺回饋
      card.classList.add('mp-loading');
      setTimeout(() => card.classList.remove('mp-loading'), 1800);
      window.openUnit(code);
    });
  });
}

/* ════════════════════════════════════════════════════════════════
   §13  初始化入口（DOMContentLoaded）
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* ① 注入 StorageGuard 所需 Modal DOM（最先執行）*/
  injectStorageGuardModals();

  /* ② 快取 DOM 參照 */
  initDOMCache();

  /* ③ 解構三大模組 */
  const { StorageGuard, InputGuard } = window.MathPrince;

  /* ④ 恢復已儲存的積分（可選） */
  const saved = StorageGuard.safeLoad();
  if (saved?.points) {
    state.points = saved.points;
    updatePoints();
  }

  /* ⑤ 綁定單元卡片點擊 */
  bindUnitCardEvents();

  /* ⑥ 初始化 InputGuard（唯一呼叫點，統一管理 #answer-input / #submit-btn）
     onValidSubmit 使用動態閉包：執行時才讀取 getCurrentQuestion()，
     因此無需在題目切換時重新 init。                                         */
  InputGuard.init({
    // inputEl / submitEl 省略，使用模組預設（#answer-input / #submit-btn）
    onValidSubmit: (cleanValue) => {
      handleValidSubmit(cleanValue);
    }
  });

  /* ⑦ 頁面關閉前自動存檔 */
  StorageGuard.setupBeforeUnloadGuard(() => ({
    progress: state.currentIndex,
    points:   state.points,
    unit:     state.currentUnit,
  }));

  /* ⑧ ┌────────────────────────────────────────────────────────┐
        │  §14.6 / §14.7 負向測試接口（僅開發用）               │
        │  上線前請移除或保持此區塊為全部註解狀態               │
        └────────────────────────────────────────────────────────┘

     // 測試 A：存檔失敗模擬 → 應觸發 #backupModal + Base64 備份碼
     StorageGuard.setForceFailMode(true);
     StorageGuard.safeSave({ progress: 3, points: 30 });

     // 測試 B：資料加載失敗 → 修改任一 URL 後呼叫 openUnit
     //   例：臨時改 UNIT_MAP['F'].file = 'DATA/not_exist.json'
     //       再呼叫 window.openUnit('F')
     //       → 應顯示友善錯誤頁 + Toast「資料讀取異常，請檢查網路」

     // 測試 C：狀態鎖定驗證
     //   正常作答（答對）後，開啟 DevTools：
     //   · Elements 面板確認 .answer-zone style="display:none"
     //   · #submit-btn 雖被 InputGuard 解鎖，但整個區塊已隱藏
  */

  console.log(
    '[D 組 main.js] ✅ 初始化完成',
    '· SmartGrader / StorageGuard / InputGuard 已掛載',
    '· openUnit / retryVariant / nextQuestion 已掛載至 window'
  );
});
