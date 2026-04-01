/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║      數學王子的覺醒 — 核心邏輯控制模組 (C 組交付)                  ║
 * ║      實作規範：V4.0 第十四章 · 狀態管理與單元流程控制               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

(function() {
  'use strict';

  // ── 配置與常數 ──
  const APP = {
    version: '1.2.0',
    dataBasePath: './data/', // 存放 unitX.json 的路徑
    fallbackUnit: 'F'         // 預設加載單元
  };

  // ── 核心狀態管理 (State) ──
  const state = {
    currentUnit: null,
    questions: [],
    currentIndex: 0,
    points: 0,
    history: []
  };

  // ── 執行期工具 (Runtime) ──
  const runtime = {
    isFetching: false,
    isVariantMode: false
  };

  /**
   * 載入單元資料
   * @param {string} unitId 單元代碼 (如 F, P, S...)
   */
  async function openUnit(unitId, options = {}) {
    if (runtime.isFetching) return;
    
    try {
      runtime.isFetching = true;
      toggleLoading(true);

      // 模擬網路延遲或強制失敗測試
      if (options.forceFetchFail) throw new Error('Simulated Network Failure');

    const unitMap = { 'F': 1, 'P': 2, 'S': 3, 'R': 4, 'C': 5, 'A': 6, 'D': 7, 'E': 8 };
    const unitNum = unitMap[unitId] || 1;
    const response = await fetch(`DATA/unit${unitNum}.json`);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      
      const data = await response.json();
      
      // 更新狀態
      state.currentUnit = unitId;
      state.questions = data;
      state.currentIndex = 0;
      runtime.isVariantMode = false;

      renderQuestion();
      updateDashboard();
      showToast(`單元 ${unitId} 載入成功`, 'success');
      
    } catch (error) {
      console.error('[MathPrince] Fetch Error:', error);
      showToast('無法取得題目資料，請檢查網路連線', 'error');
      // 觸發 14.5 逃生機制：載入本地快取或預設題
    } finally {
      runtime.isFetching = false;
      toggleLoading(false);
    }
  }

  /**
   * 處理「再試一次」邏輯
   * 規範：若有 variant 則切換至變體題，若已是變體則僅重置 UI
   */
  function handleRetry() {
    const currentQ = state.questions[state.currentIndex];
    
    if (currentQ && currentQ.variant && !runtime.isVariantMode) {
      // 切換為變體題模式
      runtime.isVariantMode = true;
      renderQuestion(currentQ.variant);
      showToast('已為你準備了概念相似的挑戰題', 'info');
    } else {
      // 若已是 variant 或無 variant，則僅重置 UI 供原題重新輸入
      resetAnswerUI();
      showToast('請再次嘗試作答', 'info');
    }
  }

  /**
   * 狀態持久化
   */
  function persistState() {
    if (window.MathPrince && window.MathPrince.StorageGuard) {
      window.MathPrince.StorageGuard.safeSave('MP_USER_PROGRESS', state);
    } else {
      localStorage.setItem('MP_USER_PROGRESS', JSON.stringify(state));
    }
  }

  // ── UI 輔助函數 (應與 B 組對接) ──
  function toggleLoading(show) {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = show ? 'flex' : 'none';
  }

  function renderQuestion(targetData = null) {
    const q = targetData || state.questions[state.currentIndex];
    const container = document.getElementById('question-display');
    if (!container || !q) return;

    // 依據《技術規範》使用 white-space: pre-wrap 渲染詳解
    container.innerHTML = `
      <div class="q-header">
        <span class="q-tag">#${q.id} ${runtime.isVariantMode ? '(強化練習)' : ''}</span>
      </div>
      <div class="q-body">${q.question}</div>
    `;
    resetAnswerUI();
  }

  function resetAnswerUI() {
    const input = document.getElementById('answer-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    // 隱藏之前的詳解區塊
    const exp = document.getElementById('explanation-area');
    if (exp) exp.classList.remove('show');
  }

  function updateDashboard() {
    const el = document.getElementById('user-points');
    if (el) el.textContent = state.points;
  }

  function showToast(msg, type = 'info') {
    if (window.MathPrince && window.MathPrince.InputGuard) {
      window.MathPrince.InputGuard.showToast(msg, type);
    } else {
      console.log(`[Toast] ${type.toUpperCase()}: ${msg}`);
    }
  }

  function injectStyles() {
    // 注入必要的動態樣式（若 B 組未定義）
    if (!document.getElementById('mp-logic-styles')) {
      const style = document.createElement('style');
      style.id = 'mp-logic-styles';
      style.textContent = `
        .q-tag { background: var(--gold-light, #F5E9C0); padding: 2px 8px; border-radius: 4px; font-size: 0.8em; }
        #loading-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(255,255,255,0.7); display:none; justify-content:center; align-items:center; z-index:9999; }
      `;
      document.head.appendChild(style);
    }
  }

  // ── 初始化啟動 ──
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    // 確保基本的 UI 外殼存在
    if (!document.getElementById('loading-overlay')) {
      const loader = document.createElement('div');
      loader.id = 'loading-overlay';
      loader.innerHTML = '<span>讀取中...</span>';
      document.body.appendChild(loader);
    }

    // 載入進度 (14.6 規範)
    const saved = localStorage.getItem('MP_USER_PROGRESS');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.assign(state, parsed);
        updateDashboard();
      } catch(e) { console.warn('Progress Data Corrupted'); }
    }

    // 綁定各單元入口按鈕 (假設 class 為 .unit-card，並有 data-unit 屬性)
    document.querySelectorAll('.unit-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-unit');
        if (uid) openUnit(uid);
      });
    });

    // 暴露 APP 控制項到全域供 B 組或其他組件調用
    window.MathPrinceApp = {
      openUnit,
      handleRetry,
      state,
      runtime,
      persist: persistState,
      // 提供緊急測試接口
      forceFailFetch: (uid) => openUnit(uid, { forceFetchFail: true })
    };
    
    console.log('[MathPrince] Main Module Loaded. Ready to Awaken.');
  });
})();
