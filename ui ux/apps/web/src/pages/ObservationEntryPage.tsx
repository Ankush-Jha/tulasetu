import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testForms, observationData } from '../data/mockData';

export default function ObservationEntryPage() {
  const [activeForm, setActiveForm] = useState('01');
  const navigate = useNavigate();
  const applicableForms = testForms.filter(t => t.applicable);
  const activeFormDetail = applicableForms.find(t => t.formId === activeForm);

  return (
    <div className="flex flex-col w-full min-h-[calc(100vh-10rem)] relative pb-20">
      {/* Top Stepper */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-[--spacing-md] mb-[--spacing-lg]">
        <div className="flex items-center gap-[--spacing-xs] flex-wrap">
          {/* Step 1 completed */}
          <div className="flex items-center gap-[--spacing-2xs] bg-success/10 text-success px-[--spacing-md] py-2 rounded-full cursor-pointer hover:bg-success/20 transition-colors" onClick={() => navigate('/new/profile')}>
            <span className="material-symbols-outlined text-[16px] icon-filled">check_circle</span>
            <span className="text-label-md hidden sm:inline">1. Spec</span>
          </div>
          {/* Step 2 completed */}
          <div className="flex items-center gap-[--spacing-2xs] bg-success/10 text-success px-[--spacing-md] py-2 rounded-full cursor-pointer hover:bg-success/20 transition-colors" onClick={() => navigate('/new/tests')}>
            <span className="material-symbols-outlined text-[16px] icon-filled">check_circle</span>
            <span className="text-label-md hidden sm:inline">2. Matrix</span>
          </div>
          {/* Step 3 active */}
          <div className="flex items-center gap-[--spacing-2xs] bg-primary text-on-primary px-[--spacing-md] py-2 rounded-full shadow-[var(--shadow-primary-glow)]">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-on-primary text-primary text-label-sm text-[11px] font-bold">3</span>
            <span className="text-label-md font-semibold">Observations & Data Entry</span>
            <span className="badge text-[10px] bg-on-primary/20 text-on-primary ml-1">IN PROGRESS</span>
          </div>
        </div>
        
        {/* Environment Bar */}
        <div className="flex items-center gap-[--spacing-sm] bg-surface-lowest p-1.5 rounded-full shadow-sm ring-1 ring-border-subtle shrink-0">
          <div className="flex items-center gap-[--spacing-2xs] px-3 py-1 text-label-sm text-on-surface-variant border-r border-border-subtle">
            <span className="material-symbols-outlined text-[16px]">thermostat</span>
            22.5°C
          </div>
          <div className="flex items-center gap-[--spacing-2xs] px-3 py-1 text-label-sm text-on-surface-variant border-r border-border-subtle">
            <span className="material-symbols-outlined text-[16px]">water_drop</span>
            45% RH
          </div>
          <div className="flex items-center gap-[--spacing-2xs] px-3 py-1 text-label-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">speed</span>
            1012 hPa
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-[--spacing-lg] flex-1">
        
        {/* Left Side: Form Navigation & Formula */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-[--spacing-md]">
          <div className="card sticky top-24 p-[--spacing-md]">
            <h3 className="text-label-lg font-bold mb-[--spacing-sm]">Applicable Forms</h3>
            <div className="flex flex-col gap-[--spacing-2xs]">
              {applicableForms.map(form => (
                <button
                  key={form.formId}
                  onClick={() => setActiveForm(form.formId)}
                  className={`w-full flex flex-col items-start px-3 py-2.5 rounded-xl transition-all ${
                    activeForm === form.formId 
                      ? 'bg-primary text-on-primary shadow-sm' 
                      : 'hover:bg-surface-low text-on-surface'
                  }`}
                >
                  <span className={`text-label-sm font-bold font-mono-data ${activeForm === form.formId ? 'text-on-primary/80' : 'text-primary'}`}>
                    F {form.formId}
                  </span>
                  <span className={`text-label-md text-left leading-tight mt-0.5 ${activeForm === form.formId ? 'font-semibold' : ''}`}>
                    {form.title}
                  </span>
                </button>
              ))}
            </div>
            
            <div className="mt-[--spacing-lg] p-[--spacing-sm] rounded-xl bg-surface-low border border-border-subtle">
              <span className="text-label-sm text-outline flex items-center gap-1 mb-1">
                <span className="material-symbols-outlined text-[14px]">calculate</span> Logic Engine
              </span>
              <p className="text-label-md font-mono-data text-primary">E = I + ½e − ΔL − L</p>
              <p className="text-label-md font-mono-data text-primary">Ec = E − E₀</p>
              <p className="text-body-sm text-on-surface-variant mt-2 leading-snug">
                Values calculated dynamically via @tulasetu/engine Kernel K1.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Data Table */}
        <div className="flex-1 flex flex-col gap-[--spacing-md] min-w-0">
          <div className="flex flex-col gap-2">
            <h2 className="text-headline-md font-bold">{activeFormDetail?.title || 'Form'}</h2>
            <p className="text-body-md text-on-surface-variant font-mono-data text-sm">{activeFormDetail?.clause}</p>
          </div>
          
          <div className="card flex-1 p-0 overflow-hidden flex flex-col">
            <div className="p-[--spacing-md] border-b border-border-subtle bg-surface-low/30 flex items-center justify-between">
               <div className="flex items-center gap-[--spacing-sm]">
                 <span className="text-label-md font-semibold">Test Range: 0 to Max (15 kg)</span>
                 <span className="px-2 py-0.5 rounded text-label-sm bg-primary/10 text-primary">e = 2g / 5g</span>
               </div>
               <button className="btn-secondary py-1.5 px-3">
                 <span className="material-symbols-outlined text-[16px]">add</span> Add Row
               </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-surface-lowest border-b border-border-subtle text-label-sm text-outline">
                    <th className="px-4 py-3 font-medium">Load (L)</th>
                    <th className="px-4 py-3 font-medium">Indication (I)</th>
                    <th className="px-4 py-3 font-medium text-center">Add. Mass (ΔL)</th>
                    <th className="px-4 py-3 font-medium text-center bg-surface-low/50">Zero Error (E₀)</th>
                    <th className="px-4 py-3 font-medium text-center bg-surface-low/50">Error (E)</th>
                    <th className="px-4 py-3 font-medium text-center bg-primary-fixed/20 text-primary">Corrected (Ec)</th>
                    <th className="px-4 py-3 font-medium text-center">MPE</th>
                    <th className="px-4 py-3 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody className="font-mono-data text-label-md">
                  {observationData.map((row) => (
                    <tr key={row.id} className="border-b border-border-subtle hover:bg-surface-low/30 transition-colors">
                      <td className="px-4 py-3">
                        <input className="w-20 bg-transparent border-b border-transparent focus:border-primary outline-none" defaultValue={row.load} />
                        <span className="text-outline text-xs ml-1">kg</span>
                      </td>
                      <td className="px-4 py-3">
                         <input className="w-20 bg-transparent border-b border-transparent focus:border-primary outline-none" defaultValue={row.indication} />
                      </td>
                      <td className="px-4 py-3 text-center">
                         <input className="w-16 bg-transparent border-b border-transparent focus:border-primary outline-none text-center" defaultValue={row.deltaL} />
                      </td>
                      <td className="px-4 py-3 text-center bg-surface-low/30 text-on-surface-variant">{row.e0}</td>
                      <td className="px-4 py-3 text-center bg-surface-low/30 text-on-surface-variant">{row.errorE}</td>
                      <td className="px-4 py-3 text-center bg-primary-fixed/10 font-bold text-primary">{row.correctedEc}</td>
                      <td className="px-4 py-3 text-center text-outline relative group">
                        {row.mpe}
                        {row.rangeBoundary && (
                          <div className="absolute top-1/2 -right-4 -translate-y-1/2 cursor-help">
                            <span className="material-symbols-outlined text-[14px] text-warning">bolt</span>
                            {/* Simple tooltip simulation */}
                            <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-inverse-surface text-inverse-on-surface text-body-sm rounded shadow-lg -left-20 bottom-6">
                              {row.rangeNote}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${row.verdict === 'PASSED' ? 'badge-passed' : 'badge-failed'}`}>
                          {row.verdict}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Empty row for manual entry look */}
                  <tr className="border-b border-border-subtle bg-surface-lowest">
                     <td className="px-4 py-3"><input className="w-20 bg-transparent border-b border-primary outline-none" placeholder="0.000" /></td>
                     <td className="px-4 py-3"><input className="w-20 bg-transparent border-b border-border-subtle focus:border-primary outline-none" placeholder="0.000" /></td>
                     <td className="px-4 py-3 text-center"><input className="w-16 bg-transparent border-b border-border-subtle focus:border-primary outline-none text-center" placeholder="0.000" /></td>
                     <td className="px-4 py-3 text-center text-outline">—</td>
                     <td className="px-4 py-3 text-center text-outline">—</td>
                     <td className="px-4 py-3 text-center text-outline">—</td>
                     <td className="px-4 py-3 text-center text-outline">—</td>
                     <td className="px-4 py-3"><span className="badge badge-draft">PENDING</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* Status Footer */}
            <div className="mt-auto p-[--spacing-md] bg-surface-lowest flex items-center justify-between border-t border-border-subtle">
               <div className="flex items-center gap-[--spacing-md]">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-success">check_circle</span>
                    <span className="text-label-md">7 Passed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-error">cancel</span>
                    <span className="text-label-md">1 Failed</span>
                  </div>
               </div>
               <div className="flex items-center gap-[--spacing-xs]">
                 <span className="text-label-sm text-outline">Form Status:</span>
                 <span className="badge badge-failed">DEFICIENCY FOUND</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-5xl z-30 bg-surface-lowest/90 backdrop-blur-xl p-[--spacing-md] rounded-3xl shadow-[0_12px_32px_-8px_rgba(15,23,42,0.1)] flex items-center justify-between border border-border-subtle">
        <button className="btn-secondary" onClick={() => navigate('/new/tests')}>
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Matrix
        </button>
        <div className="flex items-center gap-[--spacing-xs] px-4">
           <span className="text-label-sm text-on-surface-variant">Progress</span>
           <div className="w-32 h-2 bg-surface-container rounded-full overflow-hidden">
             <div className="h-full bg-primary" style={{ width: '6.6%' }}></div>
           </div>
           <span className="text-label-sm font-bold text-primary">1 / 15 Forms</span>
        </div>
        <button className="btn-primary" onClick={() => navigate('/report/generate')}>
          <span>Complete Verification</span>
          <span className="material-symbols-outlined text-[16px]">task_alt</span>
        </button>
      </div>
    </div>
  );
}
