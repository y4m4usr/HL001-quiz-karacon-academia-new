

// ===================================================================
// クイズロジック (問題生成、スコアリング)
// ===================================================================

/** SPEC-LOCK: 本ファイルは「最終構造化仕様（出題ロジック簡素化版）」に準拠し、以下を厳守する。
 *  - 2行目=項目／3行目〜=データ、行内に空白セルが1つでもあれば不採用（評価範囲は CFG.LAYOUT の LAST_COL_INDEX まで）
 *  - 必須列 E/I/J/K/X がすべて非空。クイズ表示は X=レンズのみ。W=サムネは正解時フィードバック用。
 *  - ランタイムで Drive は触らない（CSV出力や DriveApp を使用しない）。manual_fix_queue はシートへ追記。
 *  - CK=E|I|J|K でランキング/マイ成績を集計。
 * 改変が必要な場合は Config のみ変更し、関数の契約は変えないこと。
 */

/**
 * 正解候補と全ての候補リストから、1問分のクイズデータを生成する
 * @param {object} correctCand - 正解の候補
 * @param {Array<object>} allCandidates - 全ての候補
 * @return {object | null} 生成されたクイズデータ、または生成不可の場合はnull
 */
function buildQuestion_(correctCand, allCandidates) {
  const wrongs = pickWrongAnswers_(correctCand, allCandidates, 3);
  if (wrongs.length < 3) return null; // 誤答が3件確保できなければ問題を生成しない

  const options = [
    createOption_(correctCand, true),
    ...wrongs.map(w => createOption_(w, false))
  ];

  shuffle_(options);

  return {
    questionId: `CK:${correctCand.key}`,
    lensUrl: correctCand.lensUrl,
    thumbUrl: correctCand.thumbUrl,
    options: options,
    correctAnswerKey: correctCand.key,
    correctAnswerLabel: correctCand.label,
    hint1: correctCand.hint1,
    hint2: correctCand.hint2,
    specs: correctCand.specs || null
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

function shuffle_(arr){
  if(!Array.isArray(arr)){
    throw new Error(`shuffle_ は配列を期待しましたが、${Object.prototype.toString.call(arr)} が渡されました。`);
  }
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

/**
 * 誤答候補を仕様に沿って抽出する
 * @param {object} correct
 * @param {Array<object>} pool
 * @param {number} n
 * @return {Array<object>}
 */
function pickWrongAnswers_(correct, pool, n){
  if(!correct || typeof correct !== 'object'){
    throw new Error('pickWrongAnswers_: 正解オブジェクトが不正です。');
  }
  if(!Array.isArray(pool)){
    throw new Error('pickWrongAnswers_: 候補リストが配列ではありません。');
  }
  const picked=[];
  const usedKeys=new Set([correct.key]);
  const usedLabels=new Set([correct.label]);
  const colorWords=normalizeColorSet_(correct.colorWords);

  const others=pool.filter(c=>c.key!==correct.key);

  const takeFrom=(source)=>{
    for(const cand of source){
      if(picked.length>=n) break;
      if(usedKeys.has(cand.key)) continue;
      if(usedLabels.has(cand.label)) continue;
      picked.push(cand);
      usedKeys.add(cand.key);
      usedLabels.add(cand.label);
    }
  };

  const sameCategory=shuffle_(others.filter(c=>hasColorOverlap_(colorWords,normalizeColorSet_(c.colorWords))));
  takeFrom(sameCategory);

  if(picked.length<n){
    const sameBrand=shuffle_(others.filter(c=>c.brand===correct.brand && c.color!==correct.color));
    takeFrom(sameBrand);
  }

  if(picked.length<n){
    takeFrom(shuffle_([...others]));
  }

  return picked.slice(0,n);
}

function normalizeColorSet_(value){
  if(value instanceof Set) return value;
  if(Array.isArray(value)) return new Set(value);
  if(typeof value==='string' && value.trim()) return new Set([value.trim()]);
  return new Set();
}

function hasColorOverlap_(a,b){
  if(!a||!b||a.size===0||b.size===0) return false;
  for(const word of a){
    if(b.has(word)) return true;
  }
  return false;
}

function createOption_(candidate,isCorrect){
  return {
    id: candidate.key,
    label: candidate.label,
    isCorrect: isCorrect
  };
}
