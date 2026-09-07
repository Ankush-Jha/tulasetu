import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ReportGenerationPage() {
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const navigate = useNavigate();

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto gap-[--spacing-xl]">
      
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 text-success mb-[--spacing-sm]">
          <span className="material-symbols-outlined text-[32px]">task_alt</span>
        </div>
        <h1 className="text-display-lg font-bold tracking-tight text-on-surface">Verification Complete</h1>
        <p className="text-headline-sm text-on-surface-variant mt-2 max-w-2xl mx-auto">
          All 12 applicable tests executed. The instrument conforms to OIML R-76 Class III requirements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-[--spacing-lg]">
        
        {/* Left Side: Summary Card */}
        <div className="md:col-span-5">
          <div className="card h-full flex flex-col">
            <h2 className="text-headline-sm font-semibold mb-[--spacing-md] flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">analytics</span>
              Result Summary
            </h2>
            
            <div className="flex flex-col gap-[--spacing-sm] flex-1">
              <div className="flex justify-between items-center p-[--spacing-sm] bg-surface-low rounded-xl">
                <span className="text-label-sm text-outline">Instrument</span>
                <span className="text-label-md font-semibold">Essae-Teraoka DS-252</span>
              </div>
              <div className="flex justify-between items-center p-[--spacing-sm] bg-surface-low rounded-xl">
                <span className="text-label-sm text-outline">Class</span>
                <span className="badge-applicable">Class III</span>
              </div>
              <div className="flex justify-between items-center p-[--spacing-sm] bg-surface-low rounded-xl">
                <span className="text-label-sm text-outline">Tests Executed</span>
                <span className="text-label-md font-semibold">12 / 12</span>
              </div>
              <div className="flex justify-between items-center p-[--spacing-sm] bg-surface-low rounded-xl">
                <span className="text-label-sm text-outline">Deficiencies Found</span>
                <span className="text-label-md font-semibold text-success">0 (None)</span>
              </div>
            </div>

            <div className="mt-[--spacing-lg] p-[--spacing-md] bg-success/10 border border-success/20 rounded-2xl flex flex-col items-center text-center">
               <span className="text-label-sm text-success uppercase tracking-widest font-bold mb-1">Final Verdict</span>
               <span className="text-display-lg font-black text-success leading-none">PASS</span>
               <span className="text-label-sm text-success mt-2">Ready for Gazette Notification</span>
            </div>
          </div>
        </div>

        {/* Right Side: Generation Options */}
        <div className="md:col-span-7 flex flex-col gap-[--spacing-lg]">
          
          <div className="card">
            <h2 className="text-headline-sm font-semibold mb-[--spacing-sm]">Output Format Specification</h2>
            <p className="text-body-sm text-on-surface-variant mb-[--spacing-md]">
              Select the compliance profile and target document formats required. The engine deterministically renders the evaluation data into standard templates.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[--spacing-sm] mb-[--spacing-lg]">
               {[
                 { id: 'pdf', label: 'PDF Report', sub: 'OIML R-76-2 Format', icon: 'picture_as_pdf', color: 'text-error' },
                 { id: 'docx', label: 'DOCX Draft', sub: 'Editable Watermarked', icon: 'description', color: 'text-primary' },
                 { id: 'json', label: 'JSON DCC', sub: 'Digital Cal. Cert', icon: 'data_object', color: 'text-tertiary' },
               ].map(fmt => (
                 <button
                   key={fmt.id}
                   onClick={() => setSelectedFormat(fmt.id)}
                   className={`flex flex-col items-center justify-center p-[--spacing-md] rounded-2xl border-2 transition-all ${
                     selectedFormat === fmt.id 
                       ? 'border-primary bg-primary/5 shadow-sm' 
                       : 'border-border-subtle bg-surface-lowest hover:border-primary/40'
                   }`}
                 >
                    <span className={`material-symbols-outlined text-[32px] mb-2 ${fmt.color}`}>{fmt.icon}</span>
                    <span className="text-label-md font-semibold">{fmt.label}</span>
                    <span className="text-[10px] text-outline mt-0.5">{fmt.sub}</span>
                 </button>
               ))}
            </div>

            <div className="space-y-[--spacing-md]">
               <div className="flex flex-col gap-[--spacing-2xs]">
                  <label className="text-label-md font-semibold">Regulatory Profile</label>
                  <select className="input-field cursor-pointer font-medium">
                    <option>India Legal Metrology (Gen) Rules, 2011 — Sch 7A</option>
                    <option>OIML R-76 (2006 Edition)</option>
                  </select>
               </div>
               <div className="flex flex-col gap-[--spacing-2xs]">
                  <label className="text-label-md font-semibold">Document Language</label>
                  <select className="input-field cursor-pointer font-medium">
                    <option>English (Primary)</option>
                    <option>Hindi (Bilingual Annexure)</option>
                  </select>
               </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-[--spacing-sm]">
            <button className="btn-secondary flex-1 py-4 text-label-lg" onClick={() => navigate('/dashboard')}>
              Save & Return to Dashboard
            </button>
            <button className="btn-primary flex-1 py-4 text-label-lg group">
              <span className="material-symbols-outlined text-[20px] animate-pulse">generating_tokens</span>
              <span>Generate Output Files</span>
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
}
