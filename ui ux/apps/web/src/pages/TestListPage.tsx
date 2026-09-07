import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testForms } from '../data/mockData';

type FilterTab = 'all' | 'applicable' | 'exempted';

export default function TestListPage() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const navigate = useNavigate();

  const applicable = testForms.filter((t) => t.applicable);
  const exempted = testForms.filter((t) => !t.applicable);
  const scheduled = testForms.filter((t) => t.scheduledLast);

  const displayed = filter === 'applicable' ? applicable : filter === 'exempted' ? exempted : testForms;

  return (
    <div className="flex flex-col w-full">
      {/* Top Stepper */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-[--spacing-md] mb-[--spacing-xl]">
        <div className="flex items-center gap-[--spacing-xs]">
          {/* Step 1 completed */}
          <div className="flex items-center gap-[--spacing-2xs] bg-success/10 text-success px-[--spacing-md] py-2 rounded-full">
            <span className="material-symbols-outlined text-[16px] icon-filled">check_circle</span>
            <span className="text-label-md">1. Instrument Spec</span>
            <span className="text-label-sm text-outline ml-1">DS-252</span>
          </div>
          {/* Step 2 active */}
          <div className="flex items-center gap-[--spacing-2xs] bg-primary text-on-primary px-[--spacing-md] py-2 rounded-full shadow-[var(--shadow-primary-glow)]">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-on-primary text-primary text-label-sm text-[11px] font-bold">2</span>
            <span className="text-label-md font-semibold">Test Matrix Protocol</span>
            <span className="badge text-[10px] bg-on-primary/20 text-on-primary ml-1">ACTIVE</span>
          </div>
          {/* Step 3 */}
          <div className="flex items-center gap-[--spacing-2xs] px-[--spacing-md] py-2 rounded-full text-on-surface-variant">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-surface-container text-on-surface-variant text-label-sm text-[11px]">3</span>
            <span className="text-label-md">Observations & MPE</span>
          </div>
        </div>
        <div className="flex items-center gap-[--spacing-sm]">
          <div className="flex items-center gap-[--spacing-2xs] px-3 py-1.5 rounded-full bg-surface-low text-on-surface-variant text-label-sm">
            <span className="material-symbols-outlined text-[14px]">tune</span>
            Standard: OIML R-76-1 / IS 9281
          </div>
          <button className="btn-primary text-[13px] py-2">
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export Form Checklist
          </button>
        </div>
      </div>

      {/* Instrument Summary */}
      <div className="card mb-[--spacing-lg]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-[--spacing-md]">
          <div className="flex items-center gap-[--spacing-md]">
            <div className="w-14 h-14 rounded-2xl bg-surface-low flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px] text-on-surface-variant">scale</span>
            </div>
            <div>
              <div className="flex items-center gap-[--spacing-xs]">
                <h2 className="text-headline-md font-bold">Essae-Teraoka DS-252</h2>
                <span className="badge-applicable">Dual-Interval Bench Scale</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-label-sm font-bold">CLASS III</span>
                <span className="text-body-sm text-on-surface-variant">• RRSL Pre-Certified</span>
              </div>
              <p className="text-body-sm text-on-surface-variant mt-1">Verification Matrix determined automatically per Legal Metrology (General) Rules, 2011 & OIML R-76-1:2006.</p>
            </div>
          </div>
          <div className="flex gap-[--spacing-md]">
            {[
              { label: 'Capacity (Max)', value: '15 kg' },
              { label: 'Verification (e)', value: '2 g / 5 g' },
              { label: 'Interval Count (n)', value: '3,000 / 3,000' },
            ].map((m) => (
              <div key={m.label} className="text-center">
                <div className="text-label-sm text-outline">{m.label}</div>
                <div className="text-label-lg font-bold mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Applicability Stats */}
      <div className="card mb-[--spacing-lg]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-[--spacing-md]">
          <div>
            <div className="flex items-center gap-[--spacing-xs] mb-[--spacing-2xs]">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Automated Legal Engine</span>
            </div>
            <h2 className="text-headline-md font-bold">Applicable Tests Protocol</h2>
            <div className="flex items-center gap-[--spacing-xs] mt-[--spacing-xs]">
              <span className="badge-applicable">{applicable.length} Applicable</span>
              <span className="badge-not-applicable">{exempted.length} Not Applicable</span>
              {scheduled.length > 0 && <span className="badge-scheduled">{scheduled.length} Scheduled Last</span>}
            </div>
          </div>
          <div className="flex gap-[--spacing-lg]">
            <div className="text-center">
              <div className="text-label-sm text-outline">Forms to Execute</div>
              <div className="text-metric font-bold text-on-surface">{applicable.length}<span className="text-label-md text-outline font-normal"> / {testForms.length}</span></div>
              <div className="text-label-sm text-success flex items-center gap-1 justify-center"><span className="material-symbols-outlined text-[12px]">check</span> {exempted.length} Forms Auto-Exempted</div>
            </div>
            <div className="text-center">
              <div className="text-label-sm text-outline">Estimated Run Time</div>
              <div className="text-metric font-bold text-on-surface">14.5 <span className="text-label-md text-outline font-normal">hrs</span></div>
              <div className="text-label-sm text-on-surface-variant flex items-center gap-1 justify-center"><span className="material-symbols-outlined text-[12px]">schedule</span> Inc. 8h Damp Heat test</div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-[--spacing-md]">
          <div className="flex items-center justify-between text-label-sm text-outline mb-1">
            <span>Readiness Pipeline: {testForms.length} Statutory Verification Forms</span>
            <span>{Math.round((applicable.length / testForms.length) * 100)}% Active Coverage</span>
          </div>
          <div className="rainbow-bar h-2">
            <div style={{ background: 'var(--color-grad-1)', flex: 3 }} />
            <div style={{ background: 'var(--color-grad-2)', flex: 2 }} />
            <div style={{ background: 'var(--color-grad-3)', flex: 3 }} />
            <div style={{ background: 'var(--color-grad-4)', flex: 2 }} />
            <div style={{ background: 'var(--color-grad-5)', flex: 2 }} />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between mb-[--spacing-md]">
        <div className="flex items-center gap-[--spacing-xs]">
          <h3 className="text-headline-sm font-semibold">Statutory Inspection Forms Catalog</h3>
          <span className="text-label-sm text-outline">OIML R76 Annex A & B</span>
        </div>
        <div className="pill-nav">
          {[
            { id: 'all' as FilterTab, label: `All (${testForms.length})` },
            { id: 'applicable' as FilterTab, label: `Applicable Only (${applicable.length})` },
            { id: 'exempted' as FilterTab, label: `Exempted (${exempted.length})` },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setFilter(tab.id)} className={`pill-nav-item ${filter === tab.id ? 'active' : ''}`}>{tab.label}</button>
          ))}
        </div>
      </div>

      {/* Test Form Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[--spacing-md] mb-[--spacing-2xl]">
        {displayed.map((form) => (
          <div key={form.formId} className={`card relative ${!form.applicable ? 'opacity-60' : ''} ${form.scheduledLast ? 'ring-1 ring-tertiary/30' : ''}`}>
            <div className="flex items-center justify-between mb-[--spacing-xs]">
              <span className="text-label-sm text-on-surface-variant font-mono-data font-bold">FORM {form.formId}</span>
              {form.applicable ? (
                form.scheduledLast ? (
                  <span className="badge-scheduled flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-tertiary" />Scheduled Last</span>
                ) : (
                  <span className="badge-applicable flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" />Applicable</span>
                )
              ) : (
                <span className="badge-not-applicable">Not Applicable</span>
              )}
            </div>
            <h4 className="text-label-lg font-bold mb-0.5">{form.title}</h4>
            <p className="text-label-sm text-outline font-mono-data mb-[--spacing-xs]">{form.clause}</p>
            <p className="text-body-sm text-on-surface-variant mb-[--spacing-sm]">{form.description}</p>
            {form.applicable ? (
              <div className="flex items-center justify-between">
                <span className="text-label-sm text-on-surface-variant">Points: <strong>{form.points}</strong></span>
                <button className="text-label-sm text-primary flex items-center gap-0.5 hover:underline">Parameters <span className="material-symbols-outlined text-[14px]">arrow_forward</span></button>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-label-sm text-outline">
                <span>Rule: {form.reason}</span>
                <span className="material-symbols-outlined text-[14px]">block</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-4 z-30 bg-surface-lowest/90 backdrop-blur-xl p-[--spacing-md] rounded-3xl shadow-[0_12px_32px_-8px_rgba(15,23,42,0.1)] flex items-center justify-between">
        <button className="btn-secondary" onClick={() => navigate('/new/profile')}>
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Profile
        </button>
        <span className="text-body-sm text-on-surface-variant hidden sm:inline">Step 2 of 3: Test Matrix Generated & Validated</span>
        <button className="btn-primary" onClick={() => navigate('/new/observations')}>
          <span>Begin Observations</span>
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
