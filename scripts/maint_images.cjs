/*
  Validate and optimize images under imagesnew1/**.
  - Validates local JPEG headers
  - Best-effort remote HEAD check on raw.githubusercontent.com
  - Re-encodes JPEGs with sharp: quality 82, progressive, mozjpeg, strip metadata
  - Writes back only if optimization succeeds
*/

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const https = require('https');
let sharp = null;
let HAS_SHARP = true;
try{ sharp = require('sharp'); }
catch(_){ HAS_SHARP = false; }

const ROOT = process.cwd();
const BASE = path.join(ROOT, 'imagesnew1');
const GITHUB = { user: 'y4m4usr', repo: 'HL001-quiz-karacon-academia-new', ref: 'main' };

function listFiles(dir) {
  const out = [];
  (function walk(d){
    const entries = fs.readdirSync(d, { withFileTypes:true });
    for (const e of entries){
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && /\.(jpe?g)$/i.test(e.name)) out.push(p);
    }
  })(dir);
  return out;
}

function isLocalJpegHeader(buf){
  return buf && buf.length>=3 && buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF;
}

function encodePathForRaw(p){
  return p.split('/').map(encodeURIComponent).join('/');
}

function headRawGitHub(relPath){
  return new Promise((resolve)=>{
    const enc = encodePathForRaw(relPath.replace(/\\/g,'/'));
    const url = `https://raw.githubusercontent.com/${GITHUB.user}/${GITHUB.repo}/${GITHUB.ref}/${enc}`;
    const req = https.request(url, { method: 'HEAD', timeout: 15000 }, (res)=>{
      const ok = res.statusCode>=200 && res.statusCode<400;
      const ct = res.headers['content-type']||'';
      resolve({ ok, status: res.statusCode, ct, url });
    });
    req.on('error', ()=>resolve({ ok:false, status:0, ct:'', url }));
    req.on('timeout', ()=>{ req.destroy(); resolve({ ok:false, status:0, ct:'', url }); });
    req.end();
  });
}

async function optimizeJpeg(file){
  if (!HAS_SHARP){
    // Fallback: strip JPEG APPn/COM segments without re-encoding (EXIF removal)
    try{
      const buf = await fsp.readFile(file);
      if (!isLocalJpegHeader(buf)) return { ok:false, reason:'not-jpeg' };
      // parse segments and remove APP0..APP15, COM
      let pos = 2; // after SOI
      const out = [buf.subarray(0, 2)];
      const len = buf.length;
      const MARK = 0xFF;
      const keepSegment = (marker)=>{
        if (marker>=0xE0 && marker<=0xEF) return false; // APP0..APP15
        if (marker===0xFE) return false; // COM
        return true;
      };
      while (pos+1 < len){
        if (buf[pos] !== MARK){ pos++; continue; }
        // Skip fill bytes 0xFF
        while (pos < len && buf[pos] === MARK) pos++;
        if (pos >= len) break;
        const marker = buf[pos]; pos++;
        if (marker === 0xD9 /*EOI*/){ out.push(Buffer.from([0xFF,0xD9])); break; }
        if (marker === 0xDA /*SOS*/){
          // copy from marker-2 (include 0xFF 0xDA) to end
          out.push(Buffer.from([0xFF,0xDA]));
          out.push(buf.subarray(pos, len));
          pos = len; break;
        }
        // Markers without length
        if ((marker>=0xD0 && marker<=0xD7) || marker===0x01 || marker===0xD8){
          // RSTn, TEM, SOI
          out.push(Buffer.from([0xFF, marker]));
          continue;
        }
        if (pos+1 >= len) break;
        const segLen = (buf[pos]<<8) | buf[pos+1];
        const segStart = pos-2; // include 0xFF <marker>
        const segEnd = pos + segLen; // position after segment
        if (segEnd > len) { break; }
        if (keepSegment(marker)){
          out.push(buf.subarray(segStart, segEnd));
        }
        pos = segEnd;
      }
      const outBuf = Buffer.concat(out);
      const before = buf.length;
      if (outBuf.length < before){
        await fsp.writeFile(file, outBuf);
        return { ok:true, before, after: outBuf.length, saved: before - outBuf.length, method:'strip-app-com' };
      }
      return { ok:true, before, after: before, saved: 0, method:'no-change' };
    }catch(e){
      return { ok:false, reason: String(e && e.message || e) };
    }
  }
  try{
    const before = (await fsp.stat(file)).size;
    const buf = await sharp(file).jpeg({
      quality: 82,
      progressive: true,
      mozjpeg: true,
      chromaSubsampling: '4:2:0'
    }).toBuffer();
    if (!buf || !buf.length) return { ok:false, reason:'empty-output' };
    await fsp.writeFile(file, buf);
    const after = buf.length;
    return { ok:true, before, after, saved: Math.max(0, before - after) };
  }catch(e){
    return { ok:false, reason: String(e && e.message || e) };
  }
}

async function main(){
  const files = listFiles(BASE);
  let invalidLocal=0, invalidRemote=0, optimized=0, bytesSaved=0;
  const issues=[];
  const MAX_REMOTE = Number(process.env.MAX_REMOTE || '0');
  let remoteChecked = 0;

  for (const file of files){
    const rel = path.relative(ROOT, file).replace(/\\/g,'/');
    let hdrOk=false;
    try{
      const fd = await fsp.open(file,'r');
      const { buffer } = await fd.read(Buffer.alloc(4),0,4,0);
      await fd.close();
      hdrOk = isLocalJpegHeader(buffer);
    }catch(_){ hdrOk=false; }
    if (!hdrOk){ invalidLocal++; issues.push({ file: rel, type:'local-invalid' }); continue; }

    // Remote check (best effort). Non-blocking for optimize.
    if (MAX_REMOTE>0 && remoteChecked<MAX_REMOTE){
      try{
        const res = await headRawGitHub(rel);
        remoteChecked++;
        if (!(res.ok) || (res.ct && !/^image\//i.test(res.ct))){
          invalidRemote++;
          issues.push({ file: rel, type:'remote-invalid', status: res.status, ct: res.ct });
        }
      }catch(_){ /* ignore */ }
    }

    const r = await optimizeJpeg(file);
    if (r.ok){ optimized++; bytesSaved += r.saved||0; }
    else { issues.push({ file: rel, type:'optimize-failed', reason: r.reason }); }
  }

  const summary = {
    scanned: files.length,
    invalidLocal,
    invalidRemote,
    optimized,
    bytesSaved
  };
  console.log(JSON.stringify({ summary, issues }, null, 2));
}

main().catch(e=>{ console.error(e); process.exit(1); });
