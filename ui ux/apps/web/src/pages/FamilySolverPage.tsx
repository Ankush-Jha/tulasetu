import { familyVariants, eutResults, coverageTable, generatedClause } from '../data/mockData';

export default function FamilySolverPage() {
  return (
    <div className="flex flex-col w-full gap-[--spacing-lg]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-[--spacing-md]">
        <div>
          <div className="flex items-center gap-[--spacing-xs] mb-[--spacing-2xs]">
            <span className="badge-applicable">OIML R-76-1 §3.10.4</span>
            <span className="text-label-sm text-outline">Engine Module: Annex F / Family Solver</span>
          </div>
          <h1 className="text-headline-lg font-bold tracking-tight">Instrument Family Solver</h1>
          <p className="text-body-md text-on-surface-variant max-w-2xl mt-1">
            Calculate the minimum subset of Equipment Under Test (EUT) required to grant type approval for a complete family of variants.
          </p>
        </div>
        <button className="btn-primary">
          <span className="material-symbols-outlined text-[18px]">calculate</span>
          Solve Family Matrix
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[--spacing-lg]">
        {/* Left Side: Input Variants */}
        <div className="card h-fit">
          <div className="flex items-center justify-between mb-[--spacing-md]">
             <h2 className="text-headline-sm font-semibold flex items-center gap-2">
               <span className="material-symbols-outlined text-primary">format_list_numbered</span>
               Family Variants Input
             </h2>
             <span className="text-label-sm text-outline">8 Variants Registered</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-low/50">
                  <th className="py-2.5 px-3 text-left text-label-sm font-medium">Variant ID</th>
                  <th className="py-2.5 px-3 text-left text-label-sm font-medium">Max</th>
                  <th className="py-2.5 px-3 text-left text-label-sm font-medium">e</th>
                  <th className="py-2.5 px-3 text-left text-label-sm font-medium">n (Max/e)</th>
                  <th className="py-2.5 px-3 text-left text-label-sm font-medium">Class</th>
                  <th className="py-2.5 px-3 text-center text-label-sm font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="font-mono-data text-label-md">
                {familyVariants.map((v) => (
                  <tr key={v.variantId} className="border-b border-border-subtle hover:bg-surface-lowest transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-primary">{v.variantId}</td>
                    <td className="py-2.5 px-3">{v.max} {v.maxUnit}</td>
                    <td className="py-2.5 px-3">{v.e} {v.eUnit}</td>
                    <td className="py-2.5 px-3 text-on-surface-variant">{v.n.toLocaleString()}</td>
                    <td className="py-2.5 px-3">{v.class}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button className="text-outline hover:text-error transition-colors p-1">
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6} className="py-3 px-3 text-center">
                    <button className="text-label-sm text-primary flex items-center justify-center w-full gap-1 hover:underline font-sans font-medium">
                      <span className="material-symbols-outlined text-[16px]">add</span> Add Variant
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Solver Results */}
        <div className="flex flex-col gap-[--spacing-lg]">
          
          {/* EUT Required */}
          <div className="card bg-surface-lowest shadow-[var(--shadow-stage)] border border-primary/20 relative overflow-hidden">
             {/* Decorative blob */}
             <div className="absolute top-0 right-0 w-32 h-32 bg-primary-fixed/30 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
             
             <div className="flex items-center gap-[--spacing-sm] mb-[--spacing-md] relative z-10">
               <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-sm">
                 <span className="material-symbols-outlined text-[22px]">done_all</span>
               </div>
               <div>
                 <h2 className="text-headline-sm font-semibold text-primary">Required EUT Set</h2>
                 <p className="text-body-sm text-on-surface-variant">Only these {eutResults.length} variants require physical testing.</p>
               </div>
             </div>
             
             <div className="flex flex-col gap-[--spacing-sm] relative z-10">
               {eutResults.map((res) => (
                 <div key={res.variantId} className="flex items-center justify-between p-[--spacing-sm] rounded-xl bg-surface-low border border-border-subtle hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-[--spacing-md]">
                      <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-surface-lowest shadow-sm">
                        <span className="text-label-sm text-outline leading-tight">VAR</span>
                        <span className="text-headline-sm font-bold text-primary font-mono-data leading-tight">{res.variantId}</span>
                      </div>
                      <div>
                        <div className="font-mono-data text-label-md">Max: <strong>{res.max} kg</strong> · e: <strong>{res.e} g</strong></div>
                        <div className="text-label-sm text-on-surface-variant flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[12px]">info</span> {res.tag}
                        </div>
                      </div>
                    </div>
                    <span className="badge-applicable">EUT</span>
                 </div>
               ))}
             </div>
          </div>
          
          {/* Coverage Map */}
          <div className="card">
             <h3 className="text-label-lg font-bold mb-[--spacing-sm]">Coverage Mapping</h3>
             <div className="flex flex-col gap-2">
               {coverageTable.map((cov, i) => (
                 <div key={i} className="flex items-start gap-[--spacing-sm] text-body-sm">
                    <span className="material-symbols-outlined text-[16px] text-tertiary mt-0.5">subdirectory_arrow_right</span>
                    <div>
                      <div>Variant <strong>{cov.variant}</strong> is covered by EUT <strong>{cov.coveredBy}</strong></div>
                      <div className="text-outline text-[11px] font-mono-data mt-0.5">{cov.rule}</div>
                    </div>
                 </div>
               ))}
             </div>
          </div>
          
          {/* Certificate Generation */}
          <div className="card bg-surface-low/50">
             <div className="flex items-center justify-between mb-[--spacing-xs]">
               <h3 className="text-label-lg font-bold">Generated Certificate Clause</h3>
               <button className="text-outline hover:text-primary transition-colors"><span className="material-symbols-outlined text-[18px]">content_copy</span></button>
             </div>
             <blockquote className="border-l-4 border-primary pl-4 py-1 text-body-sm text-on-surface italic bg-surface-lowest p-[--spacing-sm] rounded-r-lg shadow-sm">
               {generatedClause}
             </blockquote>
          </div>
          
        </div>
      </div>
    </div>
  );
}
