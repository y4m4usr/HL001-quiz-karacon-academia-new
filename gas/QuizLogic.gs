

// ===================================================================
// クイズロジック (問題生成、スコアリング)
// ===================================================================

/**
 * 正解候補と全ての候補リストから、1問分のクイズデータを生成する
 * @param {object} correctCand - 正解の候補
 * @param {Array<object>} allCandidates - 全ての候補
 * @return {object | null} 生成されたクイズデータ、または生成不可の場合はnull
 */
function buildQuestion_(correctCand, allCandidates) {
  const distractors = [];
  const usedKeys = new Set([correctCand.key]); // 正解のキーを既に使用済みとして登録
  const allCandidatesShuffled = shuffle_([...allCandidates]);

  // 誤答選択肢を3つ探す
  // 優先順位1: カテゴリが一致し、色が似ているもの
  for (const cand of allCandidatesShuffled) {
    if (distractors.length >= 3) break;
    if (usedKeys.has(cand.key)) continue; // 「ブランド｜カラー」が重複するものは除外

    const hasIntersection = [...correctCand.cats].some(cat => cand.cats.has(cat));
    if (!hasIntersection) continue;

    const sim = colorSim_(correctCand.color, cand.color);
    if (sim < 0.15) continue; // 類似度の閾値

    distractors.push(cand.key);
    usedKeys.add(cand.key);
  }

  // 優先順位2: それでも足りなければ、カテゴリや色の一致を問わずランダムに補充
  if (distractors.length < 3) {
    for (const cand of allCandidatesShuffled) {
      if (distractors.length >= 3) break;
      if (usedKeys.has(cand.key)) continue; // 「ブランド｜カラー」が重複するものは除外

      distractors.push(cand.key);
      usedKeys.add(cand.key);
    }
  }

  if (distractors.length < 3) return null; // 誤答が3件作れない場合は問題作成不可

  const options = [correctCand.key, ...distractors];
  shuffle_(options);
  
  // v1.7: フロントに返す問題オブジェクト
  return {
    questionId: Utilities.getUuid(),
    lensUrl: correctCand.lensUrl,       // v1.7: レンズ画像URL (X列ベース)
    thumbUrl: correctCand.thumbUrl,     // v1.7: サムネ画像URL (W列ベース) - 正解フィードバック用
    options: options,
    correctAnswer: correctCand.key,
    hint1: correctCand.hint1,
    hint2: correctCand.hint2
  };
}

// v1.7: スコアリングロジック (プレースホルダ)
function calculateScore(isCorrect, hintsUsed, timeTaken) {
  // TODO: v1.7のスコアリングロジックを実装
  // 正解: 基本スコア
  // 不正解: -10%
  // ヒント1回: -3%
  // タイムアウト: 未回答として-10%扱い
  return 100; 
}

// ===================================================================
// 内部ヘルパー関数 (QuizLogic関連)
// ===================================================================

function shuffle_(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}

// 以下はv1.6.1から流用した色類似度判定ロジック群
function colorSim_(a,b){const COLOR_TOKENS=['ブラウン','ライトブラウン','ダークブラウン','グレー','グレイ','ブルー','グリーン','オリーブ','ピンク','パープル','バイオレット','ヘーゼル','ブラック','ベージュ','アッシュ','レッド','オレンジ','アンバー','チャコール','ネイビー'];const na=normColor_(a),nb=normColor_(b);if(!na||!nb)return 0;const famA=COLOR_TOKENS.filter(t=>na.includes(t));const famB=COLOR_TOKENS.filter(t=>nb.includes(t));if(famA.length&&famB.length&&!famA.some(x=>famB.includes(x)))return 0;const bigramsA=new Set(getBigrams_(na));const bigramsB=new Set(getBigrams_(nb));if(!bigramsA.size||!bigramsB.size)return 0;let inter=0;bigramsA.forEach(g=>{if(bigramsB.has(g))inter++});const union=bigramsA.size+bigramsB.size-inter;return union?inter/union:0}function normColor_(s){return s_(''+s).replace(/[()[\"\\]{}!！?？・･\-\s＿_－—〜~､、，,．.\/\\]/g,'').toLowerCase()}function getBigrams_(s){const grams=[];for(let i=0;i<s.length-1;i++)grams.push(s.slice(i,i+2));return grams}
