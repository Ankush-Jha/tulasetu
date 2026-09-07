import { useState } from 'react';
import { recentReports } from '../data/mockData';

const statusBadgeClass: Record<string, string> = {
  Draft: 'badge-draft',
  'In Review': 'badge-review',
  Approved: 'badge-passed',
  Published: 'badge-published',
  Deficiency: 'badge-failed',
};

export default function ReportsRepositoryPage() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <div className="flex flex-col w-full gap-[--spacing-lg] h-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-[--spacing-md]">
        <div>
          <h1 className="text-headline-lg font-bold tracking-tight">Reports Repository</h1>
          <p className="text-body-md text-on-surface-variant max-w-2xl mt-1">
            Immutable audit ledger of all type-evaluation reports. ISO/IEC 17025 compliant log.
          </p>
        </div>
        <button className="btn-primary">
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Verification
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-[--spacing-lg] flex-1">
        
        {/* Left Side: Filter sidebar (collapsible on mobile) */}
        <div className="hidden xl:flex flex-col gap-[--spacing-md] xl:col-span-1">
           <div className="card h-full">
              <h2 className="text-label-lg font-bold mb-[--spacing-md]">Filter Ledger</h2>
              
              <div className="flex flex-col gap-[--spacing-lg]">
                {/* Search */}
                <div>
                   <label className="text-label-sm text-outline mb-1 block">Search Query</label>
                   <div className="relative">
                     <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">search</span>
                     <input type="text" className="input-field pl-9" placeholder="TR ID, Manufacturer..." />
                   </div>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="text-label-sm text-outline mb-2 block">Document Status</label>
                  <div className="flex flex-wrap gap-2">
                    {['Published', 'Approved', 'In Review', 'Deficiency', 'Draft'].map(status => (
                      <button key={status} className={`px-3 py-1.5 rounded-full text-label-sm transition-colors border ${
                        status === 'Published' 
                          ? 'bg-primary/10 text-primary border-primary/20 font-semibold' 
                          : 'bg-surface-lowest text-on-surface-variant border-border-subtle hover:bg-surface-low'
                      }`}>
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Class Filter */}
                <div>
                  <label className="text-label-sm text-outline mb-2 block">Accuracy Class</label>
                  <div className="flex flex-wrap gap-2">
                    {['Class I', 'Class II', 'Class III', 'Class IIII'].map(c => (
                      <button key={c} className="px-3 py-1.5 rounded-full text-label-sm transition-colors border bg-surface-lowest text-on-surface-variant border-border-subtle hover:bg-surface-low">
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* RRSL Lab Filter */}
                <div>
                  <label className="text-label-sm text-outline mb-2 block">Issuing Laboratory</label>
                  <select className="input-field cursor-pointer">
                    <option>All Laboratories</option>
                    <option>RRSL Faridabad</option>
                    <option>RRSL Bengaluru</option>
                    <option>RRSL Ahmedabad</option>
                  </select>
                </div>
              </div>
           </div>
        </div>

        {/* Right Side: Data Table */}
        <div className="xl:col-span-3 flex flex-col gap-[--spacing-md]">
          <div className="card flex-1 p-0 overflow-hidden flex flex-col relative">
            <div className="overflow-x-auto h-full max-h-[800px]">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-surface-lowest z-10 shadow-[0_1px_0_var(--color-border-subtle)]">
                  <tr className="text-label-sm text-outline">
                    <th className="px-4 py-3 font-medium w-10"></th>
                    <th className="px-4 py-3 font-medium">Report ID</th>
                    <th className="px-4 py-3 font-medium">Instrument</th>
                    <th className="px-4 py-3 font-medium">Class</th>
                    <th className="px-4 py-3 font-medium">Manufacturer</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="text-label-md">
                  {recentReports.map((r) => (
                    <React.Fragment key={r.id}>
                      <tr 
                        className={`border-b border-border-subtle hover:bg-surface-low/30 transition-colors cursor-pointer ${expandedRow === r.id ? 'bg-surface-low/50' : ''}`}
                        onClick={() => toggleRow(r.id)}
                      >
                        <td className="px-4 py-3 text-on-surface-variant">
                          <span className="material-symbols-outlined text-[20px] transition-transform duration-200" style={{ transform: expandedRow === r.id ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                            chevron_right
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-primary font-mono-data">{r.id}</td>
                        <td className="px-4 py-3">{r.instrument}</td>
                        <td className="px-4 py-3 font-bold">{r.class}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{r.manufacturer}</td>
                        <td className="px-4 py-3">
                          <span className={`badge ${statusBadgeClass[r.status]}`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                             <button className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-outline transition-colors" title="Download PDF" onClick={(e) => e.stopPropagation()}>
                               <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                             </button>
                             <button className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-outline transition-colors" title="View Detail" onClick={(e) => e.stopPropagation()}>
                               <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                             </button>
                          </div>
                        </td>
                      </tr>
                      {expandedRow === r.id && (
                        <tr className="bg-surface-low/50 border-b border-border-subtle">
                           <td colSpan={7} className="p-0">
                              <div className="p-[--spacing-lg] border-l-4 border-primary">
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-[--spacing-lg]">
                                    
                                    {/* Detail Panel 1 */}
                                    <div className="flex flex-col gap-[--spacing-xs]">
                                      <h4 className="text-label-sm font-bold text-outline uppercase tracking-wider mb-1">Metadata</h4>
                                      <div className="flex justify-between items-center bg-surface-lowest p-2 rounded-lg shadow-sm">
                                        <span className="text-label-sm text-on-surface-variant">Date</span>
                                        <span className="text-label-md font-semibold">{r.date}</span>
                                      </div>
                                      <div className="flex justify-between items-center bg-surface-lowest p-2 rounded-lg shadow-sm">
                                        <span className="text-label-sm text-on-surface-variant">Lab</span>
                                        <span className="text-label-md font-semibold">{r.lab}</span>
                                      </div>
                                      {r.certificateMark && (
                                        <div className="flex justify-between items-center bg-primary/5 border border-primary/20 p-2 rounded-lg">
                                          <span className="text-label-sm text-primary font-medium">Certificate</span>
                                          <span className="text-label-md font-bold font-mono-data text-primary">{r.certificateMark}</span>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Detail Panel 2 */}
                                    <div className="flex flex-col gap-[--spacing-xs]">
                                      <h4 className="text-label-sm font-bold text-outline uppercase tracking-wider mb-1">Technical Spec</h4>
                                      <div className="flex justify-between items-center bg-surface-lowest p-2 rounded-lg shadow-sm">
                                        <span className="text-label-sm text-on-surface-variant">Verdict</span>
                                        <span className={`badge ${r.verdict === 'PASSED' ? 'badge-passed' : r.verdict === 'FAILED' ? 'badge-failed' : 'bg-surface-container'}`}>{r.verdict || 'PENDING'}</span>
                                      </div>
                                      {r.loadCell && (
                                        <div className="flex justify-between items-center bg-surface-lowest p-2 rounded-lg shadow-sm">
                                          <span className="text-label-sm text-on-surface-variant">Load Cell</span>
                                          <span className="text-label-sm">{r.loadCell}</span>
                                        </div>
                                      )}
                                      {r.familyCoverage && (
                                        <div className="flex items-center gap-1.5 bg-surface-lowest p-2 rounded-lg shadow-sm text-label-sm text-tertiary">
                                          <span className="material-symbols-outlined text-[14px]">account_tree</span>
                                          {r.familyCoverage}
                                        </div>
                                      )}
                                    </div>

                                    {/* Detail Panel 3 - Audit Trail */}
                                    <div className="flex flex-col gap-[--spacing-xs]">
                                      <h4 className="text-label-sm font-bold text-outline uppercase tracking-wider mb-1">Audit Trail</h4>
                                      {r.auditTrail ? (
                                        <div className="flex flex-col gap-2 relative before:absolute before:inset-y-2 before:left-[7px] before:w-px before:bg-border-subtle">
                                          {r.auditTrail.map((log, idx) => (
                                            <div key={idx} className="flex items-start gap-2 relative z-10">
                                              <div className="w-4 h-4 rounded-full bg-surface-highest border-2 border-surface-lowest mt-0.5 flex-shrink-0" />
                                              <span className="text-[11px] leading-tight text-on-surface-variant">{log}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-label-sm text-outline italic">No audit events logged.</div>
                                      )}
                                    </div>

                                 </div>
                              </div>
                           </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Footer */}
            <div className="p-3 bg-surface-lowest border-t border-border-subtle flex items-center justify-between text-label-sm text-outline">
              <span>Showing 1 to 8 of 142 entries</span>
              <div className="flex items-center gap-1">
                <button className="w-8 h-8 rounded-lg hover:bg-surface-low flex items-center justify-center transition-colors disabled:opacity-50" disabled>
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <button className="w-8 h-8 rounded-lg bg-surface-low text-on-surface font-medium flex items-center justify-center">1</button>
                <button className="w-8 h-8 rounded-lg hover:bg-surface-low flex items-center justify-center transition-colors">2</button>
                <button className="w-8 h-8 rounded-lg hover:bg-surface-low flex items-center justify-center transition-colors">3</button>
                <button className="w-8 h-8 rounded-lg hover:bg-surface-low flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React from 'react'; // added to satisfy React.Fragment
