function health_(){
  let strict_rows=0, cat_pairs=0, img_status=-1, note="";
  try{ strict_rows = readMaster_().length; }catch(e){ note+="master:"+e.message+";"; }
  try{ cat_pairs   = readCategories_().size; }catch(e){ note+="cat:"+e.message+";"; }
  try{
    const mf = fetchManifest_();
    const anyKey = Object.keys(mf.lens||{})[0];
    if (anyKey){
      const fname = mf.lens[anyKey];
      const raw   = toRaw_(`${CFG.GITHUB.PATHS.LENS_DIR}/${fname}`);
      const res   = UrlFetchApp.fetch(raw, {muteHttpExceptions:true});
      img_status  = res.getResponseCode();
      if (img_status>=400){
        const cdn = toCdnFallback_(raw);
        img_status = UrlFetchApp.fetch(cdn, {muteHttpExceptions:true}).getResponseCode();
      }
    }
  }catch(e){ note+="img:"+e.message+";"; }
  const ok = (strict_rows>0 && cat_pairs>=0 && (img_status===200));
  return ContentService.createTextOutput(JSON.stringify({ok, stats:{strict_rows,cat_pairs,img_status}}))
    .setMimeType(ContentService.MimeType.JSON);
}
