# Phase 8: DGI Cameroon Certification Guide

## Overview

This document outlines the steps required to certify the OHADA Comptabilité application
with the **Direction Générale des Impôts (DGI) du Cameroun** and ensures the system
is ready for **e-invoicing (e.billing)** integration with the ANOR/DGI platform.

---

## 8.1 Legal Framework

| Regulation | Description |
|---|---|
| **OHADA Acte Uniforme** | Uniform Act on the Organisation and Harmonisation of Business Laws |
| **SYSCOHADA Révisé 2017** | Revised chart of accounts and financial statement formats |
| **Loi de Finances Cameroun** | Annual Finance Law setting IS (30%/27.5%), TVA (19.25%), IMF rates |
| **CGI (Code Général des Impôts)** | Cameroonian General Tax Code |
| **ANOR Standard** | Technical standard for electronic invoicing (NF ISO 21926) |

---

## 8.2 Tax Compliance Checklist

### Corporate Income Tax (IS)
- [x] **Rate 30%** applied to taxable income for standard enterprises
- [x] **Rate 27.5%** applied for large enterprises (turnover ≥ 3 billion FCFA or registered at DGE)
- [x] **Minimum Forfaitaire Tax (IMF)**: max(1% of turnover, 100,000 FCFA) — applied when IS < IMF
- [x] Tax calculation API endpoint: `GET /api/tax/calculate?fiscalYear=&companyId=`

### VAT (Taxe sur la Valeur Ajoutée — TVA)
- [x] **Rate: 19.25%** (17.5% TVA + 1.75% CAC surcharge)
- [x] Collected on gross revenue from operations
- [x] TVA amount reported in tax calculation result

### E-invoicing Readiness (Phase 8 — Ongoing)
- [ ] **ANOR certification**: Submit application to Agence des Normes et de la Qualité
- [ ] **DGI e.billing API**: Integrate with `https://billing.impots.cm/api/` for electronic invoice submission
- [ ] **QR Code generation**: Add QR code to PDF invoices linking to DGI verification portal
- [ ] **XML invoice format**: Generate UBL 2.1 or ANOR-compliant XML for each invoice
- [ ] **Digital signature**: Apply server-side PKCS#12 certificate to signed PDFs

---

## 8.3 Financial Statement Requirements (SYSCOHADA)

The following mandatory reports must be produced annually:

| Report | Endpoint | PDF Export | Excel Export |
|---|---|---|---|
| Balance Sheet (Bilan) | `GET /api/reports/balance-sheet` | ✅ | ✅ |
| Income Statement (Compte de Résultat) | `GET /api/reports/income-statement` | ✅ | ✅ |
| Cash Flow Statement (Tableau des Flux) | `GET /api/reports/cash-flow` | ✅ | ✅ |
| Trial Balance (Balance de Vérification) | `GET /api/reports/trial-balance` | ✅ | ✅ |
| Notes Annexes | `GET /api/reports/notes` | ✅ | — |

---

## 8.4 Audit Trail Requirements

The `report_access_logs` table records every report access per OHADA audit requirements:

```sql
SELECT * FROM report_access_logs
WHERE company_id = '<uuid>'
ORDER BY accessed_at DESC;
```

Fields logged: `user_id`, `company_id`, `report_type`, `action` (view/export_pdf/export_excel),
`ip_address`, `user_agent`, `accessed_at`.

---

## 8.5 Deployment for DGI Submission

### Minimum Infrastructure Requirements
- **Hosting**: Cameroonian data centre or cloud region (avoid data sovereignty issues)
  - Recommended: Rack Centre Lagos / MTN Business Cameroon Cloud
- **Database**: PostgreSQL 15+ with daily encrypted backups (AES-256)
- **TLS**: SSL/TLS 1.3 certificate (Let's Encrypt or ANOR-issued CA)
- **Uptime**: 99.5% SLA for DGI audit access

### Docker Production Launch
```bash
# Copy and configure environment variables
cp .env.example .env
# Edit .env with your production secrets

# Start all services
docker compose up -d

# Verify health
docker compose ps
curl http://localhost:8080/health
```

### Environment Variables (.env)
```
DB_PASSWORD=<strong-password>
JWT_KEY=<256-bit-random-key>
```

---

## 8.6 DGI Submission Steps

1. **Register** the software at the DGI: fill Form IMP-2024 (Déclaration de Logiciel de Comptabilité)
2. **Submit**: Source code audit + API documentation to DGI's technical directorate
3. **Testing**: DGI runs acceptance tests on a demo environment
4. **Certificate**: Issued a "Certificat de Conformité Fiscale" valid for 3 years
5. **Renewal**: Annual tax return integration test required

> **Contact**: Direction Générale des Impôts · dgi@finances.gov.cm · +237 222 22 31 00

---

## 8.7 Next Steps (Roadmap)

| Priority | Task | Effort |
|---|---|---|
| 🔴 High | ANOR e-billing API integration | 3 weeks |
| 🔴 High | QR code on PDF invoices | 1 week |
| 🟡 Medium | UBL 2.1 XML invoice export | 2 weeks |
| 🟡 Medium | Digital signature (PKCS#12) on PDFs | 1 week |
| 🟢 Low | Multi-currency support (EUR, USD, XAF) | 2 weeks |
| 🟢 Low | Mobile app (React Native) for field agents | 6 weeks |
