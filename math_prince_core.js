/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║      數學王子的覺醒 — 核心邏輯與魯棒性模組 (C 組交付)               ║
 * ║      依據《技術規範手冊 V4.0》第十四章全規範實作                    ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Module 1 · SmartGrader   — §14.9 智慧判定引擎                      ║
 * ║  Module 2 · StorageGuard  — §14.6 本機儲存容錯模組                  ║
 * ║  Module 3 · InputGuard    — §14.4 使用者輸入防呆攔截                ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  HTML ID 相依清單（B 組原型）：                                      ║
 * ║  #answer-input · #submit-btn · #backupModal · #codeDisplay          ║
 * ║  #copyBtn · #modalErrorBanner · #privateWarning                     ║
 * ║  .toast-container                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MODULE 1 ·  S m a r t G r a d e r
   V4 §14.9  智慧判定引擎 ── 正規化預處理 + 多題型等值判定
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

class SmartGrader {

  /* ─────────────────────────────────────────────────────────────────────
     §14.9.1  normalizeInput(str)
     Pipeline（順序不可顛倒）：
       1. 全形數字 / 符號 → 半形  (Ａ-Ｚ, ０-９, ！-～)
       2. 移除所有空白（含 \u00A0 Non-Breaking Space、\u3000 全形空格）
       3. 英文未知數統一轉小寫
       4. 移除裝飾前綴詞（「答案是」「約」等）
       5. 移除貨幣符號
  ───────────────────────────────────────────────────────────────────── */
  static normalizeInput(str) {
    if (typeof str !== 'string') str = String(str);

    // Step 1 · 全形 ASCII 可見字元（U+FF01~FF5E）整塊轉半形
    //   涵蓋：０-９ → 0-9、／(U+FF0F) → / 、－ → - 等
    str = str.replace(/[\uFF01-\uFF5E]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    );

    // Step 1b · 斜線變體補強 (Hotfix 1.1 §14.9.1)
    //   ／  U+FF0F  FULLWIDTH SOLIDUS  — Step 1 已涵蓋，此行為明確文件化
    //   ∕  U+2215  DIVISION SLASH     — Step 1 範圍外，平板除法鍵常見
    //   ⁄  U+2044  FRACTION SLASH     — Step 1 範圍外，iOS 分數輸入法常見
    //   三碼統一正規化為半形 / (U+002F)
    str = str.replace(/[\uFF0F\u2215\u2044]/g, '/');

    // Step 2 · 移除所有空白類字元（半形/全形/Non-Breaking/零寬）
    str = str.replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, '');

    // Step 3 · 英文未知數轉小寫（§14.9.1 要求）
    str = str.toLowerCase();

    // Step 4 · 移除裝飾前綴
    str = str.replace(/^(答案是|答案為|大約|約|等於|是|得|結果是|結果為|ans=|answer:)/u, '');

    // Step 5 · 移除貨幣符號（§14.9.1）
    str = str.replace(/[$＄€￥£]/g, '');

