/**
 * 數學王子的覺醒 — 核心邏輯控制模組 (精修穩定版)
 */

(function() {
    'use strict';

    // ── 核心狀態管理 ──
    const state = {
        currentUnit: null,
        questions: [],
        currentIndex: 0,
        score: 0 // 統一使用 score 作為積分變數
    };

    const runtime = {
        isFetching: false,
        isVariantMode: false
    };

    // ── 核心功能：開啟單元 ──
    window.openUnit = async function(unitId) {
        if (runtime.isFetching) return;
        
        try {
            runtime.isFetching = true;
            const response = await fetch(`./DATA/unit${unitId}.json`);
            if (!response.ok) throw new Error('讀取失敗');
            
            const data = await response.json();
            
            // 更新狀態
            state.questions = data;
            state.currentIndex = 0;
            state.currentUnit = unitId;

            // 切換 UI
            document.getElementById('unit-menu').style.display = 'none';
            document.getElementById('quiz-shell').style.display = 'block';
            
            renderQuestion();
            updateDashboard();

        } catch (error) {
            console.error('載入出錯:', error);
            alert('無法載入題目，請檢查網路連接或檔案路徑');
        } finally {
            runtime.isFetching = false;
        }
    };

    // ── 核心功能：渲染題目 ──
    function renderQuestion() {
        const q = state.questions[state.currentIndex];
        const container = document.getElementById('question-display');
        const input = document.getElementById('answer-input');
        const submitBtn = document.getElementById('submit-btn');

        if (!q || !container || !submitBtn) return;

        container.innerHTML = `
            <div class="q-header"><span class="q-tag">#${q.id}</span></div>
            <div class="q-body">${q.question}</div>
        `;

        if (input) {
            input.value = '';
            input.focus();
        }

        // 重新綁定提交動作
        submitBtn.onclick = () => {
            const userAns = input.value.trim();
            if (!userAns) {
                alert('請先輸入答案喔！');
                return;
            }
            handleAnswer(userAns);
        };
    }

    // ── 核心功能：評分邏輯 ──
    function handleAnswer(userAns) {
        try {
            const q = state.questions[state.currentIndex];
            if (!q) return;

            // 呼叫 SmartGrader (需確保 math_prince_core.js 已正確載入)
            const result = SmartGrader.grade(userAns, q);

            if (result.isCorrect) {
                state.score += 10;
                updateDashboard();
                showToast('正確！積分 +10', 'success');
                
                setTimeout(() => {
                    state.currentIndex++;
                    if (state.currentIndex < state.questions.length) {
                        renderQuestion();
                    } else {
                        showToast('恭喜完成本單元！', 'success');
                        setTimeout(() => location.reload(), 2000);
                    }
                }, 1000);
            } else {
                showToast(result.feedback || '再想一下喔！', 'error');
            }
        } catch (error) {
            console.error("評分過程錯誤:", error);
            showToast('系統思考中...', 'error');
        }
    }

    // ── UI 輔助功能 ──
    function updateDashboard() {
        const scoreEl = document.getElementById('points-display');
        if (scoreEl) scoreEl.textContent = state.score;
    }

    function showToast(msg, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style = "position:fixed; top:20px; right:20px; background:#333; color:#fff; padding:10px 20px; border-radius:5px; z-index:9999;";
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

})();
