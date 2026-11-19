# Reno Quote Comparer

Plan, find and compare an HDB renovation, in three steps:

1. **Plan & budget**: pick your flat type, adjust what you want done, and get an itemised cost range from published Singapore price guides, with a reality check against typical whole-project costs.
2. **Find firms**: search HDB-registered renovation firms by the BCA trades they're registered for (interior works, electrical, plumbing, waterproofing, aircon), see which are CaseTrust-accredited, and build a shortlist with contact details and status.
3. **Compare quotes**: put every quote into the same categories, spot items one firm left out and prices far from the others or above your estimate, and vote with your partner.

Data stays in your browser. Share with your partner by exporting a file; they import it and quotes, shortlist, plan and votes merge.

**Live:** https://dylantzx.github.io/reno-quote-comparer/

## Data sources

| Data | Source | Used for |
|---|---|---|
| HDB Directory of Renovation Contractors | [data.gov.sg](https://data.gov.sg) | Base list of firms allowed to renovate HDB flats; checking quoted firms |
| BCA Listing of Registered Contractors | [data.gov.sg](https://data.gov.sg) | Trades each firm is registered for (joined by UEN) |
| CaseTrust accredited renovation businesses | [case.org.sg](https://casetrust.case.org.sg/Home/casetrustlist) | Accreditation badge (joined by name or postal code) |
| Renovation price guides | SmartCalculator.sg, Seedly, Qanvast and others (listed in the app) | Cost ranges in the plan |

Firms are shown as **eligible and accredited, not rated**. BCA grades reflect financial capacity, not quality. Price ranges are a sense-check, not quotes.

`scripts/build-vendors.js` joins the firm data into `public/data/vendors.json`. GitHub Actions re-runs it every Monday and on every deploy.

## Run locally

```bash
npm start
```

Then open http://localhost:3000. No dependencies. Other commands:

- `npm test` runs the tests
- `npm run build-data` refreshes the firm directory

## Deploy

Every push to `main` (and every Monday) runs the tests, refreshes the firm data and publishes `public/` to GitHub Pages.
