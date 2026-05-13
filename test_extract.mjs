import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";
const buf = fs.readFileSync("/tmp/test.pdf");
const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorker:false, isEvalSupported:false }).promise;
const page = await pdf.getPage(1);
const tc = await page.getTextContent();
const items = tc.items.filter(i=>i.str.trim()).map(i=>({s:i.str, x:i.transform[4], y:i.transform[5], w:i.width}));
items.sort((a,b)=> b.y-a.y || a.x-b.x);
const TOL=3; const rows=[];
for(const it of items){ const last=rows[rows.length-1]; if(last && Math.abs(last[0].y-it.y)<=TOL) last.push(it); else rows.push([it]); }
const isNum=s=>/^-?\d{1,4}([.,]\d+)?$/.test(s.trim());
let dayCount=0;
for(const r of rows){
  if(!r[0] || !/^(jeudi|vendredi|samedi|dimanche|lundi|mardi|mercredi)$/i.test(r[0].s.trim())) continue;
  let c=1;
  while(c<r.length && !/^le$/i.test(r[c].s.trim())) c++;
  c++;
  while(c<r.length && !isNum(r[c].s)) c++;
  c++;
  const nums=r.slice(c).filter(it=>isNum(it.s));
  dayCount++;
  // Compute Trappe = Laminé*1.2 + PVC, MAB = al/pvc/al*1.5 + HYB + cHYB
  const v=nums.map(it=>parseFloat(it.s.replace(",",".")));
  const trappe = v[1]*1.2 + v[0];
  const mab = v[4]*1.5 + v[3] + v[6];
  console.log(r[0].s, r[c-1]?.s, "→", nums.length, "vals | Trappe orig=", v[2], "new=", trappe.toFixed(2), "| MAB orig=", v[5], "new=", mab.toFixed(2));
}
console.log("Days:", dayCount);
