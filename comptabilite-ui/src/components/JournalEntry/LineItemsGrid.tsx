import React, { useCallback, useMemo } from 'react';
import { useFormContext, useFieldArray, useWatch } from 'react-hook-form';
import type { JournalEntryFormValues } from '../../schemas/journalEntrySchema';
import { Plus, Trash2, Hash, Type, ArrowUpCircle, ArrowDownCircle, LayoutGrid } from 'lucide-react';
import { useJournalAccounts } from '../../hooks/useJournalAccounts';
import { useServiceCatalog } from '../../hooks/useServiceCatalog';
import { filterActiveCostCenters, useCostCenters } from '../../hooks/useCostCenters';
import { useTranslation } from 'react-i18next';
import {
  applySideLockToLineValues,
  counterpartHint,
  filterCounterpartAccounts,
  linePairsWithRevenueCredit,
  lineTotals,
  mapJournalTypeToCode,
  pickDefaultCounterpart,
  postingSideForLine,
  resolveLinePostingSide,
  sideFieldState,
  sideHintForLine,
  type JournalAccountLike,
  type JournalLineLike,
} from '../../lib/journalCounterparts';
import { paymentMethodsFromAccounts } from '../../lib/paymentMethodAccounts';
import {
  applyCatalogPriceToLine,
  catalogEntryForAccount,
  defaultLineDescription,
  findCatalogService,
  isHospitalRevenueAccount,
  pickDefaultCatalogService,
  type ServiceCatalogByCode,
} from '../../lib/hospitalServiceCatalog';
import './JournalEntryForm.css';

function isPostingCode(code: string): boolean {
  return /^\d{6}$/.test(String(code || '').trim());
}

function toJournalAccount(a: { id: string; code: string; nameEn: string; nameFr: string; ohadaClass: number; accountType: string }, isEn: boolean): JournalAccountLike {
  return {
    id: a.id,
    code: a.code,
    label: isEn ? a.nameEn : a.nameFr,
    ohada_class: a.ohadaClass,
    account_type: a.accountType,
  };
}

