function health_(){
  var strict_rows=0, alive_imgs=0, checked=0, note="";
  try{
    var pool = readMasterStrict_();
    strict_rows = pool.length;
    var checkN = Math.min(10, pool.length);
    for (var i=0; i<checkN; i++){
      var imgs = resolveImages_(pool[i]);
      checked++;
      if (!_isBlank(imgs.lens)) alive_imgs++;
    }
  }catch(e){ note = String(e && e.message || e); }

  var ok = (strict_rows>0 && alive_imgs>0);
  return ContentService.createTextOutput(JSON.stringify({ ok:ok, stats:{strict_rows:strict_rows, alive_imgs:alive_imgs, sample_checked:checked}, note:note }))
    .setMimeType(ContentService.MimeType.JSON);
}
