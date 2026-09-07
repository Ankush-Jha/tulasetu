import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rrslLabs } from '../data/mockData';

const roles = [
  { id: 'MA', label: 'MA', title: 'Metrological Asst.', desc: 'Testing & Entry' },
  { id: 'REVIEWER', label: 'AD / DD', title: 'Reviewer', desc: 'Tech Verification' },
  { id: 'DIRECTOR', label: 'Director', title: 'Gazette Authority', desc: 'Legal Approval' },
];

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState('MA');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-[--spacing-outer]">
      <main className="w-full max-w-lg bg-surface-lowest rounded-[32px] shadow-[var(--shadow-stage)] p-[--spacing-2xl] relative">
        {/* Ambient gradient glows */}
        <div className="absolute -top-12 -left-12 w-64 h-64 rounded-full bg-gradient-to-br from-[var(--color-tertiary-fixed-dim)]/20 via-[var(--color-primary-fixed)]/20 to-transparent blur-3xl pointer-events-none -z-10" />
        <div className="absolute -bottom-16 -right-12 w-72 h-72 rounded-full bg-gradient-to-tr from-[var(--color-primary-container)]/15 via-[var(--color-tertiary-container)]/10 to-transparent blur-3xl pointer-events-none -z-10" />

        <div className="flex flex-col w-full">
          {/* Header */}
          <div className="w-full flex flex-col items-center text-center mb-[--spacing-xl]">
            <div className="flex items-center justify-center mb-[--spacing-sm]">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary text-[24px]">balance</span>
              </div>
              <span className="ml-2 text-headline-sm font-bold tracking-tight">TulaSetu</span>
            </div>
            <div className="inline-flex items-center gap-[--spacing-xs] px-3 py-1 rounded-full bg-surface-low text-on-surface-variant text-label-sm mb-[--spacing-md]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-tertiary-container" />
              <span>DCA / RRSL Legal Metrology • Test Bench to Gazette</span>
            </div>
            <h1 className="text-headline-lg tracking-tight">Sign In to Metrology Portal</h1>
            <p className="text-body-md text-on-surface-variant mt-1 flex items-center justify-center gap-2">
              <span>विधिक मापविज्ञान पोर्टल में प्रवेश करें</span>
              <span className="text-outline-variant">•</span>
              <span className="text-label-sm px-2 py-0.5 rounded-full bg-surface-container text-tertiary">v4.8 e-Governance</span>
            </p>
          </div>

          {/* Role Selection */}
          <div className="w-full mb-[--spacing-xl]">
            <div className="flex items-center justify-between mb-[--spacing-xs] px-1">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Select Officer Role</span>
              <span className="text-label-sm text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">verified_user</span> Role Verified
              </span>
            </div>
            <div className="grid grid-cols-3 gap-[--spacing-sm] p-1.5 bg-surface-low rounded-2xl">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRole(role.id)}
                  className={`relative flex flex-col items-start p-[--spacing-sm] rounded-xl text-left transition-all duration-200 ${
                    selectedRole === role.id
                      ? 'bg-surface-lowest shadow-sm'
                      : 'bg-transparent hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-label-lg">{role.label}</span>
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        selectedRole === role.id ? 'text-primary icon-filled' : 'text-outline-variant'
                      }`}
                    >
                      {selectedRole === role.id ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>
                  <span className="text-label-sm text-on-surface-variant line-clamp-1">{role.title}</span>
                  <span className="text-body-sm text-outline text-[10px] mt-0.5">{role.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form className="w-full space-y-[--spacing-lg]" onSubmit={handleSubmit}>
            {/* RRSL */}
            <div className="space-y-1.5">
              <label className="text-label-md flex items-center justify-between">
                <span>Verification Jurisdiction / RRSL Node</span>
                <span className="text-label-sm text-tertiary">Active Node</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant">
                  <span className="material-symbols-outlined text-[20px]">domain</span>
                </div>
                <select className="input-field pl-11 pr-10 appearance-none cursor-pointer">
                  {rrslLabs.map((lab) => (
                    <option key={lab}>{lab}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-on-surface-variant">
                  <span className="material-symbols-outlined text-[20px]">expand_more</span>
                </div>
              </div>
            </div>

            {/* Officer ID */}
            <div className="space-y-1.5">
              <label className="text-label-md flex items-center justify-between">
                <span>Government Officer ID or Email</span>
                <span className="text-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" /> Single Sign-On
                </span>
              </label>
              <div className="relative flex items-center">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant">
                  <span className="material-symbols-outlined text-[20px]">badge</span>
                </div>
                <input
                  className="input-field pl-11 pr-28"
                  type="text"
                  placeholder="officer.id@gov.in"
                  defaultValue="esther.howard@nic.in"
                />
                <div className="absolute right-2.5 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-surface-highest text-primary text-label-sm">NIC.IN</span>
                  <span className="material-symbols-outlined text-primary text-[18px] icon-filled">check_circle</span>
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-label-md flex items-center gap-1.5">
                  <span>Cryptographic Authorization Key</span>
                  <span className="material-symbols-outlined text-[15px] text-tertiary">vpn_key</span>
                </label>
                <a className="text-label-sm text-primary hover:underline" href="#">Forgot Key?</a>
              </div>
              <div className="relative flex items-center">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant">
                  <span className="material-symbols-outlined text-[20px]">password</span>
                </div>
                <input
                  className="input-field pl-11 pr-11 tracking-wider"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter e-Token Secret"
                  defaultValue="••••••••••••"
                />
                <button
                  type="button"
                  className="absolute right-3 text-on-surface-variant hover:text-on-surface p-1"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Remember + TLS */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-primary cursor-pointer" />
                <span className="text-body-sm">Cache verified DSC token</span>
              </label>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-tertiary text-label-sm">
                <span className="material-symbols-outlined text-[13px]">lock</span> TLS 1.3 Active
              </span>
            </div>

            {/* Submit */}
            <button type="submit" className="btn-primary w-full py-3.5 shadow-md group">
              <span>Authorize & Enter Workspace</span>
              <span className="material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
            </button>
          </form>

          {/* Footer */}
          <div className="w-full mt-[--spacing-2xl] pt-[--spacing-lg] flex flex-col items-center">
            {/* Rainbow bar */}
            <div className="rainbow-bar w-full mb-[--spacing-md]">
              <div style={{ background: 'var(--color-grad-1)' }} />
              <div style={{ background: 'var(--color-grad-2)' }} />
              <div style={{ background: 'var(--color-grad-3)' }} />
              <div style={{ background: 'var(--color-grad-4)' }} />
              <div style={{ background: 'var(--color-grad-5)' }} />
            </div>

            {/* Trust badges */}
            <div className="w-full grid grid-cols-3 gap-[--spacing-xs] text-center text-on-surface-variant text-label-sm">
              {[
                { icon: 'verified', label: 'ISO/IEC 17025', sub: 'Standard Accredited', color: 'text-tertiary' },
                { icon: 'cloud_done', label: 'NIC Cloud', sub: 'Tier-4 Metrology Pod', color: 'text-primary' },
                { icon: 'token', label: 'SHA-256 Valid', sub: 'Hardware Sealed', color: 'text-[var(--color-grad-5)]' },
              ].map((b) => (
                <div key={b.label} className="flex flex-col items-center p-2 rounded-xl bg-surface-low">
                  <span className={`material-symbols-outlined text-[16px] ${b.color} mb-0.5`}>{b.icon}</span>
                  <span className="text-label-sm text-on-surface">{b.label}</span>
                  <span className="text-[10px] text-outline">{b.sub}</span>
                </div>
              ))}
            </div>
            <div className="mt-[--spacing-md] text-center">
              <p className="text-body-sm text-outline">
                Authorized personnel only • DCA National Portal for Calibration & Pattern Approvals
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
