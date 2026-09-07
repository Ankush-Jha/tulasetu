import { chromium } from "playwright";
const BASE="http://localhost:5180";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1500,height:1000}});
await p.goto(BASE+"/login",{waitUntil:"networkidle"});
await p.getByText("A. Assistant").click(); await p.waitForURL("**/dashboard");
await p.evaluate(()=>localStorage.setItem("tulasetu.onboarding.seen","1"));

const paths=[
  ["/reports/TS-DEMO-0001/profile","Profile"],
  ["/reports/TS-DEMO-0001/tests","Tests"],
  ["/reports/TS-DEMO-0001/observations","Observations"],
  ["/reports/TS-DEMO-0001/checklist","Checklist"],
  ["/reports/TS-DEMO-0001/attachments","Attachments"],
  ["/reports/TS-DEMO-0001/report","Output"],
];
console.log("PAGE".padEnd(14),"TOP-CHROME".padStart(11),"1ST-CTRL-Y".padStart(11),"WORK-AREA%".padStart(11),"WIDTH-USED".padStart(11));
for(const [path,name] of paths){
  await p.goto(BASE+path,{waitUntil:"networkidle"});
  await p.waitForTimeout(800);
  const m = await p.evaluate(()=>{
    const main=document.querySelector("main"); if(!main) return null;
    const mr=main.getBoundingClientRect();
    // first interactive control (what the officer came to touch)
    const ctrls=[...main.querySelectorAll("input,select,textarea,table")];
    const firstY = ctrls.length ? Math.min(...ctrls.map(c=>c.getBoundingClientRect().top+scrollY)) : null;
    // area of all controls+tables vs page area
    let area=0;
    for(const c of main.querySelectorAll("input,select,textarea,table,svg")){
      const r=c.getBoundingClientRect(); area += Math.max(0,r.width)*Math.max(0,r.height);
    }
    const pageArea = mr.width * document.body.scrollHeight;
    // widest content block
    const blocks=[...main.querySelectorAll("section")].map(s=>s.getBoundingClientRect().width);
    return {
      mainTop: Math.round(mr.top+scrollY),
      firstY: firstY===null?null:Math.round(firstY),
      pct: Math.round(area/pageArea*100),
      widest: blocks.length?Math.round(Math.max(...blocks)):0,
      mainW: Math.round(mr.width),
    };
  });
  if(!m){console.log(name,"— no main");continue;}
  const chrome = m.firstY===null ? "—" : String(m.firstY - m.mainTop)+"px";
  console.log(name.padEnd(14), String(chrome).padStart(11), String(m.firstY??"—").padStart(11),
    (m.pct+"%").padStart(11), (m.widest+"/"+m.mainW).padStart(11));
}
await b.close();
