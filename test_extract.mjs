import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const buf = fs.readFileSync("/tmp/test.pdf");
const data = new Uint8Array(buf);
const pdf = await pdfjs.getDocument({ data, useWorker: false, isEvalSupported: false }).promise;
const page = await pdf.getPage(1);
const tc = await page.getTextContent();
const items = tc.items.filter(i=>i.str.trim()).map(i=>({s:i.str, x:i.transform[4], y:i.transform[5], w:i.width}));
items.sort((a,b)=> b.y-a.y || a.x-b.x);
const TOL=3; const rows=[];
for(const it of items){
  const last=rows[rows.length-1];
  if(last && Math.abs(last[0].y-it.y)<=TOL) last.push(it); else rows.push([it]);
}
console.log("Total rows:", rows.length);
rows.slice(0,40).forEach((r,i)=> console.log(i, r.map(it=>it.s).join("|")));
