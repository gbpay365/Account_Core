/** Locale for currency / amount formatting in reports (matches i18n language). */
export function amountLocale(lang: string): string {
  const l = (lang || 'en').toLowerCase();
  return l.startsWith('fr') ? 'fr-FR' : 'en-US';
}
