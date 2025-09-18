// gas/QuizLogic.gs
const SECRET_SALT = 'CHANGE_ME_RANDOM'; // ★任意の長いランダム文字列に変更（秘匿用）

function rng_(seed){ let t=0; for(const ch of seed) t=(t*131 + ch.charCodeAt(0))>>>0; return ()=>((t = (t+0x6D2B79F5)>>>0), ((t ^ (t>>>15)) * (1|t))>>>0 / 2**32); }
function shuffle_(a, rnd){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(rnd()* (i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function qidFromKey_(key){ const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SECRET_SALT+'|Q|'+key); return Utilities.base64EncodeWebSafe(raw).slice(0,16); }
function oidFromKey_(key){ const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SECRET_SALT+'|O|'+key); return Utilities.base64EncodeWebSafe(raw).slice(0,16); }
function label_(b,c){ return `${b}｜${c}`; }
// filename: gas/QuizLogic.gs
function genQuiz_(staffId, mode) {
  const rnd = rng_(String(Date.now()) + staffId + mode);
  const master = loadMaster_();
  const { mapCats } = loadCategoryIndex_();

  // データ完備の商品のみフィルタリング
  const eligibleProducts = master.filter(m => {
    return m && m.key && 
           m.brandKana && m.colorKana &&
           m.imageUrl && m.imageUrl.trim() !== '' &&
           m.dia && m.gDia && m.bc &&
           m.comment && m.comment.trim() !== '';
  });

  if (eligibleProducts.length < 4) {
    throw new Error('出題可能な商品が不足しています（最低4商品必要）');
  }

  const picked = [];
  const used = new Set();
  let guard = 0;
  const LIMIT = CFG.TOTAL_QUESTIONS || 10;

  while (picked.length < LIMIT && guard++ < 200) {
    const available = eligibleProducts.filter(m => !used.has(m.key));
    if (available.length === 0) break;

    const choose = available[Math.floor(rnd() * available.length)];
    used.add(choose.key);

    // カテゴリ一致する誤答候補を生成
    const chooseCats = mapCats.get(choose.key) || new Set();
    const distractors = eligibleProducts
      .filter(m => m.key !== choose.key && !used.has(m.key))
      .filter(m => {
        const mCats = mapCats.get(m.key) || new Set();
        if (chooseCats.size > 0 && mCats.size > 0) {
          return [...chooseCats].some(cat => mCats.has(cat));
        }
        return true;
      })
      .slice(0, 3);

    if (distractors.length < 3) continue; // 誤答不足時はスキップ

    // 選択肢を作成（正解のkeyも保持）
    const options = shuffle_(
      [
        { key: choose.key, label: label_(choose.brandKana, choose.colorKana) },
        ...distractors.map(d => ({ key: d.key, label: label_(d.brandKana, d.colorKana) }))
      ],
      rnd
    ).map(o => ({ oid: oidFromKey_(o.key), label: o.label }));

    // 正解情報を同梱
    picked.push({
      qid: qidFromKey_(choose.key),
      correctKey: choose.key, // 正解判定用
      imageUrl: choose.imageUrl,
      thumbUrl: choose.imageUrl, // サムネ画像（同じURLでOK）
      correctLabel: label_(choose.brandKana, choose.colorKana),
      options,
      hints: {
        h1: `DIA:${choose.dia} / G.DIA:${choose.gDia} / BC:${choose.bc}`,
        h2: choose.comment
      }
    });
  }
  
  // セッションに保存（正解判定用）
  const cache = CacheService.getScriptCache();
  cache.put(`quiz_${staffId}_${Date.now()}`, JSON.stringify(picked), 600); // 10分間保持
  
  return picked;
}

function scoreQuiz_(answers){
  const wrong = answers.filter(a=>!a.isCorrect).length;
  const hintCount = answers.reduce((s,a)=>s + (a.h1?1:0) + (a.h2?1:0), 0);
  const s = Math.max(CFG.SCORE.MIN, Math.min(CFG.SCORE.MAX, 100 - wrong*CFG.SCORE.WRONG_PENALTY - hintCount*CFG.SCORE.HINT_PENALTY));
  return { score:s, wrong, hintCount };
}

