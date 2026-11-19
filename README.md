# Reno Quote Comparer

Compare renovation quotes like-for-like. Put every interior designer and contractor quote into the same categories, spot items one firm left out and prices far from the others, check each firm against the HDB Directory of Renovation Contractors, and decide together with your partner.

Built as a Stage 1 proof of concept for one couple planning a BTO renovation.

## Features

- **Side-by-side comparison** of quotes across 11 standard categories, with totals
- **Gap flags**: "Not quoted: ask" when another firm included a category this one didn't
- **Price flags**: 30%+ above or below the middle price for that category
- **HDB directory check** using live open data from [data.gov.sg](https://data.gov.sg) (downloaded once a week and matched in the browser)
- **Votes** ("prefer / unsure / no") per person
- **Sharing without accounts**: data stays in your browser; export a file and your partner imports it, and quotes, edits and votes merge

## Run locally

```bash
npm start
```

Then open http://localhost:3000. No dependencies to install. Run the tests with `npm test`.

## Deploy

Every push to `main` runs the tests and publishes the `public/` folder to GitHub Pages (`.github/workflows/pages.yml`).

## Sample quotes

`samples/` holds three made-up quotes in different formats (itemised, packages, WhatsApp) for trying the app.