export const LineItemsGrid: React.FC = () => {
  const { register, control, setValue, formState: { errors } } = useFormContext<JournalEntryFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  const { i18n, t } = useTranslation();
  const isEn = i18n.language.startsWith('en');

  const { data: rawAccounts = [] } = useJournalAccounts();
  const { data: catalogByCode = {} } = useServiceCatalog();
  const { data: costCenterList = [] } = useCostCenters(false);
  const costCenters = filterActiveCostCenters(costCenterList);
  const lines = useWatch({ control, name: 'lines' }) ?? [];
  const journalType = useWatch({ control, name: 'journalType' }) ?? 'JNL';
  const journalCode = mapJournalTypeToCode(journalType);

  const postingAccounts = useMemo(
    () => rawAccounts.filter((a) => isPostingCode(a.code)).map((a) => toJournalAccount(a, isEn)),
    [rawAccounts, isEn]
  );

  const accountsByCode = useMemo(
    () => new Map(postingAccounts.map((a) => [a.code, a])),
    [postingAccounts]
  );

  const paymentMethodOptions = useMemo(
    () => paymentMethodsFromAccounts(postingAccounts.map((a) => ({ id: a.id, code: a.code, label: a.label }))),
    [postingAccounts]
  );

  const lineHints = useMemo(() => {
    return lines.map((_ln: JournalLineLike, i: number) => {
      if (i === 0) return '';
      const prev = lines[i - 1];
      const srcAcct = accountsByCode.get(String(prev?.accountCode || ''));
      const side = srcAcct
        ? postingSideForLine(i - 1, prev, srcAcct, journalCode, lines, accountsByCode)
        : null;
      return srcAcct && side ? counterpartHint(srcAcct, side) : '';
    });
  }, [lines, accountsByCode, journalCode]);

  const accountsForLine = useCallback(
    (lineIndex: number) => {
      let pool = postingAccounts;
      if (lineIndex > 0) {
        const prev = lines[lineIndex - 1];
        const srcAcct = accountsByCode.get(String(prev?.accountCode || ''));
        if (srcAcct) {
          const side = postingSideForLine(lineIndex - 1, prev, srcAcct, journalCode, lines, accountsByCode);
          if (side) {
            pool = filterCounterpartAccounts(srcAcct, side, postingAccounts, journalCode);
          }
        }
      }
      return pool;
    },
    [postingAccounts, lines, accountsByCode, journalCode]
  );

  const applyCatalogToLine = useCallback(
    (
      allLines: JournalEntryFormValues['lines'],
      index: number,
      accountCode: string,
      serviceKey?: string
    ) => {
      const entry = catalogEntryForAccount(catalogByCode as ServiceCatalogByCode, accountCode);
      if (!entry || !isHospitalRevenueAccount(accountCode)) return allLines;
      const service = serviceKey
        ? findCatalogService(entry, serviceKey)
        : pickDefaultCatalogService(entry);
      if (!service) return allLines;
      const next = [...allLines];
      next[index] = {
        ...next[index],
        ...applyCatalogPriceToLine(next[index], entry, service),
      };
      return next;
    },
    [catalogByCode]
  );

  const applyNarrativeToLine = useCallback(
    (line: JournalEntryFormValues['lines'][number], accountCode: string, force = false) => {
      const code = String(accountCode || '').trim();
      if (!code) return line;
      const acct = accountsByCode.get(code);
      if (!acct) return line;
      if (!force && line.description?.trim()) return line;
      return {
        ...line,
        description: defaultLineDescription(acct.code, acct.label, catalogByCode as ServiceCatalogByCode),
      };
    },
    [accountsByCode, catalogByCode]
  );

  const applyCounterpartToNextLine = useCallback(
    (allLines: JournalEntryFormValues['lines'], index: number) => {
      const nextIdx = index + 1;
      if (nextIdx >= allLines.length) return allLines;

      const srcLine = allLines[index];
      const srcAcct = accountsByCode.get(String(srcLine.accountCode || ''));
      if (!srcAcct) return allLines;

      const side = postingSideForLine(index, srcLine, srcAcct, journalCode, allLines, accountsByCode);
      if (!side) return allLines;

      const counterparts = filterCounterpartAccounts(srcAcct, side, postingAccounts, journalCode);
      if (!counterparts.length) return allLines;

      const next = allLines.map((ln) => ({ ...ln }));
      const nextLine = next[nextIdx];
      const currentOk = nextLine.accountCode && counterparts.some((a) => a.code === nextLine.accountCode);

      if (!currentOk) {
        const def = pickDefaultCounterpart(counterparts, journalCode);
        if (def) {
          next[nextIdx] = applyNarrativeToLine({ ...nextLine, accountCode: def.code }, def.code, true);
        }
      }

      const postingSide = resolveLinePostingSide(nextIdx, next[nextIdx], journalCode, next, accountsByCode);
      const locked = applySideLockToLineValues(next[nextIdx], postingSide);
      next[nextIdx] = { ...next[nextIdx], ...locked };

      const { diff } = lineTotals(next);
      if (diff !== 0) {
        const abs = Math.abs(diff);
        const nextSide = resolveLinePostingSide(nextIdx, next[nextIdx], journalCode, next, accountsByCode);
        if (nextSide === 'credit' || (!nextSide && diff > 0)) {
          next[nextIdx] = { ...next[nextIdx], creditAmount: abs, debitAmount: 0 };
        } else {
          next[nextIdx] = { ...next[nextIdx], debitAmount: abs, creditAmount: 0 };
        }
      }

      if (next[nextIdx].accountCode) {
        next[nextIdx] = applyNarrativeToLine(next[nextIdx], next[nextIdx].accountCode, true);
      }

      return next;
    },
    [accountsByCode, journalCode, postingAccounts, applyNarrativeToLine]
  );

  const syncLineSideLock = useCallback(
    (allLines: JournalEntryFormValues['lines'], index: number) => {
      const line = allLines[index];
      const acct = accountsByCode.get(String(line.accountCode || ''));
      if (!acct) return allLines;
      const postingSide = resolveLinePostingSide(index, line, journalCode, allLines, accountsByCode);
      const locked = applySideLockToLineValues(line, postingSide);
      const next = allLines.map((ln, i) => (i === index ? { ...ln, ...locked } : ln));
      return applyCounterpartToNextLine(next, index);
    },
    [accountsByCode, journalCode, applyCounterpartToNextLine]
  );

  const onAccountChange = (index: number, accountCode: string) => {
    const acct = postingAccounts.find((a) => a.code === accountCode);
    let next = lines.map((ln, i) => {
      if (i !== index) return ln;
      if (!acct) {
        return {
          ...ln,
          accountCode: '',
          debitAmount: 0,
          creditAmount: 0,
          description: '',
          catalogServiceKey: '',
        };
      }
      return {
        ...ln,
        accountCode: acct.code,
        description: defaultLineDescription(acct.code, acct.label, catalogByCode as ServiceCatalogByCode),
        catalogServiceKey: '',
      };
    });

    if (acct) {
      next = syncLineSideLock(next, index);
      const side = resolveLinePostingSide(index, next[index], journalCode, next, accountsByCode);
      if (side === 'credit' && isHospitalRevenueAccount(acct.code)) {
        next = applyCatalogToLine(next, index, acct.code);
      }
      if ((next[index].creditAmount || 0) > 0 && index + 1 < next.length) {
        next = applyCounterpartToNextLine(next, index);
      }
    }

    setValue('lines', next, { shouldValidate: true, shouldDirty: true });
  };

  const onCatalogServiceChange = (index: number, serviceKey: string) => {
    const code = lines[index]?.accountCode;
    if (!code) return;
    let next = applyCatalogToLine(lines, index, code, serviceKey);
    next = syncLineSideLock(next, index);
    if ((next[index].creditAmount || 0) > 0 && index + 1 < next.length) {
      next = applyCounterpartToNextLine(next, index);
    }
    setValue('lines', next, { shouldValidate: true, shouldDirty: true });
  };

  const onDebitChange = (index: number, value: number) => {
    let next = lines.map((ln, i) =>
      i !== index
        ? ln
        : { ...ln, debitAmount: value, creditAmount: value > 0 ? 0 : ln.creditAmount }
    );
    if (value > 0 && index + 1 < next.length) {
      next = applyCounterpartToNextLine(next, index);
    }
    setValue('lines', next, { shouldValidate: true, shouldDirty: true });
  };

  const onCreditChange = (index: number, value: number) => {
    let next = lines.map((ln, i) =>
      i !== index
        ? ln
        : { ...ln, creditAmount: value, debitAmount: value > 0 ? 0 : ln.debitAmount }
    );
    if (value > 0 && index + 1 < next.length) {
      next = applyCounterpartToNextLine(next, index);
    }
    setValue('lines', next, { shouldValidate: true, shouldDirty: true });
  };

  const onPaymentMethodSelect = (index: number, accountCode: string) => {
    onAccountChange(index, accountCode);
  };

  return (
    <div className="jem-lines-stack">
      {paymentMethodOptions.length === 0 &&
      lines.some((ln) => {
        const a = accountsByCode.get(String(ln.accountCode || ''));
        return a?.ohada_class === 7 || a?.account_type === 'revenue' || a?.account_type === 'income';
      }) ? (
        <div className="jem-line-hint jem-line-hint--warn">
          {isEn
            ? 'Payment method accounts (552601–552606) are missing from the chart. Import from WYVERN to enable Cash / OM / MOMO / Bank on the debit line.'
            : 'Comptes de paiement (552601–552606) absents du plan. Importez depuis WYVERN pour activer Caisse / OM / MOMO / Banque.'}
        </div>
      ) : null}

      <p className="jem-line-hint">
        {isEn
          ? '6-digit OHADA accounts only. Line 2+ filters counterparts automatically; debit/credit sides lock by account nature.'
          : 'Comptes OHADA à 6 chiffres uniquement. La ligne 2+ filtre les contreparties ; le sens débit/crédit se verrouille selon la nature du compte.'}
      </p>

      <div className="jem-lt-outer">
        <table className="jem-lt-table">
          <thead>
            <tr>
              <th className="jem-lt-col-account">
                <span className="jem-lt-h">
                  <Hash className="jem-lt-ico" />
                  GL Account
                </span>
              </th>
              <th className="jem-lt-col-narrative">
                <span className="jem-lt-h">
                  <Type className="jem-lt-ico" />
                  Narrative
                </span>
              </th>
              <th className="jem-lt-col-cc">
                <span className="jem-lt-h">
                  <LayoutGrid className="jem-lt-ico" />
                  {isEn ? 'Cost centre' : 'Centre de coût'}
                </span>
              </th>
              <th className="jem-lt-col-amt jem-lt-r">
                <span className="jem-lt-h jem-lt-h--end">
                  <ArrowUpCircle className="jem-lt-ico jem-lt-ico--red" />
                  Debit
                </span>
              </th>
              <th className="jem-lt-col-amt jem-lt-r">
                <span className="jem-lt-h jem-lt-h--end">
                  <ArrowDownCircle className="jem-lt-ico jem-lt-ico--grn" />
                  Credit
                </span>
              </th>
              <th className="jem-lt-c" style={{ width: '2.5rem' }}>
                {' '}
              </th>
            </tr>
          </thead>
          <tbody className="jem-lt-tbody">
            {fields.map((field, index) => {
              const line = lines[index] ?? {};
              const lineOptions = accountsForLine(index);
              const acct = accountsByCode.get(String(line.accountCode || ''));
              const postingSide = resolveLinePostingSide(index, line, journalCode, lines, accountsByCode);
              const { debitEnabled, creditEnabled } = sideFieldState(postingSide);
              const amountHint = sideHintForLine(index, line, acct, journalCode, lines, accountsByCode);
              const showPaymentMethodPicker =
                index > 0 &&
                debitEnabled &&
                linePairsWithRevenueCredit(index, lines, accountsByCode, journalCode) &&
                paymentMethodOptions.length > 0;
              const catalogEntry = catalogEntryForAccount(catalogByCode as ServiceCatalogByCode, line.accountCode || '');
              const showCatalogPicker = creditEnabled && (catalogEntry?.services?.length ?? 0) > 0;
              const catalogServiceKey =
                (line as { catalogServiceKey?: string }).catalogServiceKey ||
                pickDefaultCatalogService(catalogEntry)?.key ||
                '';

              return (
                <React.Fragment key={field.id}>
                  {(amountHint || lineHints[index]) && (
                    <tr>
                      <td colSpan={6} className="jem-lt-hint-row">
                        <span className="jem-lt-hint-text">
                          {amountHint}
                          {lineHints[index] ? `${amountHint ? ' · ' : ''}${lineHints[index]}` : ''}
                          {showPaymentMethodPicker
                            ? ` · ${paymentMethodOptions.length} ${isEn ? 'payment methods' : 'modes de paiement'}`
                            : lineHints[index] && lineOptions.length
                              ? ` (${lineOptions.length} ${isEn ? 'accounts' : 'comptes'})`
                              : ''}
                          {showCatalogPicker ? (isEn ? ' · Credit from HMS service catalog (editable)' : ' · Crédit depuis catalogue HMS (modifiable)') : ''}
                        </span>
                      </td>
                    </tr>
                  )}
                  {showPaymentMethodPicker && (
                    <tr>
                      <td colSpan={6} className="jem-lt-hint-row">
                        <select
                          className="jem-lt-cc"
                          value={line.accountCode || ''}
                          onChange={(e) => onPaymentMethodSelect(index, e.target.value)}
                        >
                          <option value="">{isEn ? 'Select payment method (debit)…' : 'Mode de paiement (débit)…'}</option>
                          {paymentMethodOptions.map((pm) => (
                            <option key={pm.code} value={pm.code}>
                              {pm.shortLabel} — {pm.code} · {pm.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )}
                  {showCatalogPicker && (
                    <tr>
                      <td colSpan={6} className="jem-lt-hint-row">
                        <select
                          className="jem-lt-cc"
                          value={catalogServiceKey}
                          onChange={(e) => onCatalogServiceChange(index, e.target.value)}
                        >
                          {catalogEntry!.services.map((svc) => (
                            <option key={svc.key} value={svc.key}>
                              {svc.name} — {svc.price.toLocaleString(isEn ? 'en-US' : 'fr-FR')} XAF
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )}
                  <tr className="group">
                    <td className="jem-lt-col-account">
                      <select
                        className="jem-lt-account-select"
                        value={line.accountCode || ''}
                        title={acct ? `${acct.code} — ${acct.label}` : undefined}
                        onChange={(e) => onAccountChange(index, e.target.value)}
                      >
                        <option value="">{''}</option>
                        {lineOptions.map((a) => (
                          <option key={a.code} value={a.code} title={a.label}>
                            {a.code}
                          </option>
                        ))}
                      </select>
                      {errors.lines?.[index]?.accountCode && (
                        <span className="jem-lt-line-err">{errors.lines[index]?.accountCode?.message}</span>
                      )}
                    </td>
                    <td className="jem-lt-col-narrative">
                      <input
                        {...register(`lines.${index}.description`)}
                        className="jem-lt-narrative"
                        placeholder={isEn ? 'Line description' : 'Libellé de ligne'}
                      />
                    </td>
                    <td>
                      {costCenters.length > 0 ? (
                        <select
                          {...register(`lines.${index}.costCentre`)}
                          className="jem-lt-cc"
                          title={isEn ? 'OHADA analytical axis' : 'Axe analytique OHADA'}
                        >
                          <option value="">{isEn ? '— Select —' : '— Choisir —'}</option>
                          {costCenters.map((c) => (
                            <option key={c.id} value={c.code}>
                              {c.code} — {c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...register(`lines.${index}.costCentre`)}
                          placeholder={isEn ? 'Optional (define in Cost centres)' : 'Optionnel (définir dans Centres)'}
                          className="jem-lt-cc"
                        />
                      )}
                    </td>
                    <td>
                      <input
                        className={`jem-lt-mono${!debitEnabled ? ' jem-lt-disabled' : ''}`}
                        type="number"
                        step="0.01"
                        min={0}
                        value={line.debitAmount ? line.debitAmount : ''}
                        placeholder={debitEnabled ? '0' : ''}
                        disabled={!debitEnabled}
                        readOnly={!debitEnabled}
                        onChange={(e) => onDebitChange(index, Number(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input
                        className={`jem-lt-mono${!creditEnabled ? ' jem-lt-disabled' : ''}`}
                        type="number"
                        step="0.01"
                        min={0}
                        value={line.creditAmount ? line.creditAmount : ''}
                        placeholder={creditEnabled ? '0' : ''}
                        disabled={!creditEnabled}
                        readOnly={!creditEnabled}
                        onChange={(e) => onCreditChange(index, Number(e.target.value) || 0)}
                      />
                    </td>
                    <td className="jem-lt-c">
                      <button
                        type="button"
                        className="jem-lt-del"
                        onClick={() => remove(index)}
                        title={isEn ? 'Remove line' : 'Supprimer'}
                      >
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </button>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {fields.length === 0 && (
          <div className="jem-lt-empty">{isEn ? 'No lines added.' : 'Aucune ligne ajoutée.'}</div>
        )}
      </div>

      <div className="jem-lt-footer">
        <button
          type="button"
          className="jem-add-line"
          onClick={() => {
            const lastLine = lines?.[lines.length - 1];
            let initialDebit = 0;
            let initialCredit = 0;
            if (lastLine && (lastLine.debitAmount || 0) > 0) {
              initialCredit = lastLine.debitAmount;
            } else if (lastLine && (lastLine.creditAmount || 0) > 0) {
              initialDebit = lastLine.creditAmount;
            }
            append({
              accountCode: '',
              debitAmount: initialDebit,
              creditAmount: initialCredit,
              taxAmount: 0,
              description: '',
              costCentre: '',
              catalogServiceKey: '',
            });
          }}
        >
          <Plus style={{ width: 16, height: 16 }} />
          {t('journal.add_line', isEn ? 'Add line' : 'Ajouter ligne')}
        </button>
        {errors.lines?.root && <div className="jem-err">{errors.lines.root.message}</div>}
      </div>
    </div>
  );
};
