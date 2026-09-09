import { extractCadreAluRows } from "../src/lib/cadresAlu.server";
import { COULEURS_REF } from "../src/lib/couleursRef";
import { readFileSync } from "fs";
import MDBReader from "mdb-reader";
const buf = readFileSync("/mnt/user-uploads/03.MDB");
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength) as ArrayBuffer;
const couleurs = [...COULEURS_REF.map(c=>({name:c.name, code:c.code ?? null})), {name:"Noir",code:"P-525"},{name:"Brun Commercial",code:"P-562"}];
const rows = extractCadreAluRows(ab, null, undefined, couleurs as any);
const empty = rows.filter(r=>!r.couleur);
console.log("total", rows.length, "sans couleur", empty.length);
// dump raw opt text for a few empty ones
const reader = new MDBReader(buf);
let table:any=null;
for (const n of reader.getTableNames()){const t=reader.getTable(n);const c=t.getColumnNames();if(c.includes("Code")&&c.includes("Sequence")&&c.includes("Description")){table=t;break;}}
const data = table.getData();
const byId = new Map<string,any[]>();
for (const d of data){const k=String(d["Code"]??"");const a=byId.get(k)??[];a.push(d);byId.set(k,a);}
let shown=0;
for (const e of empty){
  const recs = byId.get(String(e.id))??[];
  const txt = recs.flatMap(r=>Object.entries(r).filter(([k])=>/^opt\d+$/i.test(k)).map(([k,v])=>`${k}=${String(v??"")}`)).filter(s=>s.split("=")[1].trim());
  const hit = txt.filter(s=>/coul|peint|p-\d|#\d|\b\d{3}\b/i.test(s));
  if(hit.length){console.log("---", e.id, e.sequence); console.log(hit.slice(0,8).join(" | ").slice(0,600)); shown++;}
  if(shown>=25) break;
}
