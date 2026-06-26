import React, { useCallback, useMemo, useRef, useState } from 'react';
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

function normalizeAccountSearch(query: string): string {
  return String(query || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Filter GL accounts by narrative search (code + label, all tokens must match). */
function filterAccountsBySearch(accounts: JournalAccountLike[], query: string): JournalAccountLike[] {
  const q = normalizeAccountSearch(query);
  if (!q || q.length < 2) return accounts;
  const tokens = q.split(/\s+/).filter(Boolean);
  return accounts.filter((a) => {
    const hay = normalizeAccountSearch(`${a.code} ${a.label}`);
    return tokens.every((t) => hay.includes(t));
  });
}

function sanitizeAmountInput(raw: string): string {
  let s = String(raw || '').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  }
  return s;
}

function parseAmountInput(raw: string): number {
  const s = String(raw || '').trim();
  if (!s || s === '.') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatAmountDisplay(amount: number): string {
  if (!amount) return '';
  return String(amount);
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
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [narrativeDrafts, setNarrativeDrafts] = useState<Record<number, string>>({});
  const [suggestionLine, setSuggestionLine] = useState<number | null>(null);
  const [suggestionHighlight, setSuggestionHighlight] = useState(0);
  const narrativeRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const suggestionBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { fields, remove, replace } = useFieldArray({
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

  const searchPoolForLine = useCallback(
    (lineIndex: number) => accountsForLine(lineIndex),
    [accountsForLine]
  );

  const suggestionsForLine = useCallback(
    (lineIndex: number, query: string) => {
      const q = String(query || '').trim();
      if (q.length < 2) return [];
      return filterAccountsBySearch(searchPoolForLine(lineIndex), q).slice(0, 12);
    },
    [searchPoolForLine]
  );

  const focusNarrative = useCallback((index: number) => {
    requestAnimationFrame(() => {
      const el = narrativeRefs.current[index];
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }, []);

  const clearNarrativeDraft = useCallback((index: number) => {
    setNarrativeDrafts((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

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
          const prevNarrative = String(srcLine.description || '').trim();
          next[nextIdx] = {
            ...nextLine,
            accountCode: def.code,
            description: prevNarrative || nextLine.description || '',
          };
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

      const prevNarrative = String(srcLine.description || '').trim();
      if (prevNarrative && next[nextIdx].accountCode) {
        next[nextIdx] = { ...next[nextIdx], description: prevNarrative };
      } else if (next[nextIdx].accountCode && !String(next[nextIdx].description || '').trim()) {
        next[nextIdx] = applyNarrativeToLine(next[nextIdx], next[nextIdx].accountCode, true);
      }

      return next;
    },
    [accountsByCode, journalCode, postingAccounts, applyNarrativeToLine]
  );

  /** Line index that receives the mirrored debit/credit for double-entry balancing. */
  const mirrorTargetIndex = useCallback(
    (sourceIndex: number, lineCount: number, sourceSide: 'debit' | 'credit') => {
      if (lineCount < 2) return null;
      if (lineCount === 2) return sourceIndex === 0 ? 1 : 0;
      if (sourceSide === 'debit') {
        return sourceIndex + 1 < lineCount ? sourceIndex + 1 : sourceIndex - 1;
      }
      return sourceIndex > 0 ? sourceIndex - 1 : sourceIndex + 1;
    },
    []
  );

  /** Mirror debit ↔ credit on the counterpart line (same amount). */
  const mirrorCounterpartAmount = useCallback(
    (
      allLines: JournalEntryFormValues['lines'],
      sourceIndex: number,
      sourceSide: 'debit' | 'credit',
      amount: number
    ) => {
      const targetIndex = mirrorTargetIndex(sourceIndex, allLines.length, sourceSide);
      if (targetIndex == null || targetIndex < 0 || targetIndex >= allLines.length) return allLines;

      const next = allLines.map((ln) => ({ ...ln }));
      const targetLine = next[targetIndex];
      const targetPostingSide = resolveLinePostingSide(
        targetIndex,
        targetLine,
        journalCode,
        next,
        accountsByCode
      );
      const abs = Math.abs(amount);

      if (sourceSide === 'debit') {
        if (targetPostingSide === 'credit' || targetPostingSide === null) {
          next[targetIndex] = { ...targetLine, creditAmount: abs, debitAmount: 0 };
        }
      } else if (targetPostingSide === 'debit' || targetPostingSide === null) {
        next[targetIndex] = { ...targetLine, debitAmount: abs, creditAmount: 0 };
      }

      return next;
    },
    [accountsByCode, journalCode, mirrorTargetIndex]
  );

  const clearMirroredAmountDraft = (sourceIndex: number, sourceSide: 'debit' | 'credit', lineCount: number) => {
    const targetIndex = mirrorTargetIndex(sourceIndex, lineCount, sourceSide);
    if (targetIndex == null) return;
    const mirrorSide = sourceSide === 'debit' ? 'credit' : 'debit';
    clearAmountDraft(`${mirrorSide}:${targetIndex}`);
  };

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
        clearNarrativeDraft(index);
        setSuggestionLine((cur) => (cur === index ? null : cur));
        return {
          ...ln,
          accountCode: '',
          debitAmount: 0,
          creditAmount: 0,
          description: '',
          catalogServiceKey: '',
        };
      }
      const keepDescription = ln.description?.trim();
      return {
        ...ln,
        accountCode: acct.code,
        description:
          keepDescription ||
          defaultLineDescription(acct.code, acct.label, catalogByCode as ServiceCatalogByCode),
        catalogServiceKey: '',
      };
    });

    if (acct) {
      clearNarrativeDraft(index);
      setSuggestionLine((cur) => (cur === index ? null : cur));
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

  const applyLineAmount = (index: number, side: 'debit' | 'credit', value: number) => {
    let next = lines.map((ln, i) => {
      if (i !== index) return ln;
      if (side === 'debit') {
        return { ...ln, debitAmount: value, creditAmount: value > 0 ? 0 : ln.creditAmount };
      }
      return { ...ln, creditAmount: value, debitAmount: value > 0 ? 0 : ln.debitAmount };
    });

    next = mirrorCounterpartAmount(next, index, side, value);

    if (value > 0) {
      if (side === 'debit' && index + 1 < next.length) {
        next = applyCounterpartToNextLine(next, index);
      } else if (side === 'credit' && index > 0) {
        next = applyCounterpartToNextLine(next, index - 1);
        const prevNarrative = String(next[index - 1]?.description || '').trim();
        if (prevNarrative) {
          next[index] = { ...next[index], description: prevNarrative };
        }
      }
    }

    setValue('lines', next, { shouldValidate: true, shouldDirty: true });
    clearMirroredAmountDraft(index, side, lines.length);
  };

  const handleAddLine = () => {
    const prevIndex = lines.length - 1;
    const lastLine = lines[prevIndex];
    const prevNarrative = String(lastLine?.description || '').trim();

    let initialDebit = 0;
    let initialCredit = 0;
    if (lastLine && (lastLine.debitAmount || 0) > 0) {
      initialCredit = lastLine.debitAmount || 0;
    } else if (lastLine && (lastLine.creditAmount || 0) > 0) {
      initialDebit = lastLine.creditAmount || 0;
    }

    const newLine: JournalEntryFormValues['lines'][number] = {
      accountCode: '',
      debitAmount: initialDebit,
      creditAmount: initialCredit,
      taxAmount: 0,
      description: prevNarrative,
      costCentre: String(lastLine?.costCentre || ''),
      catalogServiceKey: '',
    };

    let next = [...lines.map((ln) => ({ ...ln })), newLine];

    if (lastLine?.accountCode) {
      next = applyCounterpartToNextLine(next, prevIndex);
      const newIdx = next.length - 1;
      if (prevNarrative) {
        next[newIdx] = { ...next[newIdx], description: prevNarrative };
      }
    }

    replace(next);
    setValue('lines', next, { shouldValidate: true, shouldDirty: true });
  };

  const onDebitChange = (index: number, value: number) => {
    applyLineAmount(index, 'debit', value);
  };

  const onCreditChange = (index: number, value: number) => {
    applyLineAmount(index, 'credit', value);
  };

  const onPaymentMethodSelect = (index: number, accountCode: string) => {
    onAccountChange(index, accountCode);
  };

  const clearAmountDraft = (key: string) => {
    setAmountDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const amountDisplay = (side: 'debit' | 'credit', index: number, amount: number) => {
    const key = `${side}:${index}`;
    if (key in amountDrafts) return amountDrafts[key];
    return formatAmountDisplay(amount);
  };

  const onDebitInput = (index: number, raw: string) => {
    const cleaned = sanitizeAmountInput(raw);
    setAmountDrafts((prev) => ({ ...prev, [`debit:${index}`]: cleaned }));
  };

  const onCreditInput = (index: number, raw: string) => {
    const cleaned = sanitizeAmountInput(raw);
    setAmountDrafts((prev) => ({ ...prev, [`credit:${index}`]: cleaned }));
  };

  const commitAmountDraft = (side: 'debit' | 'credit', index: number) => {
    const key = `${side}:${index}`;
    setAmountDrafts((prev) => {
      if (!(key in prev)) return prev;
      const value = parseAmountInput(prev[key]);
      requestAnimationFrame(() => {
        if (side === 'debit') onDebitChange(index, value);
        else onCreditChange(index, value);
      });
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const onAmountFocus = (side: 'debit' | 'credit', index: number, amount: number) => {
    const key = `${side}:${index}`;
    setAmountDrafts((prev) => {
      if (key in prev) return prev;
      return { ...prev, [key]: amount > 0 ? String(amount) : '' };
    });
  };

  const onAmountBlur = (side: 'debit' | 'credit', index: number) => {
    commitAmountDraft(side, index);
  };

  const blockNonNumericKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const allowed = ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (allowed.includes(e.key)) return;
    if (e.key === '.' && !e.currentTarget.value.includes('.')) return;
    if (/^\d$/.test(e.key)) return;
    e.preventDefault();
  };

  const cancelSuggestionBlur = () => {
    if (suggestionBlurTimer.current) {
      clearTimeout(suggestionBlurTimer.current);
      suggestionBlurTimer.current = null;
    }
  };

  const applyAccountFromSearch = useCallback(
    (index: number, match: JournalAccountLike, narrativeText: string) => {
      cancelSuggestionBlur();
      let next = lines.map((ln, i) => {
        if (i !== index) return ln;
        return {
          ...ln,
          accountCode: match.code,
          description: narrativeText.trim() || match.label,
          catalogServiceKey: '',
        };
      });

      next = syncLineSideLock(next, index);
      const side = resolveLinePostingSide(index, next[index], journalCode, next, accountsByCode);
      if (side === 'credit' && isHospitalRevenueAccount(match.code)) {
        next = applyCatalogToLine(next, index, match.code);
      }
      if ((next[index].creditAmount || 0) > 0 && index + 1 < next.length) {
        next = applyCounterpartToNextLine(next, index);
      }

      clearNarrativeDraft(index);
      setSuggestionLine(null);
      setValue('lines', next, { shouldValidate: true, shouldDirty: true });
      focusNarrative(index);
    },
    [
      lines,
      syncLineSideLock,
      journalCode,
      accountsByCode,
      applyCatalogToLine,
      applyCounterpartToNextLine,
      clearNarrativeDraft,
      setValue,
      focusNarrative,
    ]
  );

  const onNarrativeChange = (index: number, text: string) => {
    setNarrativeDrafts((prev) => ({ ...prev, [index]: text }));
    const currentAccount = String(lines[index]?.accountCode || '').trim();
    if (!currentAccount) {
      setSuggestionLine(index);
      setSuggestionHighlight(0);
    }
  };

  const onNarrativeFocus = (index: number) => {
    cancelSuggestionBlur();
    const line = lines[index];
    setNarrativeDrafts((prev) => {
      if (index in prev) return prev;
      return { ...prev, [index]: line?.description || '' };
    });
    const currentAccount = String(line?.accountCode || '').trim();
    if (!currentAccount) {
      setSuggestionLine(index);
    }
  };

  const onNarrativeBlur = (index: number) => {
    suggestionBlurTimer.current = setTimeout(() => {
      setSuggestionLine((cur) => (cur === index ? null : cur));
      setNarrativeDrafts((drafts) => {
        if (index in drafts) {
          setValue(`lines.${index}.description`, drafts[index], {
            shouldDirty: true,
            shouldValidate: true,
          });
          const next = { ...drafts };
          delete next[index];
          return next;
        }
        return drafts;
      });
    }, 160);
  };

  const onNarrativeKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
    suggestions: JournalAccountLike[]
  ) => {
    if (!suggestions.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestionHighlight((h) => Math.min(h + 1, suggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestionHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter' && suggestionLine === index) {
      e.preventDefault();
      const pick = suggestions[Math.min(suggestionHighlight, suggestions.length - 1)];
      if (pick) {
        const text = narrativeDrafts[index] ?? lines[index]?.description ?? '';
        applyAccountFromSearch(index, pick, text);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setSuggestionLine(null);
    }
  };

  const narrativeDisplayValue = (index: number, line: JournalEntryFormValues['lines'][number]) => {
    if (index in narrativeDrafts) return narrativeDrafts[index];
    return line.description || '';
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
          ? 'Type in Narrative to search — suggestions appear beside the field. Pick one to set GL account; then edit Narrative freely without filtering.'
          : 'Saisissez le libellé pour rechercher — les suggestions s’affichent à côté. Choisissez pour définir le compte GL ; le libellé reste modifiable sans filtre.'}
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
              const accountLocked = Boolean(String(line.accountCode || '').trim());
              const narrativeValue = narrativeDisplayValue(index, line);
              const showSuggestions =
                !accountLocked && suggestionLine === index && narrativeValue.trim().length >= 2;
              const lineSuggestions = showSuggestions
                ? suggestionsForLine(index, narrativeValue)
                : [];

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
                  <tr className="group jem-lt-row">
                    <td className="jem-lt-col-account">
                      <div className="jem-lt-account-cell">
                        <span className="jem-lt-line-num" aria-hidden>
                          {index + 1}
                        </span>
                        <div className="jem-lt-account-main">
                          <select
                            className={`jem-lt-account-select${line.accountCode ? ' jem-lt-account-select--picked' : ''}`}
                            value={line.accountCode || ''}
                            title={acct ? `${acct.code} — ${acct.label}` : undefined}
                            onChange={(e) => onAccountChange(index, e.target.value)}
                          >
                            <option value="">
                              {isEn ? 'Select…' : 'Choisir…'}
                            </option>
                            {lineOptions.map((a) => (
                              <option key={a.code} value={a.code} title={a.label}>
                                {line.accountCode === a.code ? a.code : `${a.code} — ${a.label}`}
                              </option>
                            ))}
                          </select>
                          {acct ? (
                            <span className="jem-lt-account-label" title={acct.label}>
                              {acct.label}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {errors.lines?.[index]?.accountCode && (
                        <span className="jem-lt-line-err">{errors.lines[index]?.accountCode?.message}</span>
                      )}
                    </td>
                    <td className="jem-lt-col-narrative">
                      <div className="jem-lt-narrative-wrap">
                        <input
                          ref={(el) => {
                            narrativeRefs.current[index] = el;
                          }}
                          className="jem-lt-narrative"
                          value={narrativeValue}
                          onChange={(e) => onNarrativeChange(index, e.target.value)}
                          onFocus={() => onNarrativeFocus(index)}
                          onBlur={() => onNarrativeBlur(index)}
                          onKeyDown={(e) => onNarrativeKeyDown(index, e, lineSuggestions)}
                          placeholder={
                            isEn
                              ? 'Search or describe — e.g. Payroll'
                              : 'Rechercher ou décrire — ex. Paie'
                          }
                          autoComplete="off"
                          spellCheck={false}
                          aria-autocomplete="list"
                          aria-expanded={showSuggestions && lineSuggestions.length > 0}
                          aria-controls={showSuggestions ? `jem-suggest-${index}` : undefined}
                        />
                        {showSuggestions ? (
                          <div
                            id={`jem-suggest-${index}`}
                            className="jem-lt-suggestions"
                            role="listbox"
                            aria-label={isEn ? 'GL account matches' : 'Comptes GL correspondants'}
                          >
                            {lineSuggestions.length === 0 ? (
                              <p className="jem-lt-suggestions__empty">
                                {isEn ? 'No matching accounts' : 'Aucun compte'}
                              </p>
                            ) : (
                              lineSuggestions.map((a, si) => (
                                <button
                                  key={a.code}
                                  type="button"
                                  role="option"
                                  aria-selected={si === suggestionHighlight}
                                  className={`jem-lt-suggestion${si === suggestionHighlight ? ' jem-lt-suggestion--active' : ''}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    cancelSuggestionBlur();
                                  }}
                                  onMouseEnter={() => setSuggestionHighlight(si)}
                                  onClick={() => applyAccountFromSearch(index, a, narrativeValue)}
                                >
                                  <span className="jem-lt-suggestion__code">{a.code}</span>
                                  <span className="jem-lt-suggestion__label">{a.label}</span>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
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
                    <td className="jem-lt-col-amt">
                      <input
                        ref={(el) => {
                          amountRefs.current[`debit:${index}`] = el;
                        }}
                        className={`jem-lt-mono jem-lt-amt${!debitEnabled ? ' jem-lt-disabled' : ''}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        spellCheck={false}
                        value={amountDisplay('debit', index, line.debitAmount || 0)}
                        placeholder={debitEnabled ? '0.00' : ''}
                        disabled={!debitEnabled}
                        readOnly={!debitEnabled}
                        onFocus={() => onAmountFocus('debit', index, line.debitAmount || 0)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onDebitInput(index, e.target.value)}
                        onBlur={() => onAmountBlur('debit', index)}
                      />
                    </td>
                    <td className="jem-lt-col-amt">
                      <input
                        ref={(el) => {
                          amountRefs.current[`credit:${index}`] = el;
                        }}
                        className={`jem-lt-mono jem-lt-amt${!creditEnabled ? ' jem-lt-disabled' : ''}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        spellCheck={false}
                        value={amountDisplay('credit', index, line.creditAmount || 0)}
                        placeholder={creditEnabled ? '0.00' : ''}
                        disabled={!creditEnabled}
                        readOnly={!creditEnabled}
                        onFocus={() => onAmountFocus('credit', index, line.creditAmount || 0)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onCreditInput(index, e.target.value)}
                        onBlur={() => onAmountBlur('credit', index)}
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
          onClick={handleAddLine}
        >
          <Plus style={{ width: 16, height: 16 }} />
          {t('journal.add_line', isEn ? 'Add line' : 'Ajouter ligne')}
        </button>
        {errors.lines?.root && <div className="jem-err">{errors.lines.root.message}</div>}
      </div>
    </div>
  );
};
