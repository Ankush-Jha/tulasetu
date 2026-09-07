// ============================================
// TulaSetu — Mock Data for Frontend Prototype
// ============================================

// --- Recent Reports ---
export interface ReportRow {
  id: string;
  instrument: string;
  class: string;
  manufacturer: string;
  lab: string;
  status: 'Draft' | 'In Review' | 'Approved' | 'Published' | 'Deficiency';
  verdict: 'PASSED' | 'FAILED' | null;
  date: string;
  certificateMark?: string;
  familyCoverage?: string;
  loadCell?: string;
  auditTrail?: string[];
}

export const recentReports: ReportRow[] = [
  { id: 'TR-2026-0187', instrument: 'Electronic Platform Scale', class: 'III', manufacturer: 'Essae Teraoka', lab: 'Faridabad', status: 'Published', verdict: 'PASSED', date: '06 Sep 2026', certificateMark: 'IND/09/26/187', familyCoverage: 'Covers 5 additional variants', loadCell: 'Zemic HM9B', auditTrail: ['Created by MA Priya Sharma on 01 Sep', 'Reviewed by DD R. Kumar on 04 Sep', 'Approved by Director on 06 Sep'] },
  { id: 'TR-2026-0186', instrument: 'Price Computing Scale', class: 'III', manufacturer: 'Ishida', lab: 'Faridabad', status: 'In Review', verdict: 'PASSED', date: '05 Sep 2026' },
  { id: 'TR-2026-0185', instrument: 'Analytical Balance', class: 'I', manufacturer: 'Sartorius', lab: 'Bengaluru', status: 'Deficiency', verdict: null, date: '04 Sep 2026' },
  { id: 'TR-2026-0184', instrument: 'Weighbridge', class: 'IIII', manufacturer: 'Avery', lab: 'Varanasi', status: 'Draft', verdict: null, date: '03 Sep 2026' },
  { id: 'TR-2026-0183', instrument: 'Counter Scale', class: 'II', manufacturer: 'Sansui', lab: 'Guwahati', status: 'Approved', verdict: 'PASSED', date: '02 Sep 2026', certificateMark: 'IND/09/26/183' },
  { id: 'TR-2026-0182', instrument: 'Crane Scale', class: 'III', manufacturer: 'CAS', lab: 'Bhubaneswar', status: 'Published', verdict: 'PASSED', date: '01 Sep 2026' },
  { id: 'TR-2026-0181', instrument: 'Bench Scale', class: 'III', manufacturer: 'KELI', lab: 'Ahmedabad', status: 'In Review', verdict: 'PASSED', date: '31 Aug 2026' },
  { id: 'TR-2026-0180', instrument: 'Platform Scale', class: 'III', manufacturer: 'Flintec', lab: 'Faridabad', status: 'Published', verdict: 'FAILED', date: '30 Aug 2026' },
];

// --- Dashboard KPIs ---
export const dashboardKPIs = [
  { label: 'Reports In Progress', value: 12, subtitle: '3 awaiting review', icon: 'pending_actions', color: 'var(--color-warning)' },
  { label: 'Completed This Month', value: 28, subtitle: 'Sep 2026', icon: 'check_circle', color: 'var(--color-success)' },
  { label: 'Deficiencies', value: 4, subtitle: '2 overdue', icon: 'error', color: 'var(--color-error)' },
  { label: 'Certificates (YTD)', value: 187, subtitle: 'Jan–Sep 2026', icon: 'description', color: 'var(--color-primary)' },
];

// --- Annual Stats ---
export const annualStats = {
  modelsTested: 187,
  feesCollected: '₹46,75,000',
  avgTimeDays: 12.4,
  nawiShare: '69%',
};

// --- Test Forms (Applicability) ---
export interface TestForm {
  formId: string;
  title: string;
  clause: string;
  kernel: string;
  description: string;
  applicable: boolean;
  reason?: string;
  scheduledLast?: boolean;
  points?: string;
}

