import type { InstitutionSectorId } from '../data/cameroonReportingTypes';

export type { InstitutionSectorId };

export const INSTITUTION_TYPE_STORAGE_KEY = 'zaizen.institutionType';

export const PERIODS = ['Daily', 'Monthly', 'Quarterly', 'Yearly'] as const;
export type PeriodLabel = (typeof PERIODS)[number];

export const INSTITUTION_OPTIONS: {
  id: InstitutionSectorId;
  label: string;
  abbr: string;
}[] = [
  { id: 'banks', label: 'Banks', abbr: 'BNK' },
  { id: 'mfi', label: 'Microfinance', abbr: 'MFI' },
  { id: 'hospitals', label: 'Hospitals', abbr: 'HSP' },
  { id: 'schools', label: 'Schools', abbr: 'SCH' },
  { id: 'commercial', label: 'Commerce', abbr: 'COM' },
  { id: 'services', label: 'Services', abbr: 'SRV' },
  { id: 'others', label: 'NGO / Others', abbr: 'NGO' },
];

export const PLATFORM_STYLES: Record<string, { bg: string; bd: string; tx: string }> = {
  MAESS: { bg: '#E1F5EE', bd: '#0F6E56', tx: '#085041' },
  'LOAN PERFORMER': { bg: '#FAEEDA', bd: '#BA7517', tx: '#633806' },
  'Mifos X': { bg: '#EEEDFE', bd: '#534AB7', tx: '#26215C' },
  'PERFECT/SOGES': { bg: '#E6F1FB', bd: '#185FA5', tx: '#042C53' },
  FLEXCUBE: { bg: '#E6F1FB', bd: '#185FA5', tx: '#042C53' },
  'T24/Transact': { bg: '#EEEDFE', bd: '#534AB7', tx: '#26215C' },
  'DELTA/BANKS': { bg: '#E1F5EE', bd: '#0F6E56', tx: '#085041' },
  Amplitude: { bg: '#FAEEDA', bd: '#BA7517', tx: '#633806' },
  // Extended sectors (HSP, SCH, COM, SRV, NGO) — optional display in legend
  Odoo: { bg: '#E6F1FB', bd: '#185FA5', tx: '#042C53' },
  'SAP Business One': { bg: '#E1F5EE', bd: '#0F6E56', tx: '#085041' },
  'Dynamics 365': { bg: '#EEEDFE', bd: '#534AB7', tx: '#26215C' },
  Sage: { bg: '#E6F1FB', bd: '#185FA5', tx: '#042C53' },
  'Zoho / QuickBooks': { bg: '#FAEEDA', bd: '#BA7517', tx: '#633806' },
  'ZAIZEN core': { bg: '#E1F5EE', bd: '#0F6E56', tx: '#085041' },
  'Unit4 / Agresso': { bg: '#EEEDFE', bd: '#534AB7', tx: '#26215C' },
  'EPIC / CLINICOM': { bg: '#E6F1FB', bd: '#185FA5', tx: '#042C53' },
  MEDIALOG: { bg: '#E1F5EE', bd: '#0F6E56', tx: '#085041' },
  'SCOLARO / OpenEdu': { bg: '#EEEDFE', bd: '#534AB7', tx: '#26215C' },
  'Excel + manual': { bg: '#f1f5f9', bd: '#94a3b8', tx: '#334155' },
};

const DEFAULT_SECTOR: InstitutionSectorId = 'mfi';

function isSectorId(s: string | null | undefined): s is InstitutionSectorId {
  return (
    s === 'banks' ||
    s === 'mfi' ||
    s === 'hospitals' ||
    s === 'schools' ||
    s === 'commercial' ||
    s === 'services' ||
    s === 'others'
  );
}

export function getInstitutionType(): InstitutionSectorId {
  const v = localStorage.getItem(INSTITUTION_TYPE_STORAGE_KEY);
  return isSectorId(v) ? v : DEFAULT_SECTOR;
}

export function setInstitutionType(id: InstitutionSectorId): void {
  localStorage.setItem(INSTITUTION_TYPE_STORAGE_KEY, id);
  window.dispatchEvent(new Event('institutionTypeChange'));
}

export function periodKey(p: string): 'daily' | 'monthly' | 'quarterly' | 'yearly' {
  return p.toLowerCase() as 'daily' | 'monthly' | 'quarterly' | 'yearly';
}
