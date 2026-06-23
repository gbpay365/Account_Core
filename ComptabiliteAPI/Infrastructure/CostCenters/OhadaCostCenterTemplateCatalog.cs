using System.Collections.Generic;

namespace ComptabiliteAPI.Infrastructure.CostCenters
{
    /// <summary>System templates aligned with OHADA classes 1–7; each line can link to a reference GL / sous-compte (plan comptable).</summary>
    public static class OhadaCostCenterTemplateCatalog
    {
        public sealed record TemplateItem(
            string Code,
            byte OhadaClass,
            string Name,
            string? Description,
            /// <summary>Typical compte in the shared chart, e.g. 601, 641, 521.</summary>
            string? RelatedAccountCode);

        public sealed record TemplateInfo(
            string Key,
            string LabelEn,
            string LabelFr,
            string OhadaNote,
            IReadOnlyList<TemplateItem> Items);

        public static IReadOnlyList<TemplateInfo> All { get; } = new List<TemplateInfo>
        {
            new("HOSPITAL", "Hospitals & clinics", "Hôpitaux & cliniques",
                "Classe 6 : achats 601/602, services 61/62, 641 = salaires ; classe 7 (706) — à adapter à votre entité.",
                new TemplateItem[] {
                    new("HOSP-01", 5, "Trésorerie & caisse", "Caisse / banque (cl.5)", "57"),
                    new("HOSP-02", 2, "Immo médicale", "Matériel & bâtiment (cl.2)", "25"),
                    new("HOSP-03", 3, "Stocks & pharmacie", "Stocks consommables (cl.3)", "32"),
                    new("HOSP-04", 4, "Fournisseurs & créances", "Fournisseurs, clients (cl.4)", "401"),
                    new("HOSP-05", 1, "Emplois de fonds", "Emprunts long terme (cl.1)", "16"),
                    new("HOSP-64", 6, "Salaires & social", "Charges de personnel (cl.64x)", "641"),
                    new("HOSP-6001", 6, "Achats pharmacie hôpital", "Achats de marchandises (601)", "601"),
                    new("HOSP-6002", 6, "Fournitures médicales", "Achats matières (602)", "602"),
                    new("HOSP-6003", 6, "Laboratoire & consommables", "Services extérieurs (61)", "61"),
                    new("HOSP-6004", 6, "Restauration & hébergement", "Autres services ext. (62)", "62"),
                    new("HOSP-62", 6, "Énergie & entretien", "Services / charges (cl.62x)", "62"),
                    new("HOSP-70", 7, "Prestations & soins", "Produits d’exploitation (cl.7)", "706"),
                }),
            new("MICROFINANCE", "Microfinance (IMF)", "Microfinance (IMF)",
                "Lien 521/57 (tréso), 411/4xx (portefeuille, dépôts), 7xx (revenus financiers).",
                new TemplateItem[] {
                    new("MFI-01", 5, "Trésorerie & agences", "Vault, nostro, agency cash (cl.5/1)", "57"),
                    new("MFI-40", 4, "Portefeuille crédits", "Comptes clients (cl.4)", "411"),
                    new("MFI-42", 4, "Dépôts & épargne", "Dettes de dépôt (cl.4/5)", "421"),
                    new("MFI-50", 5, "Ressources MFI", "Refinance, dettes (cl.5/16)", "16"),
                    new("MFI-64", 6, "Frais généraux MFI", "G&A, staff (cl.6)", "64"),
                    new("MFI-65", 6, "Gestion des risques", "Provisions (cl.6)", "65"),
                    new("MFI-70", 7, "Intérêts & commissions", "Produits financiers (cl.7)", "701"),
                }),
            new("BANK", "Banking", "Banque",
                "Lien trésorerie, bilan (4/5) et marge d’exploitation (6/7).",
                new TemplateItem[] {
                    new("BNK-01", 5, "Trésorerie interbancaire", "Banques, liquidités (cl.5/1)", "521"),
                    new("BNK-04", 4, "Gestion bilancielle", "Créances, engagements (cl.4)", "411"),
                    new("BNK-50", 5, "Ressources bancaires", "Obligations, interb. (cl.5)", "16"),
                    new("BNK-64", 6, "Exploitation réseau", "Frais de réseau (cl.6)", "64"),
                    new("BNK-65", 6, "Risque & compliance", "Conformité, risque (cl.6)", "65"),
                    new("BNK-70", 7, "Marges & commissions", "Frais, marge (cl.7)", "701"),
                }),
            new("SHOP_RETAIL", "Shops & retail", "Commerces & detail",
                "Achats 601/602, TVA 444, ventes 701, stocks 3x.",
                new TemplateItem[] {
                    new("RTL-30", 3, "Stocks & magasins", "Inventaire (cl.3)", "31"),
                    new("RTL-40", 4, "Clients & fournisseurs", "AR / AP (cl.4)", "401"),
                    new("RTL-60", 6, "Achats marchandises", "Achat 601/602 (cl.6x)", "601"),
                    new("RTL-62", 6, "Loyer & point de vente", "Loyers, POS (cl.6)", "62"),
                    new("RTL-63", 6, "Logistique & marketing", "Frais log. (cl.6)", "63"),
                    new("RTL-70", 7, "Ventes", "Vente marchandise (cl.7)", "701"),
                }),
            new("MED_EQUIP", "Medical equipment", "Fourn. équip. medical",
                "2–3, achats 6, vente 7.",
                new TemplateItem[] {
                    new("MED-02", 2, "Immo & loyers machines", "cl.2", "24"),
                    new("MED-32", 3, "Stocks & pièces", "cl.3", "32"),
                    new("MED-42", 4, "Fourn. & SAV", "cl.4", "401"),
                    new("MED-61", 6, "Logistique", "cl.61", "61"),
                    new("MED-64", 6, "SAV & technique", "cl.64", "64"),
                    new("MED-70", 7, "Ventes dispositifs", "cl.7", "701"),
                }),
            new("SERVICE", "Service provider", "Prestataire de service",
                "Encours, frais 6, honoraires 7.",
                new TemplateItem[] {
                    new("SRV-40", 4, "Encours clients", "WIP, billing (4x)", "411"),
                    new("SRV-66", 6, "Frais de mission", "Travel, subcontract (6x)", "65"),
                    new("SRV-62", 6, "Personnel & bureau", "Staff, IT, rent (6x)", "62"),
                    new("SRV-64", 6, "Projet & support", "Project overheads (6x)", "64"),
                    new("SRV-70", 7, "Honoraires & redevances", "Fees, licences (7x)", "706"),
                }),
            new("FARM", "Farm & agriculture", "Exploitation agricole",
                "2–3–6–7 avec liens 24, 32, 641, 75.",
                new TemplateItem[] {
                    new("FARM-2", 2, "Bâtiments & troupeau", "Herds, structures (2x)", "24"),
                    new("FARM-3", 3, "Cultures & stock", "Crops, feed (3x)", "32"),
                    new("FARM-4", 4, "Coopex & apporteurs", "4x", "401"),
                    new("FARM-60", 6, "Salaires & intrants", "6x, personnel", "641"),
                    new("FARM-65", 6, "Energie & entretien", "6x", "65"),
                    new("FARM-70", 7, "Ventes agro", "7x", "75"),
                }),
            new("FOOD_FACTORY", "Food transformation", "Transformat. alimentaire",
                "31/32/35, charges 6, 701.",
                new TemplateItem[] {
                    new("FDF-31", 3, "Matières premières", "Raw (3x)", "31"),
                    new("FDF-32", 3, "WIP", "WIP (3x)", "32"),
                    new("FDF-35", 3, "Produits finis", "Finished (3x)", "35"),
                    new("FDF-6P", 6, "Coût production", "6x", "64"),
                    new("FDF-63", 6, "Conditionnement", "6x", "63"),
                    new("FDF-70", 7, "Ventes alimentaires", "7x", "701"),
                }),
        };
    }
}
