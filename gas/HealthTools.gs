function health_(){
  let strict_rows=0, withX_rows=0, cat_pairs=0, alive_imgs=0, note="";
  try{
    const pool = readMasterStrict_();
    strict_rows = pool.length;
    withX_rows  = pool.filter(r=>!_isBlank(r.X)).length;

    const cats = readCategories_();
    cat_pairs = cats.size;

    const checkN = Math.min(10, pool.length);
    for (let i=0; i<checkN; i++){
      const u = resolveImage_(pool[i]);
      if (!_isBlank(u)) alive_imgs++;
    }
  }catch(e){ note = String(e.message||e); }

  const ok = (strict_rows>0 && withX_rows>0 && alive_imgs>0);
  return ContentService.createTextOutput(JSON.stringify({ ok, stats:{strict_rows,withX_rows,cat_pairs,alive_imgs}, note }))
    .setMimeType(ContentService.MimeType.JSON);
}
