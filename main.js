/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  數學王子的覺醒 — main.js  (D 組 V4.2 修正版)                       ║
 * ║  修正項目：                                                          ║
 * ║  · §14.5.1/14.5.3 答錯3次觸發中斷機制（查看答案 / 跳過此題）        ║
 * ║  · §14.9.2 複合答案正規化（「9段、0公尺」等同「9段，剩下0公尺」）   ║
 * ║  · 進度持久化：回首頁再進入同單元，從上次題號繼續                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

/* ════════════════════════════════════════════════════════════════
   §0  單元映射表
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
   §1  應用狀態
════════════════════════════════════════════════════════════════ */
const state = {
  points:        0,
  currentUnit:   null,
  questions:     [],
  currentIndex:  0,
  isVariantMode: false,
  answered:      false,
  wrongCount:    0,     // §14.5.1 本題連續答錯次數
};

/* §14.5.1 連續答錯上限 */
const WRONG_LIMIT = 3;

/* localStorage 進度 key */
const PROGRESS_KEY = 'mp_unit_progress';
/* localStorage 各單元答題統計 key */
const STATS_KEY    = 'mp_unit_stats';

function getCurrentQuestion() {
  const base = state.questions[state.currentIndex];
  if (!base) return null;
  return (state.isVariantMode && base.variant) ? base.variant : base;
}

/* ════════════════════════════════════════════════════════════════
   §2  DOM 快取
════════════════════════════════════════════════════════════════ */
const $id = id => document.getElementById(id);
let DOM = {};

function initDOMCache() {
  DOM = {
    userPoints:      $id('user-points'),
    unitMenu:        $id('unit-menu'),
    quizShell:       $id('quiz-shell'),
    questionDisplay: $id('question-display'),
    answerInput:     $id('answer-input'),
    submitBtn:       $id('submit-btn'),
    toastContainer:  $id('toast-container'),
  };
}

