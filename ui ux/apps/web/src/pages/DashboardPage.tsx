import { dashboardKPIs, annualStats, recentReports, monthlyActivity } from '../data/mockData';

const statusBadgeClass: Record<string, string> = {
  Draft: 'badge-draft',
  'In Review': 'badge-review',
  Approved: 'badge-passed',
  Published: 'badge-published',
  Deficiency: 'badge-failed',
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col w-full gap-[--spacing-lg]">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-[--spacing-xs] mb-[--spacing-2xs]">
          <span className="badge-applicable">OIML R-76-1 / IS 9281</span>
          <span className="text-label-sm text-outline">RRSL Faridabad — Northern HQ</span>
        </div>
        <h1 className="text-headline-lg font-bold tracking-tight">Dashboard</h1>
        <p className="text-body-md text-on-surface-variant">Operational overview for current verification cycle — September 2026</p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[--spacing-md]">
        {dashboardKPIs.map((kpi) => (
          <div key={kpi.label} className="card flex flex-col">
            <div className="flex items-center justify-between mb-[--spacing-sm]">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `color-mix(in srgb, ${kpi.color} 12%, transparent)` }}>
                <span className="material-symbols-outlined text-[20px]" style={{ color: kpi.color }}>{kpi.icon}</span>
              </div>
              <button className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-low text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined text-[16px]">north_east</span>
              </button>
            </div>
            <span className="text-label-md text-slate-muted">{kpi.label}</span>
            <span className="text-metric text-anchor font-bold">{kpi.value}</span>
            <span className="text-label-sm text-outline mt-1">{kpi.subtitle}</span>
          </div>
        ))}
      </div>

      {/* Recent Reports + Annual Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-[--spacing-lg]">
        {/* Recent Reports Table */}
        <div className="xl:col-span-2 card">
          <div className="flex items-center justify-between mb-[--spacing-md]">
            <div className="flex items-center gap-[--spacing-xs]">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">description</span>
              </div>
              <h2 className="text-headline-sm font-semibold">Recent Reports</h2>
            </div>
            <button className="text-label-sm text-primary hover:underline flex items-center gap-1">
              View All <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left text-label-sm text-outline py-2 px-2">Report ID</th>
                  <th className="text-left text-label-sm text-outline py-2 px-2">Instrument</th>
                  <th className="text-left text-label-sm text-outline py-2 px-2">Class</th>
                  <th className="text-left text-label-sm text-outline py-2 px-2">Manufacturer</th>
                  <th className="text-left text-label-sm text-outline py-2 px-2">Status</th>
                  <th className="text-left text-label-sm text-outline py-2 px-2">Verdict</th>
                  <th className="text-left text-label-sm text-outline py-2 px-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.slice(0, 5).map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle/50 hover:bg-surface-low/50 transition-colors">
                    <td className="py-2.5 px-2 text-label-md font-semibold text-primary font-mono-data">{r.id}</td>
                    <td className="py-2.5 px-2 text-body-md">{r.instrument}</td>
                    <td className="py-2.5 px-2 text-label-md font-bold">{r.class}</td>
                    <td className="py-2.5 px-2 text-body-md text-on-surface-variant">{r.manufacturer}</td>
                    <td className="py-2.5 px-2"><span className={`badge ${statusBadgeClass[r.status]}`}>{r.status}</span></td>
                    <td className="py-2.5 px-2">
                      {r.verdict ? (
                        <span className={`badge ${r.verdict === 'PASSED' ? 'badge-passed' : 'badge-failed'}`}>{r.verdict}</span>
                      ) : (
                        <span className="text-body-sm text-outline">— —</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-body-sm text-on-surface-variant">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Annual Summary */}
        <div className="card">
          <div className="flex items-center gap-[--spacing-xs] mb-[--spacing-md]">
            <div className="w-8 h-8 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[18px]">analytics</span>
            </div>
            <h2 className="text-headline-sm font-semibold">Rule 4(9) Annual</h2>
          </div>
          <div className="flex flex-col gap-[--spacing-sm]">
            {[
              { label: 'Models Tested', value: annualStats.modelsTested.toString() },
              { label: 'Testing Fees Collected', value: annualStats.feesCollected },
              { label: 'Avg. Time Per Test', value: `${annualStats.avgTimeDays} days` },
              { label: 'NAWI Share', value: annualStats.nawiShare },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-[--spacing-sm] bg-surface-low rounded-xl">
                <span className="text-label-sm text-outline">{item.label}</span>
                <span className="text-label-md font-semibold text-on-surface">{item.value}</span>
              </div>
            ))}
          </div>
          <button className="btn-secondary w-full mt-[--spacing-md]">
            <span className="material-symbols-outlined text-[16px]">download</span>
            Download Annual Report
          </button>
        </div>
      </div>

      {/* Monthly Activity Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-[--spacing-md]">
          <div className="flex items-center gap-[--spacing-xs]">
            <div className="w-8 h-8 rounded-full bg-[var(--color-grad-3)]/10 flex items-center justify-center text-[var(--color-grad-3)]">
              <span className="material-symbols-outlined text-[18px]">bar_chart</span>
            </div>
            <h2 className="text-headline-sm font-semibold">Test Activity by Month</h2>
          </div>
          <div className="flex items-center gap-[--spacing-md]">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-success" /><span className="text-label-sm text-outline">Passed</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-error" /><span className="text-label-sm text-outline">Failed</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-warning" /><span className="text-label-sm text-outline">In Review</span></div>
          </div>
        </div>
        <div className="flex items-end gap-[--spacing-md] h-48">
          {monthlyActivity.map((m) => {
            const total = m.passed + m.failed + m.review;
            const maxVal = 40;
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col gap-0.5 items-stretch" style={{ height: `${(total / maxVal) * 100}%` }}>
                  <div className="bg-success rounded-t-md flex-grow" style={{ flex: m.passed }} />
                  <div className="bg-error" style={{ flex: m.failed }} />
                  <div className="bg-warning rounded-b-md" style={{ flex: m.review }} />
                </div>
                <span className="text-label-sm text-outline">{m.month}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