    return str;
  }

  /* ─────────────────────────────────────────────────────────────────────
     §14.9.2  gradeAnswer(userIn, correctAns, type)

     type 枚舉：
       'number'   — 純數值 / 小數
       'fraction' — 分數，支援等值（1/2 === 2/4）
       'variable' — 代數，x=5 語意等同 5
       'ratio'    — 比例，1:1 等同 2:2
       'set'      — 集合，順序無關
       'mixed'    — 混合數（1又1/2 === 1.5）
       'auto'     — 自動偵測（預設）

     回傳 { verdict, message, normalizedUser, normalizedCorrect }
       verdict: 'correct' | 'wrong' | 'invalid'
  ───────────────────────────────────────────────────────────────────── */
  static gradeAnswer(userIn, correctAns, type = 'auto') {
    // 空值最後防線（InputGuard 是第一道）
    if (!userIn || !String(userIn).trim()) {
      return { verdict: 'invalid', message: '請輸入答案後再送出' };
    }

    const userNorm    = SmartGrader.normalizeInput(String(userIn));
    const correctNorm = SmartGrader.normalizeInput(String(correctAns));

    // §14.4.2 非數學輸入偵測
    if (!SmartGrader._isMathInput(userNorm, type)) {
      return {
        verdict: 'invalid',
        message: '這不像是數學答案，請再確認一下！',
        normalizedUser:    userNorm,
        normalizedCorrect: correctNorm
      };
    }

    // 依題型路由
    const resolvedType = (type === 'auto')
      ? SmartGrader._detectType(userNorm, correctNorm)
      : type;

    let isCorrect = false;

    switch (resolvedType) {
      case 'fraction': isCorrect = SmartGrader._gradeFraction(userNorm, correctNorm); break;
      case 'variable': isCorrect = SmartGrader._gradeVariable(userNorm, correctNorm); break;
      case 'ratio':    isCorrect = SmartGrader._gradeRatio(userNorm, correctNorm);    break;
      case 'set':      isCorrect = SmartGrader._gradeSet(userNorm, correctNorm);      break;
      case 'mixed':
      case 'number':
      default:         isCorrect = SmartGrader._gradeNumericFull(userNorm, correctNorm); break;
    }

    return {
      verdict:           isCorrect ? 'correct' : 'wrong',
      message:           isCorrect ? '答對了！太厲害了！✨' : '再想想看，你可以的！',
      normalizedUser:    userNorm,
      normalizedCorrect: correctNorm
    };
  }

  /* ══ 私有：自動偵測題型 ════════════════════════════════════════════ */
  static _detectType(u, c) {
    if (/[a-z]=/.test(u) || /[a-z]=/.test(c))               return 'variable';
    if (/\d:\d/.test(u)  || /\d:\d/.test(c))                return 'ratio';
    if (/[、，,]/.test(u) || /[、，,]/.test(c))              return 'set';
    if (/又\d+\/\d+/.test(u) || /又\d+\/\d+/.test(c))       return 'mixed';
    if (/\d\/\d/.test(u) || /\d\/\d/.test(c))               return 'fraction';
    return 'number';
  }

  /* ══ 私有：有效性偵測 §14.4.2 ═══════════════════════════════════════ */
  static _isMathInput(s, type) {
    if (!s) return false;
    if (/\d/.test(s))        return true;   // 含數字
    if (/^[a-z]=/.test(s))   return true;   // 代數形式
    // 集合 / 純中文詞彙答案（如「偶數」「正三角形」）
    if (type === 'set' || type === 'auto') {
      if (/[\u4E00-\u9FFF]/.test(s) && /[、，,]/.test(s)) return true;
      if (/^[\u4E00-\u9FFF]{1,12}$/.test(s))              return true;
    }
    return false;
  }

  /* ══ 私有：數學工具函式 ════════════════════════════════════════════ */

  static _gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b) { [a, b] = [b, a % b]; }
    return a;
  }

  /**
   * 字串 → 有理數 { num, den }
   * 支援：整數、小數、純分數、混合數（1又1/2）
   */
  static _toRational(s) {
    // 混合數：必須先於分數規則，否則「1又1/2」會被截斷
    let m = s.match(/^(-?\d+)又(\d+)\/(\d+)$/u)
          || s.match(/^(-?\d+)_(\d+)\/(\d+)$/);
    if (m) {
      const whole    = parseInt(m[1], 10);
      const fracNum  = parseInt(m[2], 10);
      const fracDen  = parseInt(m[3], 10);
      if (fracDen === 0) return null;
      const totalNum = Math.abs(whole) * fracDen + fracNum;
      return { num: whole < 0 ? -totalNum : totalNum, den: fracDen };
    }

    // 純分數
    m = s.match(/^(-?\d+)\/(-?\d+)$/);
    if (m) {
      const num = parseInt(m[1], 10);
      const den = parseInt(m[2], 10);
      if (den === 0) return null;
      return { num, den };
    }

    // 整數 / 小數
    const f = parseFloat(s);
    if (!isNaN(f)) {
      const decLen = (s.split('.')[1] || '').replace(/\D/g, '').length;
      const scale  = Math.pow(10, decLen);
      return { num: Math.round(f * scale), den: scale };
    }

    return null;
  }

  static _rationalEq(a, b) {
    if (!a || !b) return false;
    return a.num * b.den === b.num * a.den;
  }

  /**
   * 從含單位文字的字串中擷取純數學核心
   * 順序：混合數 → 比例 → 分數 → 小數/整數
   */
  static _extractCore(s) {
    let m;
    m = s.match(/(-?\d+)又(\d+)\/(\d+)/u); if (m) return m[0]; // 混合數優先
    m = s.match(/\d+:\d+(?::\d+)*/);        if (m) return m[0]; // 比例
    m = s.match(/-?\d+\/-?\d+/);            if (m) return m[0]; // 分數
    m = s.match(/-?\d+(?:\.\d+)?/);         if (m) return m[0]; // 數值
    return s;
  }

  /* ══ 私有：各題型判定 ══════════════════════════════════════════════ */

  /**
   * type === 'fraction'  §14.9.2
   * 等值分數：1/2 === 2/4（除非題目另行指定最簡分數模式）
   */
  static _gradeFraction(u, c) {
    return SmartGrader._rationalEq(
      SmartGrader._toRational(SmartGrader._extractCore(u)),
      SmartGrader._toRational(SmartGrader._extractCore(c))
    );
  }

  /**
   * type === 'variable'  §14.9.2
   * x=5、X=5、5 均與正確答案「5」等同
   */
  static _gradeVariable(u, c) {
    const stripVar = s => { const m = s.match(/^[a-z]+=(.+)$/); return m ? m[1] : s; };
    return SmartGrader._rationalEq(
      SmartGrader._toRational(stripVar(u)),
      SmartGrader._toRational(stripVar(c))
    );
  }

  /**
   * type === 'ratio'  §14.9.2
   * 1:1 === 2:2 === 15:15；多元比例亦適用
   */
  static _gradeRatio(u, c) {
    const parseRatio = s => {
      const parts = s.split(':').map(p => parseFloat(p));
      if (parts.some(isNaN) || parts.length < 2) return null;
      // 縮到最簡比
      const g = parts.reduce((acc, v) => SmartGrader._gcd(acc, Math.round(v * 1e6)), 0);
      return g === 0 ? null : parts.map(v => Math.round(v * 1e6 / g));
    };
    const uArr = parseRatio(u);
    const cArr = parseRatio(c);
    if (!uArr || !cArr || uArr.length !== cArr.length) return false;
    return uArr.every((v, i) => v === cArr[i]);
  }

  /**
   * type === 'set'  §14.9.2
   * 「星期三、星期五」=== 「星期五、星期三」
   */
  static _gradeSet(u, c) {
    const split = s => s.split(/[,，、/]/).map(x => x.trim()).filter(Boolean).sort();
    const uSet  = split(u);
    const cSet  = split(c);
    return uSet.length === cSet.length && uSet.every((v, i) => v === cSet[i]);
  }

  /** 數值完整比對（混合數、分數、小數、整數） */
  static _gradeNumericFull(u, c) {
    return SmartGrader._rationalEq(
      SmartGrader._toRational(SmartGrader._extractCore(u)),
      SmartGrader._toRational(SmartGrader._extractCore(c))
    );
  }

  /* ══ §14.9.3 自我測試 ═════════════════════════════════════════════ */
  static runSelfTest() {
    const CASES = [
      [' 0.5 ',          '0.5',           'auto',     'correct',  '§14.9.3 前後空格'],
      ['０．５',         '0.5',           'auto',     'correct',  '§14.9.3 全形轉半形'],
      ['答案是0.5',      '0.5',           'auto',     'correct',  '§14.9.3 前綴忽略'],
      ['約0.5',          '0.5',           'auto',     'correct',  '§14.9.3 裝飾詞'],
      ['1/2',            '0.5',           'fraction', 'correct',  '§14.9.3 分數等價'],
      ['2/4',            '1/2',           'fraction', 'correct',  '等值分數 2/4===1/2'],
      ['1又1/2',         '1.5',           'mixed',    'correct',  '混合數'],
      ['x=5',            '5',             'variable', 'correct',  '代數 x=5'],
      ['X=5',            '5',             'variable', 'correct',  '代數大小寫容錯'],
      ['1:1',            '2:2',           'ratio',    'correct',  '比例等價 1:1===2:2'],
      ['2:4',            '1:2',           'ratio',    'correct',  '比例化簡'],
      ['星期三、星期五', '星期五、星期三', 'set',      'correct',  '集合順序容錯'],
      ['asdf',           '0.5',           'number',   'invalid',  '§14.9.3 非數學字串'],
      ['',               '0.5',           'auto',     'invalid',  '§14.9.3 空字串'],
      ['!!!',            '0.5',           'number',   'invalid',  '純符號串'],
      ['0.6',            '0.5',           'number',   'wrong',    '錯誤數字'],
    ];

    let pass = 0, fail = 0;
    CASES.forEach(([input, ans, type, expected, desc]) => {
      const result = SmartGrader.gradeAnswer(input, ans, type);
      if (result.verdict === expected) {
        pass++;
        console.log(`  ✅ ${desc}`);
      } else {
        fail++;
        console.warn(`  ❌ ${desc} → 得到 "${result.verdict}"，預期 "${expected}"`);
      }
    });
    console.info(`\n[SmartGrader] 自我測試：${pass} / ${CASES.length} 通過${fail ? `，⚠ ${fail} 失敗` : ' ✓'}`);
    return { pass, fail, total: CASES.length };
  }
}


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MODULE 2 ·  S t o r a g e G u a r d
   V4 §14.6  本機儲存容錯 ── safeSave / 備援 Modal / Base64 備份碼
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