export const testForms: TestForm[] = [
  { formId: '01', title: 'Weighing Performance', clause: 'Clause A.4.4 · Error vs MPE', kernel: 'K1', description: 'Evaluation at 10 ascending and descending loads across zero, Min, 500e, 2000e, and Max.', applicable: true, points: '10 loads × 2 cycles' },
  { formId: '02', title: 'Temperature Effect on No-Load', clause: 'Clause A.4.7 · Thermal Stability', kernel: 'K4', description: 'Evaluation at -10°C, 20°C, and 40°C chambers. Drift must remain within 1 v.d. per 5°C.', applicable: true, points: '3 thermal zones' },
  { formId: '03.1', title: 'Eccentricity (Standard Loads)', clause: 'Clause A.4.8.1 · 4 Quarter Cantilever', kernel: 'K1', description: 'Applying 1/3 Max (5 kg) on center and each corner of platform plate.', applicable: true, points: '5 positions (5 kg)' },
  { formId: '03.2', title: 'Eccentricity (Rolling Loads)', clause: 'Clause A.4.8.2 · Track Platforms', kernel: 'K1', description: 'Exempt: DS-252 is a stationary compact bench unit without track or monorail receiver.', applicable: false, reason: 'No rolling vehicle load' },
  { formId: '04.1', title: 'Discrimination Test', clause: 'Clause A.4.5 · 1.4d Extra Load', kernel: 'K2', description: 'Verified at Min, 1/2 Max, and Max using additional calibrated 1.4e weight increments.', applicable: true, points: '3 verification loads' },
  { formId: '04.2', title: 'Sensitivity (Non-Self Indicating)', clause: 'Clause A.4.6 · Mechanical Pointers', kernel: 'K3', description: 'Exempt: DS-252 incorporates a digital 7-segment self-indicating LED display system.', applicable: false, reason: 'Self-indicating unit' },
  { formId: '05', title: 'Repeatability Test', clause: 'Clause A.4.10 · Dispersion Span', kernel: 'K1', description: 'Series of 10 measurements at 50% Max (7.5 kg) and 10 measurements at near Max (14 kg).', applicable: true, points: '2 series × 10 cycles' },
  { formId: '06.1 & 06.2', title: 'Zero Return & Creep Test', clause: 'Clause A.4.11 · 30-min Observation', kernel: 'K4', description: 'Load cell creep test over 30 minutes at Max load followed by immediate zero return check.', applicable: true, points: '30 min Max hold' },
  { formId: '07', title: 'Stability of Equilibrium', clause: 'Clause A.4.12 · Printout Inhibit', kernel: 'K1', description: 'Verification that printing / tare cannot be latched during unstable platform conditions.', applicable: true, points: 'Dynamic perturbation' },
  { formId: '08', title: 'Tilting Test (50/1000)', clause: 'Clause A.5.1 · Mobile Instruments', kernel: 'K1', description: 'Exempt: Instrument possesses an onboard bubble level indicator and leveling foot screws.', applicable: false, reason: 'Level-indicator equipped' },
  { formId: '09', title: 'Tare Setting & Balancing', clause: 'Clause A.4.13 · Subtractive Tare', kernel: 'K1', description: 'Zero balance accuracy, tare weighing error vs MPE, and residual capacity bounds verification.', applicable: true, points: '100% Max tare capacity' },
  { formId: '10–14', title: 'Electronic & EMC Disturbances', clause: 'Annex B · AC/DC, Burst & ESD', kernel: 'K5', description: 'Voltage variations (-15% to +10%), 8kV electrostatic discharge, and RF electromagnetic field test.', applicable: true, points: '5 standard protocols' },
  { formId: '15', title: 'Endurance Lifecycle Test', clause: 'Clause A.6.1 · 100,000 Load Applications', kernel: 'K1', description: 'Must be executed strictly after all environmental and metrological compliance evaluations pass.', applicable: true, scheduledLast: true, points: '100,000 cycles' },
  { formId: '16', title: 'Damp Heat Steady State', clause: 'Clause B.2.2 · 85% RH at 40°C', kernel: 'K1', description: '48-hour continuous exposure in climatic chamber. Insulation resistance and weighing error evaluation.', applicable: true, points: '48h static soak' },
  { formId: '17', title: 'Span Stability Verification', clause: 'Clause B.4 · 28-day Drift Tracking', kernel: 'K1', description: 'Periodic loading before, during, and after endurance stress testing to track intrinsic calibration span drift.', applicable: true, points: '8 intervals' },
];

// --- Observation Data (Weighing Performance) ---
export interface ObservationRow {
  id: number;
  load: string;
  indication: string;
  deltaL: string;
  e0: string;
  errorE: string;
  correctedEc: string;
  mpe: string;
  verdict: 'PASSED' | 'FAILED';
  rangeBoundary?: boolean;
  rangeNote?: string;
}

export const observationData: ObservationRow[] = [
  { id: 1, load: '0.100', indication: '0.100', deltaL: '0.000', e0: '0.000', errorE: '+0.001', correctedEc: '+0.001', mpe: '±0.001', verdict: 'PASSED' },
  { id: 2, load: '1.000', indication: '1.000', deltaL: '0.000', e0: '0.000', errorE: '+0.001', correctedEc: '+0.001', mpe: '±0.001', verdict: 'PASSED' },
  { id: 3, load: '2.000', indication: '2.000', deltaL: '0.000', e0: '0.000', errorE: '0.000', correctedEc: '0.000', mpe: '±0.001', verdict: 'PASSED' },
  { id: 4, load: '4.000', indication: '4.002', deltaL: '0.000', e0: '0.000', errorE: '+0.003', correctedEc: '+0.003', mpe: '±0.002', verdict: 'FAILED' },
  { id: 5, load: '5.000', indication: '5.000', deltaL: '0.000', e0: '0.000', errorE: '+0.001', correctedEc: '+0.001', mpe: '±0.002', verdict: 'PASSED' },
  { id: 6, load: '6.000', indication: '6.002', deltaL: '0.000', e0: '0.000', errorE: '+0.004', correctedEc: '+0.004', mpe: '±0.005', verdict: 'PASSED', rangeBoundary: true, rangeNote: '⚡ Range boundary — e changed from 2g to 5g, MPE updated' },
  { id: 7, load: '10.000', indication: '10.005', deltaL: '0.000', e0: '0.000', errorE: '+0.008', correctedEc: '+0.008', mpe: '±0.010', verdict: 'PASSED' },
  { id: 8, load: '15.000', indication: '15.005', deltaL: '0.000', e0: '0.000', errorE: '+0.008', correctedEc: '+0.008', mpe: '±0.015', verdict: 'PASSED' },
];

