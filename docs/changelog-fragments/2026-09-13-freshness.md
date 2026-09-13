## 2026-09-13 — catalogue freshness

- Added OpenRouter-backed model catalogue verification with current, attention, unavailable and unknown states.
- Added freshness age and verification notes to the admin Models view.
- Added a manual **Verify catalogue** action and a weekly CRON-backed verification endpoint.
- Added an isolated model-verification DB repository and pure catalogue drift assessor rather than expanding the existing monolithic admin action/database modules.
- Added regression coverage for catalogue drift, disappearance, unmapped models and curated capabilities that OpenRouter cannot observe.
