// Copies the PDF.js worker, CMaps (needed for CJK fonts), standard fonts and
// WASM decoders to /public/pdfjs so the browser viewer can load them, and applies
// a small rendering fix to PDF.js (see FONT_FIX below). Runs on `npm install` and
// in the Docker build.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/pdfjs-dist");
const dest = path.resolve("public/pdfjs");
if (!existsSync(src)) process.exit(0);
await mkdir(dest, { recursive: true });

/*
 * FONT_FIX — Japanese fonts written by Microsoft Word.
 * Word embeds some Japanese fonts as a *simple* font (/Type1, WinAnsi) whose font program is a
 * CID-keyed CFF (/CIDFontType0C). Such glyphs have CIDs, not names, so PDF.js's name-based lookup
 * finds nothing and every character in that font (spaces, hyphens, full stops …) is drawn as the
 * font's ".notdef" glyph — a crossed box. The fix maps each character code to the CID that Word
 * chose: character → Unicode (from the font's own ToUnicode/encoding) → CID. For the Adobe-Japan1
 * collection the CIDs come from Adobe's UniJIS-UTF16-H table (pre-computed below for every
 * character a WinAnsi font can encode); in every Adobe CJK collection printable ASCII U+0020–U+007E
 * is CID 1–95 apart from the exceptions listed. Only fonts of exactly this kind are affected; the
 * PDF file itself is never changed.
 */
const MARKER = "[NSK portal patch: CID-keyed CFF in a simple font]";
const ANCHOR = "    charCodeToGlyphId = type1FontGlyphMapping(properties, encoding, charsets);\n";
// Unicode → Adobe-Japan1 CID where it is not "U+0020–U+007E → CID 1–95" (from UniJIS-UTF16-H).
const JAPAN1 =
  "5c:97,7c:99,7e:100,a0:1,a1:101,a2:102,a3:103,a4:107,a5:61,a6:93,a7:720,a8:647,a9:152,aa:140,ab:109,ac:153,ad:151,ae:154," +
  "af:129,b0:707,b1:694,b2:157,b3:158,b4:645,b5:159,b6:778,b7:117,b8:134,b9:160,ba:144,bb:123,bc:161,bd:162,be:163,bf:126," +
  "c0:164,c1:165,c2:166,c3:167,c4:168,c5:169,c6:139,c7:170,c8:171,c9:172,ca:173,cb:174,cc:175,cd:176,ce:177,cf:178,d0:179," +
  "d1:180,d2:181,d3:182,d4:183,d5:184,d6:185,d7:695,d8:142,d9:187,da:188,db:189,dc:190,dd:191,de:192,df:150,e0:193,e1:194," +
  "e2:195,e3:196,e4:197,e5:198,e6:145,e7:199,e8:200,e9:201,ea:202,eb:203,ec:204,ed:205,ee:206,ef:207,f0:208,f1:209,f2:210," +
  "f3:211,f4:212,f5:213,f6:214,f7:696,f8:148,f9:216,fa:217,fb:218,fc:219,fd:220,fe:221,ff:222,152:143,153:149,160:223," +
  "161:227,178:224,17d:225,17e:229,192:105,2c6:128,2dc:95,2013:114,2014:138,2018:98,2019:96,201a:120,201c:108,201d:122," +
  "201e:121,2020:776,2021:777,2022:119,2026:668,2030:772,2039:110,203a:111,20ac:9354,2122:228";
const FONT_FIX = `    if (cff.isCIDFont) {
      // ${MARKER}
      const glyphOfCid = Object.create(null);
      for (let gid = 0; gid < charsets.length; gid++) {
        glyphOfCid[charsets[gid]] = gid;
      }
      const ros = cff.topDict.getByName("ROS");
      const japan1 = ros && cff.strings.get(ros[1]) === "Japan1";
      const exceptions = Object.create(null);
      if (japan1) {
        for (const pair of "${JAPAN1}".split(",")) {
          const [unicode, cid] = pair.split(":");
          exceptions[parseInt(unicode, 16)] = +cid;
        }
      }
      charCodeToGlyphId = Object.create(null);
      for (let charCode = 0; charCode < 256; charCode++) {
        const text = properties.toUnicode?.get(charCode);
        let unicode = typeof text === "string" && text.length === 1 ? text.charCodeAt(0) : -1;
        if (unicode < 0 && charCode >= 0x20 && charCode <= 0x7e) {
          unicode = charCode;
        }
        const cid = exceptions[unicode] ?? (unicode >= 0x20 && unicode <= 0x7e ? unicode - 31 : undefined);
        const gid = cid === undefined ? undefined : glyphOfCid[cid];
        if (gid !== undefined) {
          charCodeToGlyphId[charCode] = gid;
        }
      }
      return charCodeToGlyphId;
    }
`;

function patch(code, file) {
  if (code.includes(MARKER)) return code;
  if (code.split(ANCHOR).length !== 2) {
    console.warn(`⚠ PDF.js font fix not applied to ${file} (code changed in this PDF.js version) — check scripts/copy-pdfjs-assets.mjs`);
    return code;
  }
  return code.replace(ANCHOR, FONT_FIX + ANCHOR);
}

// Browser viewer: a patched copy of the readable (non-minified) worker. node_modules is not changed.
// (Server-side OCR is only used for scanned PDFs, which have no embedded fonts.)
const worker = path.join(src, "build/pdf.worker.mjs");
await writeFile(path.join(dest, "pdf.worker.mjs"), patch(await readFile(worker, "utf8"), worker));

for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  if (existsSync(path.join(src, dir))) await cp(path.join(src, dir), path.join(dest, dir), { recursive: true });
}
console.log("✓ PDF.js assets copied to public/pdfjs");