// --- Family Solver ---
export interface FamilyVariant {
  variantId: string;
  max: number;
  maxUnit: string;
  e: number;
  eUnit: string;
  n: number;
  class: string;
}

export const familyVariants: FamilyVariant[] = [
  { variantId: '1.1', max: 6, maxUnit: 'kg', e: 2, eUnit: 'g', n: 3000, class: 'III' },
  { variantId: '1.2', max: 15, maxUnit: 'kg', e: 5, eUnit: 'g', n: 3000, class: 'III' },
  { variantId: '1.3', max: 30, maxUnit: 'kg', e: 10, eUnit: 'g', n: 3000, class: 'III' },
  { variantId: '2.1', max: 3, maxUnit: 'kg', e: 1, eUnit: 'g', n: 3000, class: 'III' },
  { variantId: '2.2', max: 6, maxUnit: 'kg', e: 2, eUnit: 'g', n: 3000, class: 'III' },
  { variantId: '2.3', max: 15, maxUnit: 'kg', e: 5, eUnit: 'g', n: 3000, class: 'III' },
  { variantId: '2.4', max: 60, maxUnit: 'kg', e: 20, eUnit: 'g', n: 3000, class: 'III' },
  { variantId: '2.5', max: 150, maxUnit: 'kg', e: 50, eUnit: 'g', n: 3000, class: 'III' },
];

export const eutResults = [
  { variantId: '1.2', tag: 'Highest n in family 1', max: 15, e: 5 },
  { variantId: '2.1', tag: 'Smallest e', max: 3, e: 1 },
  { variantId: '2.4', tag: 'Coverage gap filler', max: 60, e: 20 },
];

export const coverageTable = [
  { variant: '1.1', coveredBy: '1.2', rule: 'Max between tested capacities, ratio ≤ 10' },
  { variant: '1.3', coveredBy: '1.2 + 2.4', rule: 'Max between tested capacities, ratio ≤ 10' },
  { variant: '2.2', coveredBy: '2.1', rule: 'n ≤ n_test, e ≥ e_test, Max ≤ 5·Max_test·(n_test/n)' },
  { variant: '2.3', coveredBy: '2.1 + 2.4', rule: 'Max between tested capacities, ratio ≤ 10' },
  { variant: '2.5', coveredBy: '2.4', rule: 'n ≤ n_test, e ≥ e_test, Max ≤ 5·Max_test·(n_test/n)' },
];

export const generatedClause = `This certificate of approval shall also cover variants 1.1 (Max 6 kg, e 2 g), 1.3 (Max 30 kg, e 10 g), 2.2 (Max 6 kg, e 2 g), 2.3 (Max 15 kg, e 5 g), and 2.5 (Max 150 kg, e 50 g), which are deemed to satisfy the requirements without individual testing per OIML R 76-1 §3.10.4.`;

// --- Navigation Links ---
export const sidebarLinks = [
  { icon: 'space_dashboard', label: 'Dashboard', path: '/dashboard' },
  { icon: 'add_circle', label: 'New Report', path: '/new/profile' },
  { icon: 'history', label: 'Inspection History', path: '/reports' },
  { icon: 'group', label: 'Officers', path: '#' },
  { icon: 'credit_card', label: 'Fee & Invoicing', path: '#' },
  { icon: 'inventory_2', label: 'Instruments', path: '#' },
];

export const headerNavLinks = [
  { label: 'Home', path: '#' },
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'New Verification', path: '/new/profile' },
  { label: 'Test Matrix', path: '/new/tests' },
  { label: 'Observations & MPE', path: '/new/observations' },
  { label: 'Family Solver', path: '/family-solver' },
  { label: 'Report Generation', path: '/report/generate' },
  { label: 'Reports Repository', path: '/reports' },
];

// --- RRSL Labs ---
export const rrslLabs = [
  'RRSL Faridabad (Northern HQ & Central Lab)',
  'RRSL Bengaluru (South Regional Directorate)',
  'RRSL Ahmedabad (West Calibration Apex)',
  'RRSL Bhubaneswar (Eastern Regional Cell)',
  'RRSL Guwahati (North-East Metrological Div.)',
  'DCA Central Standards Repository, New Delhi',
];

// --- Monthly Chart Data ---
export const monthlyActivity = [
  { month: 'Apr', passed: 22, failed: 3, review: 5 },
  { month: 'May', passed: 18, failed: 2, review: 8 },
  { month: 'Jun', passed: 25, failed: 4, review: 3 },
  { month: 'Jul', passed: 30, failed: 1, review: 6 },
  { month: 'Aug', passed: 27, failed: 3, review: 4 },
  { month: 'Sep', passed: 28, failed: 2, review: 5 },
];