/* ════════════════════════════════════════════════════════════════
   §3  StorageGuard Modal 補充注入
════════════════════════════════════════════════════════════════ */
function injectStorageGuardModals() {
  if ($id('backupModal')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'mp-d-styles';
  styleEl.textContent = `
    #privateWarning {
      display: none; position: fixed;
      top: 0; left: 0; width: 100%;
      background: var(--error, #8B1A1A); color: #fff;
      text-align: center; padding: 10px 1rem;
      font-size: 0.9rem; z-index: 10000; line-height: 1.6;
    }
    #privateWarning.show { display: block !important; }
    #modalErrorBanner {
      display: none; background: var(--error, #8B1A1A); color: #fff;
      border-radius: 6px; padding: 0.6rem 1rem;
      font-size: 0.85rem; margin-bottom: 1rem; text-align: center;
    }
    #modalErrorBanner.show { display: block !important; }
    #codeDisplay {
      background: var(--navy-light, #E6ECF7); border-radius: 8px;
      padding: 1rem; font-size: 0.72rem; word-break: break-all;
      max-height: 130px; overflow-y: auto;
      font-family: 'Courier New', monospace; margin-bottom: 1.5rem;
      outline: none; user-select: text; cursor: text; line-height: 1.7;
    }
    .copy-btn.success    { background: var(--success, #2D6A4F) !important; }
    .copy-btn.error-state { background: var(--error, #8B1A1A) !important; }

    @keyframes mp-fade-in {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .mp-question-enter { animation: mp-fade-in 0.35s cubic-bezier(0.22,1,0.36,1) both; }

    @keyframes mp-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .mp-spinner { display: inline-block; animation: mp-spin 0.9s linear infinite; font-size: 2rem; }

    .unit-card.mp-loading { opacity: 0.55; pointer-events: none; }

    .mp-explanation {
      overflow: hidden; max-height: 0; opacity: 0;
      transition: max-height 0.45s ease, opacity 0.3s ease, padding 0.3s ease;
      padding: 0 1.5rem;
    }
    .mp-explanation.open { max-height: 3000px; opacity: 1; padding: 1.2rem 1.5rem; }

    .mp-data-block {
      display: block; background: var(--chalk, #F0EDE6);
      border-left: 4px solid var(--gold, #C8960A);
      border-radius: 0 10px 10px 0;
      padding: 0.7rem 1.1rem; margin: 0.7rem 0;
      font-weight: 600; font-size: 0.95rem; line-height: 1.9;
    }

    @keyframes mp-pulse-green {
      0%   { box-shadow: 0 0 0 0 rgba(45,106,79,0.55); }
      70%  { box-shadow: 0 0 0 14px rgba(45,106,79,0); }
      100% { box-shadow: 0 0 0 0 rgba(45,106,79,0); }
    }
    @keyframes mp-shake {
      0%,100% { transform: translateX(0); }
      20%     { transform: translateX(-7px); }
      40%     { transform: translateX(7px); }
      60%     { transform: translateX(-4px); }
      80%     { transform: translateX(4px); }
    }
    .mp-shake   { animation: mp-shake 0.4s ease; }
    .mp-correct { animation: mp-pulse-green 0.65s ease; }

    /* §14.5.3 挫折感防禦：中斷提示區塊 */
    .mp-frustration-zone {
      background: #FFF8E7;
      border: 1.5px solid var(--gold, #C8960A);
      border-radius: 12px;
      padding: 1.2rem 1.5rem;
      margin-top: 1.2rem;
      text-align: center;
    }
    .mp-frustration-zone p {
      font-size: 0.9rem; color: var(--navy-mid, #2A4A8A);
      margin-bottom: 1rem; line-height: 1.7;
    }
    .mp-frustration-zone .btn-row {
      display: flex; gap: 0.8rem; justify-content: center; flex-wrap: wrap;
    }
  `;
  document.head.appendChild(styleEl);

  const warning = document.createElement('div');
  warning.id = 'privateWarning';
  warning.textContent = '⚠ 偵測到儲存空間限制，進度已暫存於記憶體。請複製備份碼以保存您的進度。';
  document.body.appendChild(warning);

  const modal = document.createElement('div');
  modal.id = 'backupModal';
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '進度備份碼');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px;">
      <h2 style="font-family:'Noto Serif TC',serif;color:var(--navy-deep);font-size:1.5rem;margin-bottom:0.5rem;">📋 進度備份碼</h2>
      <p style="font-size:0.88rem;color:#666;margin-bottom:1.2rem;line-height:1.65;">
        無法自動儲存進度。請複製以下備份碼，下次可貼入以恢復進度。
      </p>
      <div id="codeDisplay" tabindex="0"></div>
      <div id="modalErrorBanner">複製失敗，請手動框選文字後按 Ctrl+C（Mac：⌘C）。</div>
      <div style="display:flex;gap:0.8rem;justify-content:center;flex-wrap:wrap;">
        <button id="copyBtn" class="primary-btn copy-btn" onclick="copyCode()" style="min-width:160px;min-height:44px;">一鍵複製進度碼</button>
        <button class="primary-btn" onclick="document.getElementById('backupModal').classList.remove('open');document.getElementById('backupModal').setAttribute('aria-hidden','true');"
          style="background:transparent;border:2px solid var(--navy-deep);color:var(--navy-deep);min-height:44px;">關閉</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

/* ════════════════════════════════════════════════════════════════
   §4  UI 工具函式
════════════════════════════════════════════════════════════════ */
function updatePoints() {
  if (DOM.userPoints) DOM.userPoints.textContent = state.points;
  updateCrownStage(state.points);
}

/* ════════════════════════════════════════════════════════════════
   §4.1  王子視覺進化（updateCrownStage）
   ─────────────────────────────────────────────────────────────
   依積分在 header 設定 data-stage 屬性，觸發 CSS 視覺階段切換。
   同步更新積分卡下方的稱號徽章（#rank-badge）。
════════════════════════════════════════════════════════════════ */
function updateCrownStage(points) {
  const header = document.querySelector('header');
  const badge  = document.getElementById('rank-badge');
  if (!header) return;

  // 對應 RANK_TABLE 的6個階段
  let stage, icon, title;
  if      (points >= 800) { stage = 5; icon = '♛';  title = '數學王子';   }
  else if (points >= 500) { stage = 4; icon = '👑';  title = '數學將軍';   }
  else if (points >= 300) { stage = 3; icon = '🏹';  title = '數學騎士';   }
  else if (points >= 150) { stage = 2; icon = '🛡️'; title = '數學武士';   }
  else if (points >= 50)  { stage = 1; icon = '⚔️';  title = '數學見習生'; }
  else                    { stage = 0; icon = '🌱';  title = '數學學徒';   }

  const prev = parseInt(header.dataset.stage ?? '-1');
  header.dataset.stage = stage;

  // 稱號徽章更新
  if (badge) badge.textContent = `${icon} ${title}`;

  // 首次升階：顯示慶祝 Toast
  if (prev !== -1 && stage > prev) {
    setTimeout(() => {
      showToast(`🎉 稱號晉升！您已成為「${icon} ${title}」！`, 'success', 4000);
    }, 300);
  }
}

function showToast(msg, type = 'default', dur = 3000) {
  window.MathPrince.InputGuard.showToast(msg, type, dur);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;')
    .replace(/`/g,  '&#96;');
}

function setAnswerZoneVisible(visible) {
  const zone = DOM.answerInput?.closest('.answer-zone');
  if (zone) zone.style.display = visible ? '' : 'none';
}

/* ════════════════════════════════════════════════════════════════
   §4.5  進度持久化（修正三：回首頁不歸零）
   ─────────────────────────────────────────────────────────────
   儲存結構：{ [unitCode]: { index, points } }
   · 每次答對或跳過後更新
   · 進入單元時若有紀錄，從上次題號繼續
   · 單元完成後清除該單元進度（避免無限重做）
════════════════════════════════════════════════════════════════ */
function saveUnitProgress() {
  try {
    const raw  = localStorage.getItem(PROGRESS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[state.currentUnit] = {
      index:  state.currentIndex,
      points: state.points,
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
  } catch (_) {}
}

function loadUnitProgress(unitCode) {
  try {
    const raw  = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data[unitCode] ?? null;
  } catch (_) { return null; }
}

function clearUnitProgress(unitCode) {
  try {
    const raw  = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    delete data[unitCode];
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
  } catch (_) {}
}

/* ════════════════════════════════════════════════════════════════
   §4.55  各單元答題統計（支援覺醒評鑑）
   ─────────────────────────────────────────────────────────────
   結構：{ [unitCode]: { attempted, correct, skipped } }
   · attempted：提交答案的次數（含對與錯）
   · correct  ：答對題數
   · skipped  ：跳過題數（不計分）
════════════════════════════════════════════════════════════════ */
function recordStat(unitCode, type) {
  // type: 'correct' | 'wrong' | 'skipped'
  if (!unitCode) {
    console.warn('[Stats] unitCode 為空，略過記錄');
    return;
  }
  try {
    const raw   = localStorage.getItem(STATS_KEY);
    const data  = raw ? JSON.parse(raw) : {};
    if (!data[unitCode]) data[unitCode] = { attempted: 0, correct: 0, skipped: 0 };
    if (type === 'correct') { data[unitCode].attempted++; data[unitCode].correct++; }
    else if (type === 'wrong')   { data[unitCode].attempted++; }
    else if (type === 'skipped') { data[unitCode].skipped++;   }
    localStorage.setItem(STATS_KEY, JSON.stringify(data));
    console.log('[Stats] 記錄', unitCode, type, data[unitCode]);
  } catch (err) {
    console.error('[Stats] 記錄失敗：', err);
  }
}

function loadAllStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

/* ════════════════════════════════════════════════════════════════
   §4.6  複合答案正規化（§14.9.2 全局擴充）
   ─────────────────────────────────────────────────────────────
   適用於全部 8 個單元的所有題目。
   SmartGrader 處理單一數值很準確，但複合答案（含多個數值
   或修飾詞）容易因格式不同而誤判。此層在送出前統一清洗。

   覆蓋場景（舉例）：
   · 「9段、0公尺」  = 「9段，剩下0公尺」（Unit 1 分數）
   · 「甲店，多6支」 = 「甲店多6支」     （Unit 7 統計）
   · 「x=12」       = 「12」              （Unit 8 方程）
   · 「1又1/2公尺」 = 「1.5公尺」        （SmartGrader 混合數）
   · 「8包，0公斤」  = 「8包，剩下0公斤」

   正規化管線（順序不可顛倒）：
   P1. 全形 → 半形
   P2. 統一分隔符（頓號、分號、換行 → 逗號）
   P3. 移除答案修飾前綴詞（「剩下」「共」「約」等）
   P4. 移除標點符號前後的冗餘空白
   P5. 移除數字與中文單位之間的空白
════════════════════════════════════════════════════════════════ */
function normalizeCompositeAnswer(userInput, correctAnswer) {
  function pipeline(s) {
    s = String(s ?? '');

    // P1：全形數字/符號 → 半形
    s = s.replace(/[\uFF01-\uFF5E]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    );

    // P2：統一複合分隔符 → 逗號（頓號、分號、換行、全形逗號）
    s = s.replace(/[、；\n\r\uff0c]/g, '，');

    // P3：同義詞正規化（§14.9.2 語意等價擴充）
    //   「相等/一樣/相同/不差」→ 統一為「相等」
    s = s.replace(/一樣|相同|不差/g, '相等');

    // P3b：文字答案裝飾前綴剝除
    //   適用 Unit7 趨勢判斷題：
    //     「整體呈現上升」→「上升」
    //     「整體呈現下降」→「下降」
    //     「呈上升趨勢」  →「上升」
    //   適用 Unit2 比較題：
    //     「活動A比較便宜」→「活動A」（保留主體）
    //   剝除：「整體呈現」「整體」「呈現」「呈」「趨勢」「比較便宜」「比較貴」
    s = s.replace(/整體呈現|整體|呈現(?=[上下先])/g, '');
    s = s.replace(/趨勢/g, '');
    s = s.replace(/呈(?=[上下先升降])/g, '');
    // 「比較便宜」「比較貴」→「便宜」「貴」（保留核心比較詞）
    s = s.replace(/比較(便宜|貴|划算|少|多)/g, '$1');

    // P4：零差值正規化
    //   「多0」「少0」「差0」「多 0」→ 移除方向詞，只保留「0」
    //   使「相等，差0公尺」= 「相等，多0公尺」= 「相等，0公尺」
    s = s.replace(/(多|少|差)\s*0/g, '0');

    // P3c：狀態類同義詞
    //   「沒有改變」「保持不變」「維持不變」→「不變」
    //   「先升後降」「先漲後跌」→「先升後降」
    s = s.replace(/沒有改變|保持不變|維持不變/g, '不變');
    s = s.replace(/先漲後跌|先高後低/g, '先升後降');

    // P5：移除答案修飾詞（全局）
    //   「剩下」「共有」「共」「約」「相差」「合計」「一共」「總共」
    //   「結果是」「答案是」「等於」「得」「賺」「賠」前綴
    s = s.replace(/剩下|共有|共|約|相差|合計|一共|總共|結果是|答案是|等於|得(?=\d)/g, '');

    // P5b：移除所有空白（含半形空格）
    //   「活動 A 便宜」→「活動A便宜」
    //   「第二節 到 第三節」→「第二節到第三節」
    s = s.replace(/\s/g, '');

    // P6：逗號前後冗餘空白
    s = s.replace(/\s*，\s*/g, '，');

    // P7：數字與中文單位之間的空白（「9 段」→「9段」）
    s = s.replace(/(\d)\s+([\u4E00-\u9FFF])/g, '$1$2');
    s = s.replace(/([\u4E00-\u9FFF])\s+(\d)/g, '$1$2');

    // P8：移除首尾空白
    s = s.trim();

    return s;
  }

  /* ── 特殊情況：純同義詞答案（無數字）
     學童只答「一樣」或「相同」而沒有附上數字，
     且正確答案的核心是「相等，差0」→ 等值接受。
     原理：pipeline 後正確答案會變成「相等，0公尺」等；
           若學童只答「相等」（原為一樣/相同），視為等值。  */
  const uNorm = pipeline(userInput);
  const cNorm = pipeline(String(correctAnswer));

  // 若正確答案含「相等」且含「0」，而學童答案是純「相等」→ 接受
  if (uNorm === '相等' && cNorm.includes('相等') && /，?0/.test(cNorm)) {
    return { userNorm: cNorm, correctNorm: cNorm }; // 強制等值
  }

  return { userNorm: uNorm, correctNorm: cNorm };
}

/* ════════════════════════════════════════════════════════════════
   §5  Unit 7 資料排版
════════════════════════════════════════════════════════════════ */
function buildQuestionHTML(question, unitCode) {
  const escaped = esc(question);
  if (unitCode !== 'D') return escaped;

  const DATA_PATTERN =
    /([^。\n]*[:：][^。\n]*\d+[^。\n]*[、，,][^。\n]*\d+[^。\n]*(?:。)?)/g;
  return escaped.replace(DATA_PATTERN, match => `<span class="mp-data-block">${match}</span>`);
}

/* ════════════════════════════════════════════════════════════════
   §6  題目渲染
════════════════════════════════════════════════════════════════ */
function renderQuestion() {
  const q        = getCurrentQuestion();
  const baseQ    = state.questions[state.currentIndex];
  const unitCode = state.currentUnit;

  if (!q || !DOM.questionDisplay) return;

  const hasVariant     = !!(baseQ && baseQ.variant);
  const isLastQuestion = state.currentIndex >= state.questions.length - 1;
  const hitLimit       = state.wrongCount >= WRONG_LIMIT;

  let html = `<div class="mp-question-enter">`;

  // 進度列
  html += `
    <div style="display:flex;justify-content:space-between;align-items:center;
      margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:2px solid var(--navy-light);">
      <span style="font-size:0.85rem;color:var(--navy-mid);font-weight:600;">
        第 ${state.currentIndex + 1} / ${state.questions.length} 題
        ${state.isVariantMode
          ? `<span style="background:var(--gold-light);color:var(--gold-mid);border-radius:4px;
              padding:2px 8px;margin-left:8px;font-size:0.78rem;font-weight:700;">變體題</span>`
          : ''}
      </span>
      <span style="font-size:0.9rem;color:var(--gold-mid);font-weight:600;">
        🏆 ${state.points} 分
      </span>
    </div>`;

  // 題目本文
  html += `
    <div class="q-body" style="white-space:pre-wrap;line-height:1.95;margin-bottom:2rem;">
      ${buildQuestionHTML(q.question, unitCode)}
    </div>`;

  // 答對後：詳解 + 按鈕
  if (state.answered) {
    const expHTML = buildQuestionHTML(q.explanation || '', unitCode);
    html += `
      <div id="mp-explanation-zone" style="margin-top:0.5rem;">
        <button id="toggle-explanation-btn" style="
          background:var(--gold-light);border:1px solid var(--gold);color:var(--gold-mid);
          padding:0.55rem 1.3rem;border-radius:8px;cursor:pointer;
          font-size:0.9rem;font-weight:600;margin-bottom:0.5rem;transition:background 0.2s;">
          📖 查看詳解
        </button>
        <div id="mp-explanation-content" class="mp-explanation" style="
          background:var(--chalk);border-left:4px solid var(--gold);
          border-radius:0 12px 12px 0;white-space:pre-wrap;line-height:1.9;font-size:0.93rem;">
          ${expHTML}
        </div>
      </div>
      <div style="display:flex;gap:0.8rem;flex-wrap:wrap;margin-top:1.8rem;">
        ${hasVariant
          ? `<button id="retry-variant-btn" class="primary-btn"
               style="background:var(--gold-mid);min-height:44px;">
               🔄 ${state.isVariantMode ? '切回原題' : '重新練習（變體）'}
             </button>`
          : ''}
        <button id="next-question-btn" class="primary-btn"
          style="background:var(--success,#2D6A4F);min-height:44px;">
          ${isLastQuestion ? '完成單元 🎉' : '下一題 →'}
        </button>
      </div>`;

  } else if (hitLimit) {
    /* ── §14.5.1/14.5.3 答錯3次：中斷機制 ──────────────
       顯示「查看答案」與「跳過此題」，解除挫折感。      */
    html += `
      <div class="mp-frustration-zone">
        <p>💡 你已經很努力了！先看看答案，繼續下一題吧。</p>
        <div class="btn-row">
          <button id="show-answer-btn" class="primary-btn"
            style="background:var(--gold-mid);min-height:44px;">
            💡 查看答案與詳解
          </button>
          <button id="skip-question-btn" class="primary-btn"
            style="background:var(--navy-mid);min-height:44px;">
            ${isLastQuestion ? '完成單元 🎉' : '跳過此題 →'}
          </button>
        </div>
      </div>`;
  }

  html += `</div>`;

  DOM.questionDisplay.innerHTML = html;

  // 事件綁定
  $id('toggle-explanation-btn')?.addEventListener('click', toggleExplanation);
  $id('retry-variant-btn')?.addEventListener('click', window.retryVariant);
  $id('next-question-btn')?.addEventListener('click', window.nextQuestion);

  // §14.5.1 中斷按鈕
  $id('show-answer-btn')?.addEventListener('click', showAnswerAndExplanation);
  $id('skip-question-btn')?.addEventListener('click', () => {
    saveUnitProgress();
    window.nextQuestion();
  });

  // 控制輸入區可見性（已答對或已達上限時隱藏）
  setAnswerZoneVisible(!state.answered && !hitLimit);

  if (!state.answered && !hitLimit && DOM.answerInput) {
    DOM.answerInput.value    = '';
    DOM.answerInput.disabled = false;
    setTimeout(() => DOM.answerInput?.focus(), 160);
  }
}

/* ════════════════════════════════════════════════════════════════
   §6.5  §14.5.1 顯示答案與詳解（不計分）
════════════════════════════════════════════════════════════════ */
function showAnswerAndExplanation() {
  const q        = getCurrentQuestion();
  const unitCode = state.currentUnit;
  if (!q || !DOM.questionDisplay) return;

  const isLastQuestion = state.currentIndex >= state.questions.length - 1;
  const expHTML = buildQuestionHTML(q.explanation || '', unitCode);

  // 找到中斷區塊，替換為答案+詳解展示
  const zone = DOM.questionDisplay.querySelector('.mp-frustration-zone');
  if (zone) {
    zone.innerHTML = `
      <p style="font-weight:700;color:var(--navy-deep);margin-bottom:0.5rem;">
        ✅ 正確答案：<span style="color:var(--success,#2D6A4F);font-size:1.05rem;">${esc(q.answer)}</span>
      </p>
      <div id="mp-explanation-content" class="mp-explanation open" style="
        background:var(--chalk);border-left:4px solid var(--gold);
        border-radius:0 12px 12px 0;white-space:pre-wrap;line-height:1.9;font-size:0.93rem;
        text-align:left;margin-top:0.8rem;">
        ${expHTML}
      </div>
      <div class="btn-row" style="margin-top:1.2rem;">
        <button id="skip-question-btn" class="primary-btn"
          style="background:var(--navy-mid);min-height:44px;">
          ${isLastQuestion ? '完成單元 🎉' : '繼續下一題 →'}
        </button>
      </div>
    `;
    $id('skip-question-btn')?.addEventListener('click', () => {
      recordStat(state.currentUnit, 'skipped');
      saveUnitProgress();
      window.nextQuestion();
    });
  }
}

/* ════════════════════════════════════════════════════════════════
   §7  詳解展開/收起
════════════════════════════════════════════════════════════════ */
function toggleExplanation() {
  const content = $id('mp-explanation-content');
  const btn     = $id('toggle-explanation-btn');
  if (!content) return;
  const isOpen = content.classList.contains('open');
  content.classList.toggle('open', !isOpen);
  if (btn) btn.textContent = isOpen ? '📖 查看詳解' : '📖 收起詳解';
}

/* ════════════════════════════════════════════════════════════════
   §8  答題核心邏輯
════════════════════════════════════════════════════════════════ */
function handleValidSubmit(cleanValue) {
  if (state.answered) return;
  if (state.wrongCount >= WRONG_LIMIT) return; // 已達上限，輸入區已隱藏

  const { SmartGrader, StorageGuard } = window.MathPrince;
  const q = getCurrentQuestion();
  if (!q) return;

  /* ── 修正二：複合答案正規化預處理 §14.9.2 ──────────
     先對使用者輸入與正確答案做正規化，
     再送給 SmartGrader 進行判定。                     */
  const { userNorm, correctNorm } = normalizeCompositeAnswer(cleanValue, q.answer);
  const result = SmartGrader.gradeAnswer(userNorm, correctNorm, 'auto');

  if (result.verdict === 'correct') {
    /* ── 答對 ── */
    state.points   += 10;
    state.answered  = true;
    state.wrongCount = 0;
    updatePoints();
    setAnswerZoneVisible(false);

    DOM.submitBtn?.classList.add('mp-correct');
    setTimeout(() => DOM.submitBtn?.classList.remove('mp-correct'), 700);

    showToast('🎉 答對了！+10 覺醒積分', 'success', 3000);

    // 記錄答題統計
    recordStat(state.currentUnit, 'correct');

    // 存進度（修正三）
    saveUnitProgress();
    StorageGuard.safeSave({ progress: state.currentIndex, points: state.points, unit: state.currentUnit });

    renderQuestion();

  } else if (result.verdict === 'wrong') {
    /* ── 答錯流程前：純文字答案備援比對（§14.9.2 擴充）
       SmartGrader 以數值邏輯為主，無法判斷純文字是否等值。
       若正規化後的字串完全相同，視為答對。
       適用：Unit7 趨勢題、Unit2 比較題、Unit6 不變題等。  */
    if (userNorm === correctNorm && userNorm.length > 0) {
      // 強制答對
      state.points   += 10;
      state.answered  = true;
      state.wrongCount = 0;
      updatePoints();
      setAnswerZoneVisible(false);
      DOM.submitBtn?.classList.add('mp-correct');
      setTimeout(() => DOM.submitBtn?.classList.remove('mp-correct'), 700);
      showToast('🎉 答對了！+10 覺醒積分', 'success', 3000);
      recordStat(state.currentUnit, 'correct');
      saveUnitProgress();
      StorageGuard.safeSave({ progress: state.currentIndex, points: state.points, unit: state.currentUnit });
      renderQuestion();
      return;
    }

    /* ── 答錯 ── */
    state.wrongCount++;

    DOM.answerInput?.classList.add('mp-shake');
    setTimeout(() => DOM.answerInput?.classList.remove('mp-shake'), 420);

    // 記錄答錯統計
    recordStat(state.currentUnit, 'wrong');

    if (state.wrongCount >= WRONG_LIMIT) {
      /* §14.5.1 達到上限：觸發中斷機制 */
      showToast('沒關係，先看看提示吧！', 'default', 2500);
      renderQuestion(); // 重繪以顯示中斷區塊
    } else {
      const remaining = WRONG_LIMIT - state.wrongCount;
      showToast(
        `再想想看，你可以的！💪（還有 ${remaining} 次提示機會）`,
        'error', 2500
      );
    }
  }
  // verdict === 'invalid' 由 InputGuard 內部處理
}

/* ════════════════════════════════════════════════════════════════
   §9  全域互動函式
════════════════════════════════════════════════════════════════ */
window.retryVariant = function retryVariant() {
  const baseQ = state.questions[state.currentIndex];
  if (!baseQ) return;

  if (state.isVariantMode) {
    state.isVariantMode = false;
    state.answered      = false;
    state.wrongCount    = 0;
    renderQuestion();
    showToast('🔄 已切換回原題目', 'default', 1800);
    return;
  }

  const v = state.questions[state.currentIndex].variant;
  const variantIsValid = v &&
    typeof v === 'object' &&
    typeof v.question === 'string' && v.question.trim() !== '' &&
    typeof v.answer   === 'string' && v.answer.trim()   !== '';

  if (!variantIsValid) {
    state.isVariantMode = false;
    state.answered      = false;
    state.wrongCount    = 0;
    showToast('此題已是最終型態，請直接重新挑戰原題', 'default', 2800);
    return;
  }

  state.isVariantMode = true;
  state.answered      = false;
  state.wrongCount    = 0;
  renderQuestion();
  showToast('🔄 已切換至變體題目', 'default', 1800);
};

window.nextQuestion = function nextQuestion() {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex++;
    state.isVariantMode = false;
    state.answered      = false;
    state.wrongCount    = 0;
    saveUnitProgress();
    renderQuestion();
  } else {
    showFinishScreen();
  }
};

window.openUnit = async function openUnit(unitCode) {
  if (!UNIT_MAP[unitCode]) {
    showToast('找不到對應單元資料', 'error');
    return;
  }
  if (DOM.unitMenu)  DOM.unitMenu.style.display  = 'none';
  if (DOM.quizShell) DOM.quizShell.style.display = 'block';
  await loadUnit(unitCode);
};

/* ════════════════════════════════════════════════════════════════
   §10  資料載入（含進度恢復，修正三）
════════════════════════════════════════════════════════════════ */
async function loadUnit(unitCode) {
  const info = UNIT_MAP[unitCode];

  if (DOM.questionDisplay) {
    DOM.questionDisplay.innerHTML = `
      <div style="text-align:center;padding:4rem 2rem;color:var(--navy-mid);">
        <div class="mp-spinner">⟳</div>
        <p style="margin-top:1.2rem;font-size:0.95rem;line-height:1.6;">
          正在載入《${info.name}》⋯
        </p>
      </div>`;
  }
  setAnswerZoneVisible(false);

  try {
    const response = await fetch(info.file);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('題庫格式異常');

    state.questions     = data;
    state.isVariantMode = false;
    state.answered      = false;
    state.wrongCount    = 0;
    state.currentUnit   = unitCode;

    /* ── 修正三：恢復上次進度 ──────────────────────── */
    const saved = loadUnitProgress(unitCode);
    if (saved && saved.index > 0 && saved.index < data.length) {
      state.currentIndex = saved.index;
      // 積分取較大值（避免用舊積分覆蓋當前較高積分）
      if (saved.points > state.points) {
        state.points = saved.points;
        updatePoints();
      }
      showToast(`📌 已從第 ${saved.index + 1} 題繼續`, 'default', 2500);
    } else {
      state.currentIndex = 0;
    }

    setAnswerZoneVisible(true);
    renderQuestion();

  } catch (err) {
    console.error('[Main] 資料載入失敗：', err.message);
    if (DOM.questionDisplay) {
      DOM.questionDisplay.innerHTML = `
        <div style="text-align:center;padding:3.5rem 1rem;">
          <div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>
          <h3 style="color:var(--error,#8B1A1A);font-family:'Noto Serif TC',serif;margin-bottom:0.8rem;">資料讀取異常</h3>
          <p style="color:#666;font-size:0.9rem;margin-bottom:2rem;line-height:1.7;">
            請確認網路連線正常後重試。<br>若問題持續，請返回首頁重新選擇單元。
          </p>
          <div style="display:flex;gap:0.8rem;justify-content:center;flex-wrap:wrap;">
            <button class="primary-btn" onclick="window.openUnit('${esc(unitCode)}')" style="min-height:44px;">🔄 重新載入</button>
            <button class="primary-btn" onclick="location.reload()"
              style="background:transparent;border:2px solid var(--navy-deep);color:var(--navy-deep);min-height:44px;">← 返回首頁</button>
          </div>
        </div>`;
    }
    showToast('資料讀取異常，請檢查網路', 'error', 4500);
  }
}

/* ════════════════════════════════════════════════════════════════
   §11  完成畫面
════════════════════════════════════════════════════════════════ */
function showFinishScreen() {
  if (!DOM.questionDisplay) return;

  /* ── 修正三：完成後不自動清除進度，讓學童自己選擇 ──────────
     · 「重新開始」→ 清除本單元進度，從第1題重頭練習（適合
       想重新計分、或遺忘後再挑戰的學童）
     · 「返回選單」→ 保留進度，下次進入從上次位置繼續
     (若學童選「重新開始」才呼叫 clearUnitProgress)             */

  window.MathPrince.StorageGuard.safeSave({
    progress: state.questions.length,
    points:   state.points,
    unit:     state.currentUnit,
    completed: true,
  });

  const unitCode = state.currentUnit;

  DOM.questionDisplay.innerHTML = `
    <div class="mp-question-enter" style="text-align:center;padding:3.5rem 1rem;">
      <div style="font-size:3.5rem;margin-bottom:1.2rem;">🎓</div>
      <h2 style="font-family:'Noto Serif TC',serif;color:var(--navy-deep);
        font-size:1.8rem;margin-bottom:0.6rem;">恭喜完成本單元！</h2>
      <p style="color:var(--gold-mid);font-size:1.15rem;margin-bottom:0.5rem;
        font-weight:600;line-height:1.7;">
        本次共獲得<br>
        <span style="font-size:2.2rem;font-family:'Crimson Pro',serif;">
          ${state.points}
        </span> 覺醒積分 ✨
      </p>
      <p style="font-size:0.85rem;color:#888;margin-bottom:2rem;line-height:1.7;">
        接下來你想怎麼做？
      </p>
      <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
        <button
          id="restart-unit-btn"
          class="primary-btn"
          style="background:var(--gold-mid);min-height:44px;padding:0.9rem 1.8rem;">
          🔄 重新挑戰（從頭開始）
        </button>
        <button
          class="primary-btn"
          onclick="location.reload()"
          style="background:var(--navy-mid);min-height:44px;padding:0.9rem 1.8rem;">
          ← 返回選單（保留紀錄）
        </button>
      </div>
      <p style="font-size:0.75rem;color:#bbb;margin-top:1.2rem;line-height:1.6;">
        「保留紀錄」可讓家長查看學習報告；「重新挑戰」積分將重新累計。
      </p>
    </div>`;

  setAnswerZoneVisible(false);

  // 綁定「重新挑戰」按鈕：清除進度後重新載入本單元
  $id('restart-unit-btn')?.addEventListener('click', () => {
    clearUnitProgress(unitCode);
    // 重置狀態
    state.currentIndex  = 0;
    state.isVariantMode = false;
    state.answered      = false;
    state.wrongCount    = 0;
    // 重新載入（不 reload 整頁，保留已累積的總積分）
    setAnswerZoneVisible(true);
    loadUnit(unitCode);
  });
}

/* ════════════════════════════════════════════════════════════════
   §11.5  覺醒評鑑報告（window.showAssessment）
   ─────────────────────────────────────────────────────────────
   稱號系統（依總積分）：
     0–49   → 🌱 數學學徒
     50–149 → ⚔️ 數學見習生
     150–299→ 🛡️ 數學武士
     300–499→ 🏹 數學騎士
     500–799→ 👑 數學將軍
     800+   → ♛  數學王子
════════════════════════════════════════════════════════════════ */

const RANK_TABLE = [
  { min: 800, icon: '♛',  title: '數學王子',  color: '#C8960A' },
  { min: 500, icon: '👑', title: '數學將軍',  color: '#2A4A8A' },
  { min: 300, icon: '🏹', title: '數學騎士',  color: '#1A6640' },
  { min: 150, icon: '🛡️', title: '數學武士',  color: '#5A3A8A' },
  { min: 50,  icon: '⚔️', title: '數學見習生',color: '#8A5A2A' },
  { min: 0,   icon: '🌱', title: '數學學徒',  color: '#4A6A4A' },
];

function getRank(points) {
  return RANK_TABLE.find(r => points >= r.min) || RANK_TABLE[RANK_TABLE.length - 1];
}

window.showAssessment = function showAssessment() {
  const stats   = loadAllStats();
  const points  = state.points;
  const rank    = getRank(points);

  // 八大單元順序
  const UNIT_ORDER = [
    { code: 'F', name: '分數的運算' },
    { code: 'P', name: '百分率與應用' },
    { code: 'S', name: '速率與時間' },
    { code: 'R', name: '比與比例' },
    { code: 'C', name: '圓與扇形' },
    { code: 'A', name: '平均數問題' },
    { code: 'D', name: '圖表判讀' },
    { code: 'E', name: '一元一次方程' },
  ];

  // 計算各單元勝率
  const unitRows = UNIT_ORDER.map(({ code, name }) => {
    const s    = stats[code] || { attempted: 0, correct: 0, skipped: 0 };
    const rate = s.attempted > 0 ? Math.round(s.correct / s.attempted * 100) : null;
    const isWeak = rate !== null && rate < 60;
    return { code, name, ...s, rate, isWeak };
  });

  const weakUnits = unitRows.filter(u => u.isWeak).map(u => u.name);
  const attempted = unitRows.filter(u => u.attempted > 0).length;

  // 下一個稱號
  const nextRankIdx = RANK_TABLE.findIndex(r => points >= r.min) - 1;
  const nextRank    = nextRankIdx >= 0 ? RANK_TABLE[nextRankIdx] : null;
  const nextPts     = nextRank ? nextRank.min - points : 0;

  // 建立 Modal
  let existing = $id('mp-assessment-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mp-assessment-modal';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:3000;',
    'background:rgba(26,45,90,0.72);backdrop-filter:blur(6px);',
    'display:flex;align-items:center;justify-content:center;padding:1rem;',
    'overflow-y:auto;'
  ].join('');

  // 單元列表 HTML
  const rowsHTML = unitRows.map(u => {
    const barW   = u.rate !== null ? u.rate : 0;
    const barClr = u.rate === null ? '#ccc'
                 : u.rate >= 80   ? '#2D6A4F'
                 : u.rate >= 60   ? '#A87C08'
                 : '#8B1A1A';
    const badge  = u.isWeak
      ? `<span style="background:#FFF0F0;color:#8B1A1A;font-size:0.68rem;
           padding:2px 7px;border-radius:4px;margin-left:6px;font-weight:700;">需加強</span>`
      : '';
    const rateStr = u.rate !== null ? `${u.rate}%` : '未作答';

    return `
      <div style="margin-bottom:0.9rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;
          margin-bottom:0.3rem;font-size:0.83rem;">
          <span style="color:#1A2D5A;font-weight:600;">Unit ${u.code === 'F' ? '01'
            : u.code === 'P' ? '02' : u.code === 'S' ? '03' : u.code === 'R' ? '04'
            : u.code === 'C' ? '05' : u.code === 'A' ? '06' : u.code === 'D' ? '07' : '08'}
            &nbsp;${u.name}${badge}</span>
          <span style="color:${barClr};font-weight:700;font-size:0.85rem;">${rateStr}</span>
        </div>
        <div style="background:#E6ECF7;border-radius:6px;height:10px;overflow:hidden;">
          <div style="background:${barClr};height:100%;width:${barW}%;
            border-radius:6px;transition:width 0.6s ease;"></div>
        </div>
        <div style="font-size:0.72rem;color:#888;margin-top:0.2rem;">
          作答 ${u.attempted} 次・答對 ${u.correct} 題・跳過 ${u.skipped} 題
        </div>
      </div>`;
  }).join('');

  const weakHTML = weakUnits.length > 0
    ? `<div style="background:#FFF8E7;border:1px solid #C8960A;border-radius:10px;
         padding:0.9rem 1.2rem;margin-top:1rem;">
         <p style="font-size:0.82rem;font-weight:700;color:#8A5A2A;margin-bottom:0.3rem;">
           ⚠️ 建議加強的單元
         </p>
         <p style="font-size:0.82rem;color:#5A3A1A;line-height:1.7;">
           ${weakUnits.join('、')}
         </p>
       </div>`
    : attempted > 0
      ? `<div style="background:#F0F8F4;border:1px solid #2D6A4F;border-radius:10px;
           padding:0.9rem 1.2rem;margin-top:1rem;">
           <p style="font-size:0.82rem;color:#2D6A4F;font-weight:600;">
             ✅ 目前作答表現良好，繼續保持！
           </p>
         </div>`
      : '';

  const nextHTML = nextRank
    ? `<p style="font-size:0.8rem;color:#888;margin-top:0.4rem;">
         再獲得 <strong style="color:#C8960A;">${nextPts} 分</strong>
         即可晉升「${nextRank.icon} ${nextRank.title}」
       </p>`
    : `<p style="font-size:0.8rem;color:#C8960A;margin-top:0.4rem;">
         ♛ 已達最高榮耀！
       </p>`;

  overlay.innerHTML = `
    <div style="background:#FAFAF6;border-radius:24px;width:100%;max-width:560px;
      padding:2.5rem 2rem;position:relative;max-height:90vh;overflow-y:auto;">

      <!-- 關閉按鈕 -->
      <button onclick="document.getElementById('mp-assessment-modal').remove()"
        style="position:absolute;top:1.2rem;right:1.2rem;background:none;border:none;
          font-size:1.4rem;cursor:pointer;color:#888;line-height:1;">✕</button>

      <!-- 稱號區 -->
      <div style="text-align:center;margin-bottom:1.8rem;">
        <div style="font-size:3rem;margin-bottom:0.4rem;">${rank.icon}</div>
        <h2 style="font-family:'Noto Serif TC',serif;color:${rank.color};
          font-size:1.6rem;margin-bottom:0.1rem;">${rank.title}</h2>
        <p style="font-family:'Crimson Pro',Georgia,serif;font-style:italic;
          font-size:0.85rem;color:#aaa;letter-spacing:0.1em;">
          覺醒評鑑報告
        </p>
        <div style="font-size:2.4rem;font-weight:700;color:#1A2D5A;
          font-family:'Crimson Pro',Georgia,serif;margin-top:0.5rem;">
          ${points} <span style="font-size:1rem;color:#888;font-weight:400;">覺醒積分</span>
        </div>
        ${nextHTML}
      </div>

      <!-- 分隔線 -->
      <div style="height:1px;background:linear-gradient(90deg,transparent,#C8960A,transparent);
        margin-bottom:1.5rem;"></div>

      <!-- 八大單元勝率 -->
      <h3 style="font-family:'Noto Serif TC',serif;font-size:1rem;color:#1A2D5A;
        margin-bottom:0.4rem;">📊 各單元作答勝率</h3>
      <p style="font-size:0.72rem;color:#bbb;margin-bottom:1rem;line-height:1.6;">
        ※ 統計從首次使用覺醒評鑑功能後開始累積，歷史答題不回溯。
      </p>
      ${rowsHTML}

      <!-- 弱點分析 -->
      ${weakHTML}

      <!-- 底部按鈕 -->
      <div style="text-align:center;margin-top:1.5rem;">
        <button onclick="document.getElementById('mp-assessment-modal').remove()"
          class="primary-btn" style="min-height:44px;padding:0.8rem 2.5rem;">
          繼續練習 →
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 點擊背景關閉
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
};

/* ════════════════════════════════════════════════════════════════
   §11.6  家長學習報告（window.showParentReport）
   ─────────────────────────────────────────────────────────────
   設計目標：
   · 正式、清晰、數據導向（與學童評鑑的遊戲風格區隔）
   · 顯示各單元的正確率、作答量、弱點警示
   · 提供建議語句幫助家長引導孩子
   · 可一鍵列印（window.print()）
════════════════════════════════════════════════════════════════ */
window.showParentReport = function showParentReport() {
  const stats  = loadAllStats();
  const points = state.points;
  const rank   = getRank(points);

  const UNIT_ORDER = [
    { code: 'F', name: '分數的運算',   num: '01' },
    { code: 'P', name: '百分率與應用', num: '02' },
    { code: 'S', name: '速率與時間',   num: '03' },
    { code: 'R', name: '比與比例',     num: '04' },
    { code: 'C', name: '圓與扇形',     num: '05' },
    { code: 'A', name: '平均數問題',   num: '06' },
    { code: 'D', name: '圖表判讀',     num: '07' },
    { code: 'E', name: '一元一次方程', num: '08' },
  ];

  const rows = UNIT_ORDER.map(({ code, name, num }) => {
    const s    = stats[code] || { attempted: 0, correct: 0, skipped: 0 };
    const rate = s.attempted > 0 ? Math.round(s.correct / s.attempted * 100) : null;
    return { code, name, num, ...s, rate,
      level: rate === null ? 'none'
           : rate >= 80   ? 'good'
           : rate >= 60   ? 'fair'
           : 'weak'
    };
  });

  const attempted   = rows.filter(r => r.attempted > 0).length;
  const totalQ      = rows.reduce((a, r) => a + r.attempted, 0);
  const totalCorrect= rows.reduce((a, r) => a + r.correct,  0);
  const totalRate   = totalQ > 0 ? Math.round(totalCorrect / totalQ * 100) : null;
  const weakUnits   = rows.filter(r => r.level === 'weak');
  const goodUnits   = rows.filter(r => r.level === 'good');
  const today       = new Date().toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric' });

  // 建議語句
  const suggestions = weakUnits.length === 0 && attempted === 0
    ? ['孩子尚未開始使用本平台，建議引導孩子從第一單元開始練習。']
    : weakUnits.length === 0
      ? ['孩子目前表現良好，建議持續練習以維持學習狀態。',
         '可鼓勵孩子嘗試挑戰變體題，進一步鞏固觀念。']
      : [
          `建議重點加強：${weakUnits.map(u => u.name).join('、')}。`,
          '可在親子共學時，先從詳解引導孩子理解解題步驟。',
          '每天練習1至2題，持續累積比一次大量練習更有效。',
        ];

  // 移除舊 Modal
  document.getElementById('mp-parent-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'mp-parent-modal';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:3000;',
    'background:rgba(26,45,90,0.75);backdrop-filter:blur(6px);',
    'display:flex;align-items:flex-start;justify-content:center;',
    'padding:1.5rem 1rem;overflow-y:auto;'
  ].join('');

  // 表格列
  const tableRows = rows.map(r => {
    const statusTxt = r.level === 'none' ? '未作答'
                    : r.level === 'good' ? '✅ 良好'
                    : r.level === 'fair' ? '⚠️ 普通'
                    : '❗ 需加強';
    const statusClr = r.level === 'good' ? '#2D6A4F'
                    : r.level === 'fair' ? '#8A6A1A'
                    : r.level === 'weak' ? '#8B1A1A'
                    : '#aaa';
    const rateStr   = r.rate !== null ? `${r.rate}%` : '—';
    return `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:0.55rem 0.5rem;font-size:0.83rem;color:#1A2D5A;font-weight:600;">
          Unit ${r.num}　${r.name}
        </td>
        <td style="padding:0.55rem 0.5rem;text-align:center;font-size:0.83rem;color:#444;">
          ${r.attempted}
        </td>
        <td style="padding:0.55rem 0.5rem;text-align:center;font-size:0.83rem;
          font-weight:700;color:${statusClr};">
          ${rateStr}
        </td>
        <td style="padding:0.55rem 0.5rem;text-align:center;font-size:0.78rem;
          color:${statusClr};font-weight:600;">
          ${statusTxt}
        </td>
      </tr>`;
  }).join('');

  const suggHTML = suggestions.map(s =>
    `<li style="margin-bottom:0.4rem;line-height:1.7;font-size:0.83rem;">${s}</li>`
  ).join('');

  overlay.innerHTML = `
    <div id="mp-parent-report-body" style="
      background:#FAFAF6;border-radius:20px;width:100%;max-width:620px;
      padding:2.5rem 2rem;position:relative;">

      <!-- 列印按鈕 -->
      <button onclick="window.print()"
        style="position:absolute;top:1.2rem;right:4rem;background:var(--navy-light,#E6ECF7);
          border:none;border-radius:8px;padding:0.4rem 0.9rem;font-size:0.78rem;
          color:var(--navy-deep,#1A2D5A);cursor:pointer;font-weight:600;">🖨️ 列印</button>
      <button onclick="document.getElementById('mp-parent-modal').remove()"
        style="position:absolute;top:1.2rem;right:1.2rem;background:none;border:none;
          font-size:1.4rem;cursor:pointer;color:#aaa;">✕</button>

      <!-- 標題 -->
      <div style="text-align:center;margin-bottom:1.8rem;border-bottom:2px solid var(--navy-light,#E6ECF7);padding-bottom:1.5rem;">
        <p style="font-size:0.75rem;color:#aaa;letter-spacing:0.15em;margin-bottom:0.3rem;">
          數學王子的覺醒 — 學習歷程報告
        </p>
        <h2 style="font-family:'Noto Serif TC',serif;color:#1A2D5A;font-size:1.4rem;margin-bottom:0.3rem;">
          👨‍👩‍👧 家長學習報告
        </h2>
        <p style="font-size:0.78rem;color:#888;">報告日期：${today}</p>
      </div>

      <!-- 總覽 -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.8rem;margin-bottom:1.8rem;">
        <div style="background:var(--navy-light,#E6ECF7);border-radius:10px;padding:0.9rem;text-align:center;">
          <div style="font-size:0.72rem;color:#2A4A8A;font-weight:600;margin-bottom:0.2rem;">覺醒積分</div>
          <div style="font-size:1.6rem;font-weight:700;color:#1A2D5A;font-family:'Crimson Pro',serif;">${points}</div>
        </div>
        <div style="background:var(--navy-light,#E6ECF7);border-radius:10px;padding:0.9rem;text-align:center;">
          <div style="font-size:0.72rem;color:#2A4A8A;font-weight:600;margin-bottom:0.2rem;">目前稱號</div>
          <div style="font-size:1rem;font-weight:700;color:#1A2D5A;">${rank.icon} ${rank.title}</div>
        </div>
        <div style="background:var(--navy-light,#E6ECF7);border-radius:10px;padding:0.9rem;text-align:center;">
          <div style="font-size:0.72rem;color:#2A4A8A;font-weight:600;margin-bottom:0.2rem;">整體正確率</div>
          <div style="font-size:1.6rem;font-weight:700;color:#1A2D5A;font-family:'Crimson Pro',serif;">
            ${totalRate !== null ? totalRate + '%' : '—'}
          </div>
        </div>
      </div>

      <!-- 各單元詳表 -->
      <h3 style="font-family:'Noto Serif TC',serif;font-size:0.95rem;color:#1A2D5A;
        margin-bottom:0.8rem;">📋 各單元學習詳況</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem;">
        <thead>
          <tr style="background:var(--navy-deep,#1A2D5A);color:#fff;">
            <th style="padding:0.55rem 0.5rem;text-align:left;font-size:0.78rem;border-radius:8px 0 0 0;">單元名稱</th>
            <th style="padding:0.55rem 0.5rem;text-align:center;font-size:0.78rem;">作答次數</th>
            <th style="padding:0.55rem 0.5rem;text-align:center;font-size:0.78rem;">正確率</th>
            <th style="padding:0.55rem 0.5rem;text-align:center;font-size:0.78rem;border-radius:0 8px 0 0;">學習狀態</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <!-- 弱點分布 -->
      ${weakUnits.length > 0 ? `
      <div style="background:#FFF8E7;border-left:4px solid #C8960A;border-radius:0 10px 10px 0;
        padding:1rem 1.2rem;margin-bottom:1.2rem;">
        <p style="font-weight:700;color:#8A5A2A;font-size:0.85rem;margin-bottom:0.4rem;">
          ⚠️ 需要重點加強的單元
        </p>
        <p style="font-size:0.82rem;color:#5A3A1A;line-height:1.7;">
          ${weakUnits.map(u => `Unit ${u.num}「${u.name}」（正確率 ${u.rate}%）`).join('　｜　')}
        </p>
      </div>` : ''}

      <!-- 家長建議 -->
      <div style="background:#F0F4FA;border-radius:10px;padding:1rem 1.2rem;margin-bottom:1.5rem;">
        <p style="font-weight:700;color:#1A2D5A;font-size:0.85rem;margin-bottom:0.6rem;">
          💡 給家長的建議
        </p>
        <ul style="padding-left:1.2rem;color:#444;">${suggHTML}</ul>
      </div>

      <!-- 說明 -->
      <p style="font-size:0.7rem;color:#ccc;text-align:center;line-height:1.7;">
        ※ 統計資料儲存於本裝置，不上傳至伺服器，請勿清除瀏覽器資料以免遺失紀錄。<br>
        ※ 正確率統計從安裝評鑑功能後開始累積。
      </p>

      <!-- 關閉 -->
      <div style="text-align:center;margin-top:1.2rem;">
        <button onclick="document.getElementById('mp-parent-modal').remove()"
          class="primary-btn" style="min-height:44px;padding:0.8rem 2.5rem;">
          關閉報告
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
};

/* ════════════════════════════════════════════════════════════════
   §12  事件綁定
════════════════════════════════════════════════════════════════ */
function bindUnitCardEvents() {
  const cards = document.querySelectorAll('#unit-menu .unit-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const code = card.dataset.unit;
      if (!code) return;
      card.classList.add('mp-loading');
      setTimeout(() => card.classList.remove('mp-loading'), 1800);
      window.openUnit(code);
    });
  });
}

/* ════════════════════════════════════════════════════════════════
   §13  初始化
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  injectStorageGuardModals();
  initDOMCache();

  const { StorageGuard, InputGuard } = window.MathPrince;

  const saved = StorageGuard.safeLoad();
  if (saved?.points) {
    state.points = saved.points;
    updatePoints(); // 同步觸發 updateCrownStage
  } else {
    updateCrownStage(0); // 初始階段
  }

  bindUnitCardEvents();

  InputGuard.init({
    onValidSubmit: (cleanValue) => { handleValidSubmit(cleanValue); }
  });

  StorageGuard.setupBeforeUnloadGuard(() => ({
    progress: state.currentIndex,
    points:   state.points,
    unit:     state.currentUnit,
  }));

  console.log('[D 組 main.js V4.2] ✅ 初始化完成');
});