class StorageGuard {

  static STORAGE_KEY = 'math_prince_state';

  // 私有欄位（ES2022 static private）
  static #memoryStore   = null;   // §14.6.2 In-memory 備援
  static #forceFailMode = false;  // 負向測試接口（Task 1 要求）

  /* ─────────────────────────────────────────────────────────────────────
     負向測試接口（Task 1 交付規格）
     StorageGuard.setForceFailMode(true)
       → 讓 localStorage.setItem 模擬拋出 QuotaExceededError
  ───────────────────────────────────────────────────────────────────── */
  static setForceFailMode(enabled) {
    StorageGuard.#forceFailMode = Boolean(enabled);
    console.info(`[StorageGuard] forceFailMode = ${StorageGuard.#forceFailMode}`);
  }

  /* ─────────────────────────────────────────────────────────────────────
     §14.6.1  safeSave(data)
     所有 localStorage 寫入包裹 try/catch；
     捕捉到 QuotaExceededError 或 SecurityError（無痕）時：
       1. 切換 in-memory 備援         §14.6.2
       2. 顯示 #privateWarning 橫幅   §14.6.2
       3. 自動開啟備份碼 Modal        §14.6.3
  ───────────────────────────────────────────────────────────────────── */
  static safeSave(data) {
    // 無論成功與否，先同步更新記憶體副本
    StorageGuard.#memoryStore = data;

    try {
      // 負向測試：強制模擬失敗
      if (StorageGuard.#forceFailMode) {
        const simulatedErr = new DOMException(
          'StorageGuard forceFailMode active — simulated QuotaExceededError',
          'QuotaExceededError'
        );
        throw simulatedErr;
      }

      localStorage.setItem(StorageGuard.STORAGE_KEY, JSON.stringify(data));
      return { ok: true, mode: 'localStorage' };

    } catch (err) {
      const isQuota    = err.name === 'QuotaExceededError' || err.code === 22;
      const isSecurity = err.name === 'SecurityError';

      if (isQuota || isSecurity || StorageGuard.#forceFailMode) {
        console.warn(`[StorageGuard] 寫入失敗 (${err.name})，啟動 in-memory 備援`);

        StorageGuard.#showPrivateWarning();   // §14.6.2
        StorageGuard.showBackupModal(data);   // §14.6.3

        return { ok: false, mode: 'memory', error: err.name };
      }

      console.error('[StorageGuard] 非預期錯誤：', err);
      return { ok: false, mode: 'memory', error: err.name };
    }
  }

