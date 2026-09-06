import sys, os, glob
from pypdf import PdfReader
src="docs/standards"; out="docs/standards/extracted"
for f in sorted(glob.glob(os.path.join(src,"*.pdf"))):
    base=os.path.splitext(os.path.basename(f))[0]
    dst=os.path.join(out, base+".txt")
    try:
        r=PdfReader(f)
        parts=[]
        for i,p in enumerate(r.pages, 1):
            t=p.extract_text() or ""
            parts.append(f"\n\n===== [PDF PAGE {i}] {base} =====\n"+t)
        txt="".join(parts)
        open(dst,"w").write(txt)
        print(f"{base}: {len(r.pages)} pages, {len(txt)} chars")
    except Exception as e:
        print(f"{base}: FAILED {e}")
