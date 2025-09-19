/**
 * Frontend override v2
 * 目的：
 *  - ダミー問題の生成を停止し、GASの getQuestions を必ず呼ぶ
 *  - 画像のプレースホルダで外部ドメイン(via.placeholder.com)を使わない（data URIで内蔵）
 * 使い方： index.html の </body> 直前に <script src="quiz-override.js"></script> として読み込む
 */
(function() {
    'use strict';

    // ログ出力用ヘルパー関数
    function log() {
        try {
            console.log.apply(console, ['[quiz-hook]'].concat([].slice.call(arguments)));
        } catch(e) {
            // ログ出力エラーは無視
        }
    }

    // 元の startQuiz 関数を保存
    const _origStart = window.startQuiz;

    /**
     * data URIプレースホルダ生成（外部リソースを使わない）
     * @param {string} text - 表示するテキスト
     * @returns {string} data URI形式の画像
     */
    function inlinePlaceholder(text) {
        text = text || 'Lens';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
            <defs>
                <radialGradient id="g">
                    <stop offset="0%" stop-color="#ffd1dc"/>
                    <stop offset="100%" stop-color="#ff88aa"/>
                </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#g)"/>
            <circle cx="100" cy="100" r="70" fill="rgba(255,255,255,0.6)"/>
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
                  font-size="20" font-family="Noto Sans JP, sans-serif" fill="#333">${text}</text>
        </svg>`;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    // グローバルに公開（既存コードから参照可能）
    window.__lensPlaceholder = inlinePlaceholder;

    /**
     * img要素に画像URLを安全に設定（エラー時はプレースホルダ表示）
     * @param {HTMLImageElement} el - 対象のimg要素
     * @param {string} url - 設定する画像URL
     * @param {string} label - プレースホルダのラベルテキスト
     */
    function setImgSafe(el, url, label) {
        if (!el) return;

        el.onerror = function() {
            this.onerror = null;
            this.src = inlinePlaceholder(label || 'Lens');
        };

        el.src = url || inlinePlaceholder(label || 'Lens');
    }

    // グローバルに公開
    window.__setImgSafe = setImgSafe;

    /**
     * GASサーバーから問題データを取得してクイズを開始
     * @param {number} count - 取得する問題数
     */
    function startQuizFromSheets(count) {
        const questionCount = count || 10;

        // Google Apps Script APIの存在確認
        if (!window.google || !google.script || !google.script.run) {
            alert('スプレッドシートに接続できません（google.script.run 未定義）。GAS ウェブアプリとしてデプロイされているか確認してください。');
            // フォールバック処理
            if (typeof _origStart === 'function') {
                return _origStart();
            }
            return;
        }

        log('fetching questions from GAS...', questionCount);

        // GASから問題データを取得
        google.script.run
            .withSuccessHandler(function(list) {
                try {
                    // 空のレスポンスチェック
                    if (!list || !list.length) {
                        log('empty questions -> fallback');
                        if (typeof _origStart === 'function') {
                            return _origStart();
                        }
                        return;
                    }

                    // 既存UIの形式に合わせてデータ変換
                    const questions = list.map(function(q) {
                        return {
                            id: q.questionId,
                            prompt: q.prompt || 'このカラコンは何？',
                            imageLeft: q.imgL,
                            imageRight: q.imgR || q.imgL,
                            options: q.options,
                            correctAnswer: q.correctAnswer,
                            hints: [q.hint1, q.hint2].filter(Boolean)
                        };
                    });

                    // グローバルステートに設定
                    window.App = window.App || {};
                    App.state = App.state || {};
                    App.state.questions = questions;
                    App.state.totalQuestions = questions.length;
                    App.state.currentIndex = 0;

                    // クイズ開始処理
                    if (typeof _origStart === 'function') {
                        _origStart();
                    } else if (typeof window.loadQuestion === 'function') {
                        window.loadQuestion(0);
                    }

                    log('quiz started with sheet data:', questions.length);

                } catch(e) {
                    console.error('Error processing quiz data:', e);
                    if (typeof _origStart === 'function') {
                        return _origStart();
                    }
                }
            })
            .withFailureHandler(function(err) {
                console.error('Failed to fetch questions:', err);
                alert('問題取得に失敗: ' + (err && err.message ? err.message : err));
                if (typeof _origStart === 'function') {
                    return _origStart();
                }
            })
            .getQuestions({ count: questionCount });
    }

    // グローバルに公開
    window.startQuizFromSheets = startQuizFromSheets;

    // 既存の startQuiz を置き換え
    window.startQuiz = function() {
        return startQuizFromSheets(10);
    };

    // loadQuestion のパッチ（プレースホルダURLの置換）
    const _origLoadQuestion = window.loadQuestion;

    window.loadQuestion = function(index) {
        // 元の関数を実行
        if (typeof _origLoadQuestion === 'function') {
            _origLoadQuestion(index);
        }

        try {
            // レンズ画像要素の取得
            const leftLens = document.querySelector(
                '[data-role="lens-left"], #lensLeft, .lens-left img, #imgLeft, #leftLens'
            );
            const rightLens = document.querySelector(
                '[data-role="lens-right"], #lensRight, .lens-right img, #imgRight, #rightLens'
            );

            if (window.App && App.state && App.state.questions) {
                // GASデータがある場合
                const currentIndex = index || App.state.currentIndex || 0;
                const question = App.state.questions[currentIndex];

                if (question) {
                    setImgSafe(leftLens, question.imageLeft, 'Lens');
                    setImgSafe(rightLens, question.imageRight, 'Lens');
                }
            } else {
                // ダミーデータの外部プレースホルダをdata URIに置換
                if (leftLens && /via\.placeholder\.com/.test(leftLens.src)) {
                    leftLens.src = inlinePlaceholder('Lens');
                }
                if (rightLens && /via\.placeholder\.com/.test(rightLens.src)) {
                    rightLens.src = inlinePlaceholder('Lens');
                }
            }
        } catch(e) {
            console.warn('[quiz-hook] load patch skipped:', e);
        }
    };

    // 初期化完了ログ
    log('Quiz override initialized');

})();