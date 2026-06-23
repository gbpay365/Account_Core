import React from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  fiscalYear: number;
  availableYears: number[];
  onChange: (year: number) => void;
  disabled?: boolean;
};

const FiscalYearSelect: React.FC<Props> = ({ fiscalYear, availableYears, onChange, disabled }) => {
  const { t } = useTranslation();
  const years = availableYears.length ? availableYears : [fiscalYear];

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('common.fiscal_year')}</span>
      <select
        className="hms-input"
        value={fiscalYear}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || fiscalYear)}
        style={{ minWidth: 96 }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
};

export default FiscalYearSelect;
