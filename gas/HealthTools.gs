/** health: master/カテゴリ採用件数 + 画像到達性（raw→CDN） */

function health_(){
  let strict_rows=0, req_only_rows=0, cat_pairs=0, img_status=-1, index_count=0, note="";
  try{ strict_rows   = readMasterStrict_().length; }catch(e){ note+="masterS:"+e.message+";"; }
  try{ req_only_rows = readMasterRequiredOnly_().length; }catch(e){ note+="masterR:"+e.message+";"; }
  try{ cat_pairs     = readCategories_().size; }catch(e){ note+="cat:"+e.message+";"; }
  try{
    const idx = buildLensIndex_(); index_count = Object.keys(idx).length; // ★ 追記
    const any = Object.values(idx)[0];
    if (any){
      let res = UrlFetchApp.fetch(any, {muteHttpExceptions:true, followRedirects:true});
      img_status = res.getResponseCode();
      if (img_status>=400){
        const cdn = toCdnFallback_(any);
        res = UrlFetchApp.fetch(cdn, {muteHttpExceptions:true, followRedirects:true});
        img_status = res.getResponseCode();
      }
    }
  }catch(e){ note+="img:"+e.message+";"; }

  const ok = ((strict_rows>0 || req_only_rows>0) && index_count>0 && img_status>=200 && img_status<400);
  return ContentService.createTextOutput(JSON.stringify({ ok, stats:{strict_rows,req_only_rows,cat_pairs,index_count,img_status}, note }))
    .setMimeType(ContentService.MimeType.JSON);
}


function health_(){
  let strict_rows=0, cat_pairs=0, img_status=-1, note="";

  try{ strict_rows = readMaster_().length; }catch(e){ note+="master:"+e.message+";"; }
  try{ cat_pairs   = readCategories_().size; }catch(e){ note+="cat:"+e.message+";"; }
  try{
    const pool = readMaster_();
    if (pool.length){
      let raw = buildImageUrl_(pool[0], 'lens');
      let res = UrlFetchApp.fetch(raw, {muteHttpExceptions:true, followRedirects:true});
      img_status = res.getResponseCode();
      if (img_status >= 400){
        raw = toCdnFallback_(raw);
        res = UrlFetchApp.fetch(raw, {muteHttpExceptions:true, followRedirects:true});
        img_status = res.getResponseCode();
      }
    }
  }catch(e){ note += "img:"+e.message+";"; }

  const ok = (strict_rows>0 && img_status>=200 && img_status<400);
  return ContentService.createTextOutput(JSON.stringify({ ok, stats:{strict_rows,cat_pairs,img_status}, note }))
    .setMimeType(ContentService.MimeType.JSON);
}
