import { chromium } from "playwright";
const OUT=process.argv[2], BASE="http://localhost:5180";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(e.message));
await p.goto(BASE+"/login",{waitUntil:"networkidle"});
await p.getByText("A. Assistant").click(); await p.waitForURL("**/dashboard");
await p.evaluate(()=>localStorage.setItem("tulasetu.onboarding.seen","1"));
// viewport-only shots: what the officer actually sees without scrolling
for (const [path,name] of [
  ["/reports/TS-DEMO-0001/profile","80-profile-fold"],
  ["/reports/TS-DEMO-0001/observations","81-observations-fold"],
  ["/reports/TS-DEMO-0001/report","82-output-fold"],
]) {
  await p.goto(BASE+path,{waitUntil:"networkidle"});
  await p.waitForTimeout(1200);
  await p.screenshot({path:`${OUT}/${name}.png`});
}
console.log("errors:",errs.length?errs.join("; "):"none");
await b.close();
