/** health: master/カテゴリ採用件数 + 画像到達性（raw→CDN） */
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
