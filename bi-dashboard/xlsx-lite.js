/* ===========================================================================
   xlsx-lite.js — zero-dependency .xlsx reader (ZIP + Deflate via browser API)
   Reads only what we need: shared strings + one worksheet, streamed.
   Works in any Chromium/Edge/Firefox that supports DecompressionStream.
   =========================================================================== */
(function (global) {
  'use strict';

  const SIG_EOCD = 0x06054b50;
  const SIG_CD = 0x02014b50;
  const SIG_LH = 0x04034b50;

  function u16(dv, off) { return dv.getUint16(off, true); }
  function u32(dv, off) { return dv.getUint32(off, true); }

  /* ---------- ZIP ---------- */
  async function readZipIndex(file) {
    const tailLen = Math.min(file.size, 66000);
    const tailBuf = await file.slice(file.size - tailLen).arrayBuffer();
    const dv = new DataView(tailBuf);
    let eocd = -1;
    for (let i = dv.byteLength - 22; i >= 0; i--) {
      if (u32(dv, i) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ไม่ใช่ไฟล์ .xlsx ที่ถูกต้อง (ไม่พบ ZIP end record)');

    const entries = u16(dv, eocd + 10);
    const cdOffset = u32(dv, eocd + 16);
    const cdBuf = await file.slice(cdOffset).arrayBuffer();
    const cd = new DataView(cdBuf);

    const index = {};
    let p = 0;
    for (let i = 0; i < entries; i++) {
      if (u32(cd, p) !== SIG_CD) break;
      const method = u16(cd, p + 10);
      const compSize = u32(cd, p + 20);
      const nameLen = u16(cd, p + 28);
      const extraLen = u16(cd, p + 30);
      const commentLen = u16(cd, p + 32);
      const localOff = u32(cd, p + 42);
      const name = new TextDecoder('utf-8').decode(new Uint8Array(cdBuf, p + 46, nameLen));
      index[name] = { method, compSize, localOff };
      p += 46 + nameLen + extraLen + commentLen;
    }
    return index;
  }

  async function openEntryStream(file, entry) {
    // read local header to find data start
    const lhBuf = await file.slice(entry.localOff, entry.localOff + 30).arrayBuffer();
    const lh = new DataView(lhBuf);
    if (u32(lh, 0) !== SIG_LH) throw new Error('ZIP local header เสียหาย');
    const nameLen = u16(lh, 26);
    const extraLen = u16(lh, 28);
    const dataStart = entry.localOff + 30 + nameLen + extraLen;
    const blob = file.slice(dataStart, dataStart + entry.compSize);

    if (entry.method === 0) return blob.stream();
    if (entry.method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('เบราว์เซอร์นี้ไม่รองรับ DecompressionStream — ใช้ Chrome/Edge เวอร์ชันใหม่');
      }
      return blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    }
    throw new Error('วิธีบีบอัด ZIP ไม่รองรับ: ' + entry.method);
  }

  /* ---------- text chunk reader ---------- */
  function textChunks(stream) {
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    return {
      async next() {
        const r = await reader.read();
        return r.done ? null : r.value;
      }
    };
  }

  /* ---------- shared strings ---------- */
  async function readSharedStrings(file, index) {
    const out = [];
    const entry = index['xl/sharedStrings.xml'];
    if (!entry) return out;

    const it = textChunks(await openEntryStream(file, entry));
    let buf = '';
    for (;;) {
      const chunk = await it.next();
      if (chunk === null) break;
      buf += chunk;
      // process complete <si> blocks only; keep the tail
      let lastEnd = buf.lastIndexOf('</si>');
      if (lastEnd < 0) continue;
      const ready = buf.slice(0, lastEnd + 5);
      buf = buf.slice(lastEnd + 5);
      const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
      let m;
      while ((m = re.exec(ready)) !== null) out.push(extractText(m[1]));
    }
    if (buf) {
      const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
      let m;
      while ((m = re.exec(buf)) !== null) out.push(extractText(m[1]));
    }
    return out;
  }

  function extractText(si) {
    if (si.indexOf('<t') < 0) return '';
    let s = '';
    const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(si)) !== null) s += unescapeXml(m[1]);
    return s;
  }

  function unescapeXml(s) {
    if (!/[&<>]/.test(s)) return s;
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
      .replace(/&amp;/g, '&');
  }

  function colIndex(ref) {
    // "AB12" -> 27 (0-based)
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
      else break;
    }
    return n - 1;
  }

  /* ---------- worksheet ----------
     opts: { columns: [0-based col indexes to keep], startRow: 1-based first data row,
             dateCols: Set of 0-based indexes to convert from Excel serial }
     returns array of rows, each row is an array aligned with opts.columns
  */
  async function readSheetRows(file, index, sheetPath, opts) {
    const entry = index[sheetPath];
    if (!entry) throw new Error('ไม่พบ worksheet: ' + sheetPath);

    const keep = new Set(opts.columns || []);
    const dateCols = new Set(opts.dateCols || []);
    const startRow = opts.startRow || 1;
    const rows = [];
    // column index -> slot in the output row (avoids a 90-item scan per cell)
    const slotOf = new Map();
    (opts.columns || []).forEach((c, i) => slotOf.set(c, i));

    const it = textChunks(await openEntryStream(file, entry));
    let buf = '';
    let rowNo = 0;

    for (;;) {
      const chunk = await it.next();
      if (chunk === null) break;
      buf += chunk;

      let lastEnd = buf.lastIndexOf('</row>');
      if (lastEnd < 0) {
        if (buf.length > 40e6) buf = buf.slice(-1000); // safety
        continue;
      }
      const ready = buf.slice(0, lastEnd + 6);
      buf = buf.slice(lastEnd + 6);

      const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
      let rm;
      while ((rm = rowRe.exec(ready)) !== null) {
        rowNo++;
        if (rowNo < startRow) continue;
        const arr = opts.columns ? new Array(opts.columns.length).fill(null) : [];
        const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cm;
        while ((cm = cellRe.exec(rm[2])) !== null) {
          const attrs = cm[1];
          const body = cm[2] || '';
          const refM = /r="([A-Z]+)\d+"/.exec(attrs);
          if (!refM) continue;
          const ci = colIndex(refM[1]);
          const slot = opts.columns ? slotOf.get(ci) : ci;
          if (slot === undefined) continue;

          const tM = /\bt="([^"]+)"/.exec(attrs);
          const vM = /<v>([\s\S]*?)<\/v>/.exec(body);
          let val = null;

          if (tM && tM[1] === 's') {
            val = vM ? opts.sharedStrings[+vM[1]] : null;
          } else if (tM && tM[1] === 'inlineStr') {
            const t = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body);
            val = t ? unescapeXml(t[1]) : null;
          } else if (tM && (tM[1] === 'str' || tM[1] === 'e')) {
            val = vM ? unescapeXml(vM[1]) : null;
          } else if (vM) {
            const n = Number(vM[1]);
            val = isNaN(n) ? unescapeXml(vM[1]) : n;
            if (dateCols.has(ci) && typeof val === 'number' && val > 20000 && val < 80000) {
              val = excelSerialToDate(val);
            }
          }

          if (val !== null) {
            arr[slot] = val;
          }
        }
        rows.push(arr);
      }
    }
    return rows;
  }

  function excelSerialToDate(serial) {
    const ms = Math.round((serial - 25569) * 86400000);
    return new Date(ms);
  }

  async function listSheetPaths(file, index) {
    const wb = index['xl/workbook.xml'];
    if (!wb) return [];
    const buf = await file.slice(0).arrayBuffer();
    const text = new TextDecoder('utf-8').decode(new Uint8Array(buf));
    const relM = [...text.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)]
      .map(m => ({ name: unescapeXml(m[1]), rid: m[2] }));
    const relsEntry = index['xl/_rels/workbook.xml.rels'];
    let rels = '';
    if (relsEntry) {
      const relBuf = await file.slice(0).arrayBuffer();
      rels = new TextDecoder('utf-8').decode(new Uint8Array(relBuf));
    }
    return relM.map((s, i) => ({
      name: s.name,
      path: 'xl/worksheets/sheet' + (i + 1) + '.xml'
    }));
  }

  global.XlsxLite = { readZipIndex, readSharedStrings, readSheetRows, listSheetPaths, colIndex, excelSerialToDate };
})(window);