  /* safeLoad()  §14.6.1 */
  static safeLoad() {
    if (StorageGuard.#memoryStore) return StorageGuard.#memoryStore;
    try {
      const raw = localStorage.getItem(StorageGuard.STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      StorageGuard.#memoryStore = parsed;
      return parsed;
    } catch (err) {
      console.warn('[StorageGuard] 讀取失敗：', err.name);
      return null;
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     §14.6.3  generateBackupCode(data)
     進度 JSON → Base64 備份碼（可跨裝置恢復）
  ───────────────────────────────────────────────────────────────────── */
  static generateBackupCode(data) {
    const payload = {
      version:   '1.0',
      app:       'math-prince',
      timestamp: new Date().toISOString(),
      progress:  data.progress ?? 0,
      reason:    data.reason   ?? 0,
      precise:   data.precise  ?? 0,
      persist:   data.persist  ?? 0,
      units:     data.units    ?? {}
    };
    // btoa 不支援 Unicode，使用 encodeURIComponent 轉義後再編碼
    const json   = JSON.stringify(payload);
    const base64 = btoa(
      encodeURIComponent(json).replace(/%([0-9A-F]{2})/g,
        (_, byte) => String.fromCharCode(parseInt(byte, 16))
      )
    );
    return base64;
  }

  /** Base64 備份碼 → 進度物件（恢復用） */
  static decodeBackupCode(base64) {
    try {
      const json = decodeURIComponent(
        Array.from(atob(base64))
          .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
      );
      return JSON.parse(json);
    } catch (err) {
      console.error('[StorageGuard] 備份碼解碼失敗：', err);
      return null;
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     showBackupModal(data)  §14.6.3
     開啟 B 組 #backupModal 並注入 Base64 備份碼
  ───────────────────────────────────────────────────────────────────── */
  static showBackupModal(data) {
    const code      = StorageGuard.generateBackupCode(data ?? StorageGuard.#memoryStore ?? {});
    const modal     = document.getElementById('backupModal');
    const codeEl    = document.getElementById('codeDisplay');
    const copyBtn   = document.getElementById('copyBtn');
    const errBanner = document.getElementById('modalErrorBanner');

    if (!modal) {
      console.error('[StorageGuard] 找不到 #backupModal，請確認 B 組 HTML 已載入');
      return;
    }

    if (codeEl)    { codeEl.textContent = code; codeEl.style.border = ''; }
    if (errBanner) errBanner.classList.remove('show');
    if (copyBtn)   {
      copyBtn.className   = 'copy-btn';
      copyBtn.textContent = '一鍵複製進度碼';
      copyBtn.disabled    = false;
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    // 無障礙：焦點移至複製按鈕
    if (copyBtn) setTimeout(() => copyBtn.focus(), 120);
  }

  /* ─────────────────────────────────────────────────────────────────────
     copyBackupCode()  §14.6.3 一鍵複製
     主路徑  → navigator.clipboard.writeText
     備援一  → document.execCommand('copy')   (舊版 / 非安全 context)
     備援二  → 自動全選 + 提示手動複製
  ───────────────────────────────────────────────────────────────────── */
  static async copyBackupCode() {
    const btn       = document.getElementById('copyBtn');
    const codeEl    = document.getElementById('codeDisplay');
    const errBanner = document.getElementById('modalErrorBanner');
    if (!btn || !codeEl) return;

    const text      = codeEl.textContent;
    btn.disabled    = true;
    btn.textContent = '複製中⋯';

    const onSuccess = () => {
      btn.className   = 'copy-btn success';
      btn.textContent = '已複製！✓';
      if (errBanner) errBanner.classList.remove('show');
      setTimeout(() => {
        btn.className   = 'copy-btn';
        btn.textContent = '一鍵複製進度碼';
        btn.disabled    = false;
      }, 2000);
    };

    const onFail = (reason) => {
      console.warn('[StorageGuard] 複製失敗，啟動手動選取備援：', reason);
      btn.className   = 'copy-btn error-state';
      btn.textContent = '複製失敗，請手動框選後複製';
      btn.disabled    = false;
      if (errBanner) errBanner.classList.add('show');
      if (codeEl) {
        codeEl.style.border = '2px solid var(--error, #8B1A1A)';
        codeEl.focus();
        try {
          const sel = window.getSelection();
          const rng = document.createRange();
          rng.selectNodeContents(codeEl);
          sel.removeAllRanges();
          sel.addRange(rng);
        } catch (_) {}
      }
    };

    try {
      // 主路徑：Clipboard API
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        onSuccess();
      } else {
        throw new Error('Clipboard API 不可用');
      }
    } catch (_primaryErr) {
      // 備援一：execCommand
      try {
        StorageGuard.#execCommandCopy(text);
        onSuccess();
      } catch (fallbackErr) {
        onFail(fallbackErr);
      }
    }
  }

  /** execCommand 備援實作 */
  static #execCommandCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('execCommand("copy") 回傳 false');
  }

  /** §14.6.2 顯示 #privateWarning 橫幅 */
  static #showPrivateWarning() {
    const el = document.getElementById('privateWarning');
    if (el) el.classList.add('show');
  }

  /* §14.4.5 頁面關閉前自動暫存 */
  static setupBeforeUnloadGuard(getStateFn) {
    window.addEventListener('beforeunload', () => {
      try {
        const data = getStateFn();
        if (data) localStorage.setItem(StorageGuard.STORAGE_KEY, JSON.stringify(data));
      } catch (_) {}
    });
  }
}


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MODULE 3 ·  I n p u t G u a r d
   V4 §14.4  使用者輸入防呆攔截 ── 空值 / 非法字元 / Debounce / Toast
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

class InputGuard {

  static DEBOUNCE_MS = 800;   // §14.4.3
  static MAX_LENGTH  = 50;    // §14.4.4

  static #toastTimer  = null;
  static #cssInjected = false;

  /* ─────────────────────────────────────────────────────────────────────
     init({ inputEl?, submitEl?, onValidSubmit })

     若未傳入元素，自動對應 B 組 HTML：
       inputEl  → #answer-input
       submitEl → #submit-btn
  ───────────────────────────────────────────────────────────────────── */
  static init({
    inputEl       = document.getElementById('answer-input'),
    submitEl      = document.getElementById('submit-btn'),
    onValidSubmit = null
  } = {}) {

    InputGuard.#injectStyles();

    if (!inputEl || !submitEl) {
      console.error('[InputGuard] 找不到 #answer-input 或 #submit-btn，請確認 HTML 已載入');
      return;
    }

    // §14.4.4 maxlength 硬限
    inputEl.setAttribute('maxlength', InputGuard.MAX_LENGTH);

    // §14.4.4 即時 sanitize（防止貼入危險字元）
    inputEl.addEventListener('input', () => {
      const cleaned = InputGuard.sanitize(inputEl.value);
      if (cleaned !== inputEl.value) inputEl.value = cleaned;
    });

    // §14.10.1 虛擬鍵盤避讓
    inputEl.addEventListener('focus', () => {
      setTimeout(() => {
        (submitEl || inputEl).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 350);
    });

    // §14.4.3 Debounce 包裝提交核心
    const debouncedSubmit = InputGuard.#debounce(
      () => InputGuard.#handleSubmit(inputEl, submitEl, onValidSubmit),
      InputGuard.DEBOUNCE_MS
    );

    // ── 主要攔截點：監聽 #submit-btn（Task 1 規格）
    submitEl.addEventListener('click', debouncedSubmit);

    // Enter 鍵等同點擊提交
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); debouncedSubmit(); }
    });
  }

  /* ─────────────────────────────────────────────────────────────────────
     validate(value)  §14.4.1 §14.4.2
     回傳 'empty' | 'invalid' | 'valid'
  ───────────────────────────────────────────────────────────────────── */
  static validate(value) {
    const trimmed = String(value).trim();

    // §14.4.1 空值 / 僅空白
    if (!trimmed) return 'empty';

    // §14.4.4 超長輸入（maxlength 第二道防線）
    if (trimmed.length > InputGuard.MAX_LENGTH) return 'invalid';

    // §14.4.2 非數學字串偵測
    const normalized = SmartGrader.normalizeInput(trimmed);
    if (!SmartGrader._isMathInput(normalized, 'auto')) return 'invalid';

    return 'valid';
  }

  /* ─────────────────────────────────────────────────────────────────────
     sanitize(value)  §14.4.4
     截斷超長；過濾 XSS / Script 注入危險字元
  ───────────────────────────────────────────────────────────────────── */
  static sanitize(value) {
    return value
      .slice(0, InputGuard.MAX_LENGTH)
      .replace(/[<>"'`;{}[\]\\()\u202E\u200B\u0000-\u001F]/g, '');
  }

  /* ─────────────────────────────────────────────────────────────────────
     showToast(message, type, durationMs)
     §14.4.1 調用 B 組 .toast-container；2.5 秒後銷毀 DOM
     type: 'default' | 'error' | 'success'
  ───────────────────────────────────────────────────────────────────── */
  static showToast(message, type = 'default', durationMs = 2500) {
    const container = document.querySelector('.toast-container')
                   ?? InputGuard.#ensureToastContainer();

    // Hotfix 1.1 §14.4.2：強制以 inline style 確保層級高於任何 Modal
    // B 組 .modal-overlay z-index = 9000；Toast 必須在其上方
    // inline style 優先級高於任何外部 CSS class，確保兼容性
    container.style.zIndex   = '9999';
    container.style.position = 'fixed';

    // 移除既有 Toast（同時只顯示一個）
    container.querySelectorAll('.mp-toast').forEach(el => el.remove());
    clearTimeout(InputGuard.#toastTimer);

    const toast = document.createElement('div');
    toast.className = `mp-toast mp-toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.textContent = message;
    container.appendChild(toast);

    // 觸發入場 transition（需要兩幀才能讓瀏覽器偵測到 class 變化）
    requestAnimationFrame(() =>
      requestAnimationFrame(() => toast.classList.add('mp-toast--show'))
    );

    // §14.4.1 2.5 秒後自動銷毀 DOM
    InputGuard.#toastTimer = setTimeout(() => {
      toast.classList.remove('mp-toast--show');
      setTimeout(() => toast.remove(), 300); // 等淡出動畫完成
    }, durationMs);
  }

  /* ══ 私有：提交核心邏輯 ════════════════════════════════════════════ */
  static #handleSubmit(inputEl, submitEl, onValidSubmit) {
    const raw    = inputEl.value;
    const status = InputGuard.validate(raw);

    if (status === 'empty') {
      // §14.4.1 顯示「請輸入答案喔！」
      InputGuard.showToast('請輸入答案喔！', 'default', 2500);
      inputEl.focus();
      return; // 禁止送出邏輯，不計入作答次數
    }

    if (status === 'invalid') {
      // §14.4.2 非法字元友善提示（不判為「錯誤」，保護學習信心）
      InputGuard.showToast('這不像是數學答案，請再確認一下！', 'error', 2500);
      inputEl.focus();
      return;
    }

    // ── 通過驗證：§14.8.1 指令鎖定
    InputGuard.#lockUI(inputEl, submitEl);

    const cleanValue = InputGuard.sanitize(raw);

    try {
      const result = (typeof onValidSubmit === 'function')
        ? onValidSubmit(cleanValue)
        : Promise.resolve();

      // 無論同步 / 非同步，確保解鎖
      Promise.resolve(result).finally(() => {
        InputGuard.#unlockUI(inputEl, submitEl);
      });
    } catch (err) {
      console.error('[InputGuard] onValidSubmit 發生例外：', err);
      InputGuard.#unlockUI(inputEl, submitEl);
    }
  }

  /* ══ 私有：UI 鎖定 / 解鎖  §14.8.1 ════════════════════════════════ */
  static #lockUI(inputEl, submitEl) {
    inputEl.disabled  = true;
    submitEl.disabled = true;
    submitEl.classList.add('is-loading');
  }

  static #unlockUI(inputEl, submitEl) {
    inputEl.disabled  = false;
    submitEl.disabled = false;
    submitEl.classList.remove('is-loading');
    inputEl.focus();
  }

  /* ══ 私有：Debounce  §14.4.3 ════════════════════════════════════════ */
  static #debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /* ══ 私有：確保 .toast-container 存在 ════════════════════════════ */
  static #ensureToastContainer() {
    const div = document.createElement('div');
    div.className = 'toast-container';
    // Hotfix 1.1：建立時即寫入 inline style，
    // 確保即使 B 組已定義同名 class，層級仍保持 9999
    div.style.cssText = [
      'position:fixed',
      'bottom:88px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:9999',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:8px',
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(div);
    return div;
  }

  /* ══ 私有：注入 Toast CSS（執行一次）═══════════════════════════════ */
  static #injectStyles() {
    if (InputGuard.#cssInjected) return;
    InputGuard.#cssInjected = true;

    const el = document.createElement('style');
    el.id = 'mp-core-styles';
    el.textContent = /* css */`
      /* ── Toast 容器：固定於畫面底部中央 ─────────────── */
      .toast-container {
        position: fixed;
        bottom: 88px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;   /* Hotfix 1.1：高於 B 組 .modal-overlay (9000) */
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }

      /* ── Toast 本體（繼承 B 組 CSS 變數）───────────── */
      .mp-toast {
        background: var(--purple, #4A3A6A);
        color: var(--chalk, #F0EDE6);
        font-family: 'Crimson Pro', 'Noto Serif TC', Georgia, serif;
        font-size: 15px;
        line-height: 1.5;
        padding: 12px 24px;
        border-radius: var(--radius-sm, 8px);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.28);
        min-height: 44px;       /* §B 組觸控規範 44px */
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.25s ease, transform 0.25s ease;
        pointer-events: none;
        max-width: min(320px, 88vw);
        text-align: center;
      }
      .mp-toast--show    { opacity: 1; transform: translateY(0); }
      .mp-toast--error   { background: var(--error,   #8B1A1A); }
      .mp-toast--success { background: var(--success, #1A6640); }

      /* ── §14.8.1 提交鎖定態 ─────────────────────── */
      #submit-btn.is-loading {
        opacity: 0.6;
        cursor: not-allowed;
        pointer-events: none;
      }
    `;
    document.head.appendChild(el);
  }
}


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   §14.7.3  全域錯誤邊界（禁止白屏）
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.onerror = function (_msg, _src, _line, _col, _err) {
  if (document.getElementById('_mp_err_overlay')) return false;

  const overlay = document.createElement('div');
  overlay.id = '_mp_err_overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:99999;',
    'background:rgba(26,10,40,.96);',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;',
    'padding:24px;font-family:"Crimson Pro","Noto Serif TC",serif;',
    'color:#F0EDE6;text-align:center;'
  ].join('');
  overlay.innerHTML = `
    <div style="font-size:2.5rem;margin-bottom:12px">⚡</div>
    <h2 style="font-size:1.4rem;color:#C8960A;margin:0 0 8px">覺醒能量不穩定</h2>
    <p style="font-size:1rem;opacity:.85;margin:0 0 24px">
      抱歉，系統遇到一點問題。請選擇下方操作繼續冒險：
    </p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
      <button onclick="location.reload()"
        style="padding:12px 24px;border-radius:8px;border:none;min-height:44px;
               background:#C8960A;color:#1A0A28;font-size:1rem;cursor:pointer;
               font-family:inherit;font-weight:600">重新整理</button>
      <button onclick="localStorage.clear();location.reload()"
        style="padding:12px 24px;border-radius:8px;min-height:44px;
               border:2px solid #C8960A;background:transparent;
               color:#F0EDE6;font-size:1rem;cursor:pointer;font-family:inherit">
        重置系統（清除暫存）</button>
    </div>
  `;
  document.body.appendChild(overlay);
  return false;
};


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   全域掛載 & B 組函式覆寫
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

window.MathPrince = Object.freeze({ SmartGrader, StorageGuard, InputGuard });

// 覆寫 B 組 HTML 中 onclick="copyCode()" 呼叫的同名全域函式
window.copyCode = () => StorageGuard.copyBackupCode();

// DOMContentLoaded：開發環境自動跑 §14.9.3 自我測試
document.addEventListener('DOMContentLoaded', () => {
  if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'production') {
    console.group('[C 組] SmartGrader §14.9.3 自我測試');
    SmartGrader.runSelfTest();
    console.groupEnd();
  }
});


/*
 * ══════════════════════════════════════════════════════════════════
 *  整合範例（貼入題目頁面 <script> 區塊）
 * ══════════════════════════════════════════════════════════════════
 *
 * document.addEventListener('DOMContentLoaded', () => {
 *   const { SmartGrader, StorageGuard, InputGuard } = window.MathPrince;
 *
 *   // ── 1. 初始化 InputGuard（自動綁定 #answer-input / #submit-btn）
 *   InputGuard.init({
 *     onValidSubmit: (cleanValue) => {
 *       const result = SmartGrader.gradeAnswer(
 *         cleanValue,
 *         currentQuestion.answer,   // 正確答案
 *         currentQuestion.type      // 'fraction' | 'variable' | 'ratio' | …
 *       );
 *
 *       if (result.verdict === 'correct') {
 *         state.progress++;
 *         StorageGuard.safeSave(state);              // 自動容錯
 *         InputGuard.showToast(result.message, 'success');
 *       } else if (result.verdict === 'wrong') {
 *         InputGuard.showToast(result.message, 'error');
 *       }
 *       // verdict === 'invalid' 由 InputGuard 內部已處理
 *     }
 *   });
 *
 *   // ── 2. 頁面關閉前自動暫存
 *   StorageGuard.setupBeforeUnloadGuard(() => state);
 *
 *   // ── 3. 負向測試（開發用；上線前移除）
 *   // StorageGuard.setForceFailMode(true);
 *   // StorageGuard.safeSave({ progress: 5 });
 *   // → 自動觸發 #privateWarning + #backupModal
 * });
 *
 * ══════════════════════════════════════════════════════════════════ */
