import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const classes = [
  { id: 'I', label: 'Class I', sub: 'Special (Fine Lab)' },
  { id: 'II', label: 'Class II', sub: 'High Precision' },
  { id: 'III', label: 'Class III', sub: 'Medium / Industrial' },
  { id: 'IIII', label: 'Class IIII / IV', sub: 'Ordinary' },
];

const features = [
  { icon: 'electrical_services', label: 'Electronic / Digital', active: true },
  { icon: 'battery_charging_full', label: 'Vehicle DC Powered', active: false },
  { icon: 'monitor_weight', label: 'Has Tare Device', active: true },
  { icon: 'storefront', label: 'Direct Sales Public', active: false },
  { icon: 'screen_rotation_alt', label: 'Tiltable Instrument', active: true },
  { icon: 'print', label: 'Print & Data Storage', active: true },
];

export default function InstrumentProfilePage() {
  const [selectedClass, setSelectedClass] = useState('III');
  const [multiInterval, setMultiInterval] = useState(true);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col w-full">
      {/* Top Stepper Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-[--spacing-md] mb-[--spacing-xl]">
        <div>
          <div className="flex items-center gap-[--spacing-xs] mb-[--spacing-2xs]">
            <span className="badge-applicable">OIML R-76-1 / IS 9281</span>
            <span className="text-label-sm text-outline">Application ID: APP/RRSL-FBD/2026/0942</span>
          </div>
          <h1 className="text-headline-lg font-bold tracking-tight">New Verification & Pattern Approval</h1>
          <p className="text-body-md text-on-surface-variant">
            Step 1 of 3: Establish metrological specifications, accuracy class thresholds, and load cell compliance.
          </p>
        </div>
        {/* Stepper */}
        <div className="flex items-center gap-[--spacing-xs] bg-surface-low/80 p-1.5 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] self-start md:self-auto">
          <div className="flex items-center gap-[--spacing-2xs] bg-primary text-on-primary px-[--spacing-md] py-2 rounded-full shadow-[var(--shadow-primary-glow)]">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-on-primary text-primary text-label-sm text-[11px] font-bold">1</span>
            <span className="text-label-md font-semibold">Instrument Profile</span>
          </div>
          <div className="flex items-center gap-[--spacing-2xs] px-[--spacing-md] py-2 rounded-full text-on-surface-variant">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-surface-container text-on-surface-variant text-label-sm text-[11px]">2</span>
            <span className="text-label-md">Test List Gen</span>
          </div>
          <div className="flex items-center gap-[--spacing-2xs] px-[--spacing-md] py-2 rounded-full text-on-surface-variant">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-surface-container text-on-surface-variant text-label-sm text-[11px]">3</span>
            <span className="text-label-md">Observations & MPE</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-[--spacing-lg]">
        {/* Left 8 columns */}
        <div className="xl:col-span-8 flex flex-col gap-[--spacing-lg]">
          {/* Section 01: General Information */}
          <div className="card">
            <div className="flex items-center justify-between mb-[--spacing-md]">
              <div className="flex items-center gap-[--spacing-xs]">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[18px]">badge</span>
                </div>
                <div>
                  <h2 className="text-headline-sm font-semibold">Section 01: General Information</h2>
                  <p className="text-label-sm text-on-surface-variant">Manufacturer submission and official ledger nomenclature</p>
                </div>
              </div>
              <span className="px-[--spacing-xs] py-0.5 rounded-full bg-surface-low text-label-sm text-on-surface-variant">Mandatory</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[--spacing-md]">
              <div className="flex flex-col gap-[--spacing-2xs]">
                <label className="text-label-md font-semibold">Manufacturer Name</label>
                <div className="flex items-center gap-[--spacing-xs] bg-surface-low px-[--spacing-md] py-2.5 rounded-2xl">
                  <span className="material-symbols-outlined text-outline text-[18px]">factory</span>
                  <input className="bg-transparent border-none outline-none text-body-md font-medium flex-1" defaultValue="Essae-Teraoka Ltd." />
                </div>
              </div>
              <div className="flex flex-col gap-[--spacing-2xs]">
                <label className="text-label-md font-semibold">Model Identification</label>
                <div className="flex items-center gap-[--spacing-xs] bg-surface-low px-[--spacing-md] py-2.5 rounded-2xl">
                  <span className="material-symbols-outlined text-outline text-[18px]">precision_manufacturing</span>
                  <input className="bg-transparent border-none outline-none text-body-md font-medium flex-1" defaultValue="DS-215 Platform Heavy Duty" />
                </div>
              </div>
              <div className="flex flex-col gap-[--spacing-2xs]">
                <label className="text-label-md font-semibold">Instrument Type</label>
                <div className="flex items-center justify-between bg-surface-low px-[--spacing-md] py-2.5 rounded-2xl cursor-pointer">
                  <span className="text-body-md font-medium">Non-Automatic Platform Scale (NAWI)</span>
                  <span className="material-symbols-outlined text-outline text-[18px]">arrow_drop_down</span>
                </div>
              </div>
              <div className="flex flex-col gap-[--spacing-2xs]">
                <label className="text-label-md font-semibold">Indicating Device</label>
                <div className="flex items-center justify-between bg-surface-low px-[--spacing-md] py-2.5 rounded-2xl cursor-pointer">
                  <span className="text-body-md font-medium">Digital LED Display (7-Segment Red)</span>
                  <span className="material-symbols-outlined text-outline text-[18px]">tune</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 02: Metrological Characteristics */}
          <div className="card">
            <div className="flex items-center justify-between mb-[--spacing-md]">
              <div className="flex items-center gap-[--spacing-xs]">
                <div className="w-8 h-8 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary">
                  <span className="material-symbols-outlined text-[18px]">balance</span>
                </div>
                <div>
                  <h2 className="text-headline-sm font-semibold">Section 02: Metrological Characteristics</h2>
                  <p className="text-label-sm text-on-surface-variant">Accuracy classification, maximum capacity, and scale divisions</p>
                </div>
              </div>
              <span className="text-label-sm font-semibold text-primary">Class III Rules Applied</span>
            </div>

            {/* Accuracy Class Selector */}
            <div className="mb-[--spacing-lg]">
              <label className="block text-label-md font-semibold mb-[--spacing-2xs]">Accuracy Class Classification (IS 9281 Clause 3.2)</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-[--spacing-xs]">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedClass(c.id)}
                    className={`p-[--spacing-sm] rounded-2xl text-center transition-all ${
                      selectedClass === c.id
                        ? 'bg-primary text-on-primary shadow-[var(--shadow-primary-glow)] ring-2 ring-primary/20'
                        : 'bg-surface-low text-on-surface-variant cursor-pointer hover:bg-surface-container'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-label-lg font-bold">{c.label}</span>
                      {selectedClass === c.id && <span className="material-symbols-outlined text-[14px]">check_circle</span>}
                    </div>
                    <div className={`text-label-sm text-[10px] ${selectedClass === c.id ? 'text-on-primary-container' : 'opacity-80'}`}>{c.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Metric Divisions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-[--spacing-sm] mb-[--spacing-md]">
              {[
                { label: 'Max Capacity', value: '15', unit: 'kg', sub: 'Upper test limit' },
                { label: 'Min Capacity', value: '100', unit: 'g', sub: '20 × e minimum' },
                { label: 'Scale Interval (e)', value: '5', unit: 'g', sub: 'Verification value', highlight: true },
                { label: 'Actual Interval (d)', value: '5', unit: 'g', sub: 'e = d condition met' },
              ].map((m) => (
                <div key={m.label} className="bg-surface-low/70 p-[--spacing-md] rounded-2xl">
                  <span className="text-label-sm text-outline block">{m.label}</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-metric font-bold ${m.highlight ? 'text-primary' : 'text-on-surface'}`}>{m.value}</span>
                    <span className="text-label-md text-on-surface-variant">{m.unit}</span>
                  </div>
                  <span className="text-label-sm text-[10px] text-outline">{m.sub}</span>
                </div>
              ))}
            </div>

            {/* N divisions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[--spacing-xs] p-[--spacing-md] rounded-2xl bg-surface-low mb-[--spacing-lg]">
              <div className="flex items-center gap-[--spacing-xs]">
                <div className="w-6 h-6 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center font-bold text-[11px]">n</div>
                <div>
                  <span className="text-label-md font-semibold">n = Max / e = 3,000 divisions</span>
                  <p className="text-body-sm text-on-surface-variant">Valid range for Class III (500 ≤ n ≤ 10,000 divisions)</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-[--spacing-xs] py-1 rounded-full bg-secondary-container text-on-surface text-label-sm font-semibold">
                <span className="w-2 h-2 rounded-full bg-[var(--color-grad-1)]" />
                Within Permissible Bounds
              </span>
            </div>

            {/* Multi-interval */}
            <div className="bg-surface-low/50 p-[--spacing-md] rounded-2xl">
              <div className="flex items-center justify-between mb-[--spacing-sm]">
                <div className="flex items-center gap-[--spacing-xs]">
                  <button
                    type="button"
                    onClick={() => setMultiInterval(!multiInterval)}
                    className={`w-5 h-5 rounded flex items-center justify-center ${multiInterval ? 'bg-primary text-on-primary' : 'bg-surface-container'}`}
                  >
                    {multiInterval && <span className="material-symbols-outlined text-[14px]">done</span>}
                  </button>
                  <span className="text-label-lg font-semibold">Multi-Interval Instrument (Sub-ranges Configured)</span>
                </div>
                {multiInterval && <span className="px-[--spacing-xs] py-0.5 rounded-full bg-primary/10 text-primary text-label-sm">Active Configuration</span>}
              </div>
              {multiInterval && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-[--spacing-sm]">
                  {[
                    { range: 'Range 1 (Partial)', max: 'Max₁ = 6.000 kg', div: 'e₁ = 2 g (n = 3,000)' },
                    { range: 'Range 2 (Full)', max: 'Max₂ = 15.000 kg', div: 'e₂ = 5 g (n = 3,000)' },
                  ].map((r) => (
                    <div key={r.range} className="p-[--spacing-sm] bg-surface-lowest rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex items-center justify-between">
                      <div>
                        <span className="text-label-sm text-outline block">{r.range}</span>
                        <span className="text-label-lg font-semibold text-on-surface">{r.max}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-label-sm text-outline block">Divisions</span>
                        <span className="text-label-md font-semibold text-primary">{r.div}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 03: Functional Features */}
          <div className="card">
            <div className="flex items-center justify-between mb-[--spacing-md]">
              <div className="flex items-center gap-[--spacing-xs]">
                <div className="w-8 h-8 rounded-full bg-tertiary-container/10 flex items-center justify-center text-tertiary-container">
                  <span className="material-symbols-outlined text-[18px]">settings_input_component</span>
                </div>
                <div>
                  <h2 className="text-headline-sm font-semibold">Section 03: Functional Features & Peripherals</h2>
                  <p className="text-label-sm text-on-surface-variant">Subsystem verification triggers and auxiliary device attributes</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-[--spacing-sm]">
              {features.map((f) => (
                <div key={f.label} className={`toggle-pill ${f.active ? 'active' : 'inactive'}`}>
                  <div className="flex items-center gap-[--spacing-2xs]">
                    <span className={`material-symbols-outlined text-[18px] ${f.active ? 'text-primary' : 'text-outline'}`}>{f.icon}</span>
                    <span className={`text-label-md ${f.active ? 'font-medium text-on-surface' : 'text-on-surface-variant'}`}>{f.label}</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full ${f.active ? 'bg-primary flex items-center justify-center text-on-primary' : 'bg-surface-container'}`}>
                    {f.active && <span className="material-symbols-outlined text-[12px]">check</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 4 columns */}
        <div className="xl:col-span-4 flex flex-col gap-[--spacing-lg]">
          {/* Load Cell Compatibility */}
          <div className="card">
            <div className="flex items-center justify-between mb-[--spacing-md]">
              <div className="flex items-center gap-[--spacing-xs]">
                <div className="w-8 h-8 rounded-full bg-primary-container/10 flex items-center justify-center text-primary-container">
                  <span className="material-symbols-outlined text-[18px]">speed</span>
                </div>
                <h2 className="text-headline-sm font-semibold">Load Cell Compatibility</h2>
              </div>
              <span className="text-label-sm font-semibold text-tertiary">OIML R-60</span>
            </div>
            <div className="flex flex-col gap-[--spacing-sm] bg-surface-low p-[--spacing-md] rounded-2xl mb-[--spacing-md]">
              {[
                { label: 'Transducer OEM', value: 'Zemic Europe B.V.' },
                { label: 'Model Number', value: 'L6E3-C3-50kg' },
                { label: 'R-60 Certificate', value: 'R60/2000-NL1-12.04', highlight: true },
                { label: 'Emax Capacity', value: '50.0 kg' },
                { label: 'Fraction Pi (π)', value: '0.7 (Standard NAWI)' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-label-sm text-outline">{item.label}</span>
                  <span className={`text-label-md font-semibold ${item.highlight ? 'text-primary' : 'text-on-surface'}`}>{item.value}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-[--spacing-xs] p-[--spacing-xs] bg-surface-highest/40 rounded-xl">
              <span className="material-symbols-outlined text-tertiary text-[18px]">verified</span>
              <span className="text-body-sm">Welmec 2.4 Modular Compatibility: <strong>Pass (100%)</strong></span>
            </div>
          </div>

          {/* Legal Software ID */}
          <div className="card">
            <div className="flex items-center justify-between mb-[--spacing-sm]">
              <div className="flex items-center gap-[--spacing-xs]">
                <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[18px]">code_blocks</span>
                </div>
                <h2 className="text-headline-sm font-semibold">Legal Software ID</h2>
              </div>
              <span className="badge-passed flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">lock</span> Sealed
              </span>
            </div>
            <div className="flex flex-col gap-[--spacing-2xs] mb-[--spacing-sm]">
              <span className="text-label-sm text-outline">Firmware Build Identifier</span>
              <div className="bg-surface-low px-[--spacing-md] py-2 rounded-xl text-label-md font-bold">
                v2.4.1-LEG_IND_2026
              </div>
            </div>
            <div className="flex flex-col gap-[--spacing-2xs]">
              <span className="text-label-sm text-outline">Cryptographic SHA-256 Checksum</span>
              <div className="bg-surface-low p-[--spacing-xs] rounded-xl text-on-surface-variant font-mono-data text-[11px] break-all">
                e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
              </div>
            </div>
          </div>

          {/* Photographic Proof */}
          <div className="card">
            <div className="flex items-center justify-between mb-[--spacing-md]">
              <div className="flex items-center gap-[--spacing-xs]">
                <div className="w-8 h-8 rounded-full bg-tertiary-fixed/30 flex items-center justify-center text-tertiary">
                  <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                </div>
                <h2 className="text-headline-sm font-semibold">Photographic Proof</h2>
              </div>
              <span className="text-label-sm text-outline">2/2 Attached</span>
            </div>
            <div className="grid grid-cols-2 gap-[--spacing-sm]">
              {[
                { label: 'Complete Unit', fig: 'Fig 1.1' },
                { label: 'Lead Sealing Wire', fig: 'Fig 1.2' },
              ].map((photo) => (
                <div key={photo.fig} className="flex flex-col gap-[--spacing-2xs]">
                  <div className="relative w-full h-28 rounded-2xl overflow-hidden shadow-sm bg-surface-low group">
                    <div className="w-full h-full bg-gradient-to-br from-surface-container to-surface-high flex items-center justify-center">
                      <span className="material-symbols-outlined text-outline text-[32px]">image</span>
                    </div>
                    <div className="absolute bottom-1 right-1 bg-anchor/70 text-on-primary text-[10px] px-1.5 py-0.5 rounded-md font-medium backdrop-blur-sm">
                      {photo.fig}
                    </div>
                  </div>
                  <span className="text-label-sm font-semibold">{photo.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-4 z-30 mt-[--spacing-2xl] bg-surface-lowest/90 backdrop-blur-xl p-[--spacing-md] rounded-3xl shadow-[0_12px_32px_-8px_rgba(15,23,42,0.1)] flex items-center justify-between">
        <div className="flex items-center gap-[--spacing-xs] text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[20px]">verified_user</span>
          <span className="text-body-sm hidden sm:inline">
            Complies with General Metrology Rules (Draft Ver: <strong>REV-04</strong>)
          </span>
        </div>
        <div className="flex items-center gap-[--spacing-sm]">
          <button className="btn-secondary" type="button">Save Draft</button>
          <button className="btn-primary" type="button" onClick={() => navigate('/new/tests')}>
            <span>Continue to Test List</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
