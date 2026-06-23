import type { CameroonReportingMap } from './cameroonReportingTypes';
import raw from './cameroonReportingCatalog.json' with { type: 'json' };

export const CAMEROON_REPORTING: CameroonReportingMap = raw as CameroonReportingMap;
