import { extractCadreAluRows } from "../src/lib/cadresAlu.server";
import { COULEURS_REF } from "../src/lib/couleursRef";
import { readFileSync } from "fs";
import MDBReader from "mdb-reader";
const file = process.argv[2] ?? "/mnt/user-uploads/03.MDB";
const buf = readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength) as ArrayBuffer;
const couleurs = [...COULEURS_REF.map(c=>({name:c.name, code:c.code ?? null})), {name:"Noir",code:"P-525"},{name:"Brun Commercial",code:"P-562"}];
const rows = extractCadreAluRows(ab, null, undefined, couleurs as any);
const empty = new Set(rows.filter(r=>!r.couleur).map(r=>r.sequence+"|"+r.id));
const reader = new MDBReader(buf);
let table:any=null;
for (const n of reader.getTableNames()){const t=reader.getTable(n);const c=t.getColumnNames();if(c.includes("Code")&&c.includes("Sequence")&&c.includes("Description")){table=t;break;}}
const data = table.getData();
let shown=0;
for (const d of data){
  const seq=String(d["Sequence"]??"");
  const code=String(d["Code"]??"");
  const id = code.split("-").slice(-1)[0] ? code : code;
  const match = [...empty].find(k=>k.startsWith(seq+"|") && code.includes(k.split("|")[1]));
  if(!match) continue;
  const txt = Object.entries(d).filter(([k])=>/^opt\d+$/i.test(k)).map(([k,v])=>`${k}=${String(v??"")}`).filter(s=>s.split("=")[1].trim()).join(" | ");
  console.log("###", seq, code); console.log(txt.slice(0,1200));
  if(++shown>=10) break;
}
