import React from 'react';
import { useTranslation } from 'react-i18next';
import ReportGeneratorPanel from '../components/ReportGeneratorPanel';
import './ReportingModule.css';

const ReportingModule: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="reporting-module reporting-module--intel animate-fade-in">
      <h2 className="sr-only">{t('reporting.intelligent_reporting')}</h2>
      <div className="glass-panel" style={{ padding: '24px 28px' }}>
        <h1 className="rm-title">{t('reporting.title')}</h1>
        <p className="rm-lead">
          {t('reporting.description')}
        </p>
        <ReportGeneratorPanel />
      </div>
    </div>
  );
};

export default ReportingModule;
