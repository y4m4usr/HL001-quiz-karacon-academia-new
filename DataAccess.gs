// gas/DataAccess.gs
function ssOpen_(id){ return SpreadsheetApp.openById(id); }
function shGet_(bookId, name){ return ssOpen_(bookId).getSheetByName(name) || ssOpen_(bookId).insertSheet(name); }
function vAll_(sh){ const v = sh.getDataRange().getValues(); const head = v.shift()||[]; return {head, rows:v}; }

function normalizeKana_(s){ let t=(s||'').toString().trim().normalize('NFKC'); t=t.replace(/[\u30A1-\u30F6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)); t=t.replace(/[\s\-ー＿‐・.,、。]/g,''); return t; }
function lev_(a,b){ const m=a.length,n=b.length,dp=Array.from({length:m+1},(_,i)=>Array(n+1).fill(0)); for(let i=0;i<=m;i++)dp[i][0]=i; for(let j=0;j<=n;j++)dp[0][j]=j; for(let i=1;i<=m;i++){ for(let j=1;j<=n;j++){ const c=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+c);} } return dp[m][n]; }
function simName_(a,b){ const A=normalizeKana_(a),B=normalizeKana_(b); if(!A||!B) return 0; const d=lev_(A,B), L=Math.max(A.length,B.length); return L?1-d/L:1; }

function mkKey_(brandKana, colorKana){ return `${brandKana}||${colorKana}`.trim(); }

function loadMaster_(){
  try {
    const sh = shGet_(CFG.MASTER_BOOK_ID, CFG.SHEETS.MASTER);
    const {rows} = vAll_(sh);
    const c=CFG.COLS.MASTER;

    console.log('マスターシート行数:', rows.length);

    if (!rows || rows.length === 0) {
      console.error('マスターシートにデータがありません');
      return [];
    }

    const results = rows.map((r, index) => {
      if (!Array.isArray(r)) {
        console.warn(`行${index + 2}が配列ではありません:`, r);
        return null;
      }

      const brandKana = String(r[c.BRAND_KANA-1]||'').trim();
      const colorKana = String(r[c.COLOR_KANA-1]||'').trim();
      
      if (!brandKana || !colorKana) {
        return null;
      }
      
      const imageUrl  = c.IMAGE_URL>0 ? String(r[c.IMAGE_URL-1]||'').trim() : '';
      const dia       = c.DIA>0 ? String(r[c.DIA-1]||'').trim() : '';
      const gDia      = c.G_DIA>0 ? String(r[c.G_DIA-1]||'').trim() : '';
      const bc        = c.BC>0 ? String(r[c.BC-1]||'').trim() : '';
      const comment   = c.COMMENT>0 ? String(r[c.COMMENT-1]||'').trim() : '';
      const active    = true;
      
      return { brandKana, colorKana, imageUrl, dia, gDia, bc, comment, active };
    })
    .filter(x => x && x.brandKana && x.colorKana)
    .map(x => ({ ...x, key: mkKey_(x.brandKana, x.colorKana) }))
    .filter(x => x && x.key && x.key.trim());

    console.log('マスターデータ取得完了:', results.length, '件');
    return results;
    
  } catch (error) {
    console.error('loadMaster_でエラー:', error);
    return [];
  }
}
 
function loadCategoryIndex_(){
  const sh = shGet_(CFG.MASTER_BOOK_ID, CFG.SHEETS.CATEGORY);
  const {rows} = vAll_(sh); const c=CFG.COLS.CATEGORY;
  const mapCats = new Map();

  for (const row of rows) {
    const brandKana = String(row[c.BRAND_KANA-1]||'').trim();
    const colorKana = String(row[c.COLOR_KANA-1]||'').trim();
    const categories = String(row[c.CATEGORIES-1]||'').trim();

    if (brandKana && colorKana) {
      const key = mkKey_(brandKana, colorKana);
      const catSet = new Set();
      if (categories) {
        categories.split(/[,、；;]/).forEach(cat => {
          const trimmed = cat.trim();
          if (trimmed) catSet.add(trimmed);
        });
      }
      mapCats.set(key, catSet);
    }
  }

  return { mapCats };
}


