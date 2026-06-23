export type InstitutionSectorId =
  | 'banks'
  | 'mfi'
  | 'hospitals'
  | 'schools'
  | 'commercial'
  | 'services'
  | 'others';

export type ReportPeriod = 'daily' | 'monthly' | 'quarterly' | 'yearly';

export interface ReportRow {
  n: string;
  d: string;
  p: string[];
  f: string[];
  r: boolean;
}

export interface SectorPayload {
  platforms: string[];
  formats: string[];
  daily: ReportRow[];
  monthly: ReportRow[];
  quarterly: ReportRow[];
  yearly: ReportRow[];
}

export type CameroonReportingMap = Record<InstitutionSectorId, SectorPayload>;
