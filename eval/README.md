# Evaluation tooling

Scripts to measure the models in CVPilot. **They only ever print numbers they computed from data you give them.**
When an input file is missing they say so and exit with code 2; nothing is fabricated or defaulted.

```bash
pip install -r ml-service/requirements.txt -r eval/requirements.txt
cd eval
```

## (a) Scam classifier on EMSCAD: `train_scam_classifier.py`

Input: the EMSCAD "Real / Fake Job Posting" CSV, placed at `eval/data/fake_job_postings.csv` (this directory is git-ignored).
EMSCAD is distributed on Kaggle ("Real / Fake Job Posting Prediction") and on the Hugging Face hub
(`victor/real-or-fake-fake-jobposting-prediction`, CC0). Download it yourself and put it there.

```bash
python train_scam_classifier.py            # trains, evaluates, writes ml-service/models/*
python train_scam_classifier.py --no-save  # evaluate only
```

What it does (every choice is made on the validation split; the test split is used once, at the end):

1. Stratified 60/20/20 train/validation/test split (`--seed`, default 42).
2. TF-IDF (1-2 grams) + logistic regression, `class_weight="balanced"`; regularisation `C` chosen on validation AUC-PR.
3. Rule score `rho` from the same rules the service uses (`ml-service/app/data/scam_rules.json`).
4. Fusion weight `w_r` (and `w_c = 1 - w_r`) chosen on validation AUC-PR of `r = w_r*rho + w_c*P_clf`.
5. Thresholds: `theta2` = F1-optimal cut on validation; `theta1` = highest cut with validation recall >= 0.90.
6. Test report, fraud class positive: precision, recall, F1, AUC-ROC, AUC-PR for **rule-only**, **classifier-only**,
   **hybrid (plain formula)** and **hybrid + rule floor** (the deployed variant), plus fraud rates per deployed band.

Outputs in `ml-service/models/` (git-ignored): `scam_clf.joblib`, `scam_settings.json` (tuned `theta1`, `theta2`, `w_r`,
read by the service automatically), `scam_clf.metrics.json`.

The text used is `title + description + requirements + benefits`. `company_profile` is **excluded on purpose**: job-board
snippets (what the app gets from Adzuna) have no such field, so training on it would not transfer.

### Results from the run documented in the README

See the README's "Evaluation results" section. They were produced by exactly this script on the Hugging Face copy of EMSCAD
(17,880 rows, 866 fraudulent). Re-run it on your copy to reproduce; small differences are possible if your copy differs.

## (b) ATS score vs human ratings: `ats_correlation.py`

Input CSV (you create it; columns configurable with `--resume-col`, `--job-col`, `--rating-col`):

| resume_text | job_text | human_score |
| --- | --- | --- |
| full resume text | full job description | any numeric rating of fit, e.g. 1-5 |

```bash
python ats_correlation.py --csv data/ats_human_ratings.csv
```

Prints the Spearman correlation (and p-value) of the CVPilot ATS score (`all-MiniLM-L6-v2` by default, `EMBEDDING_MODEL`
to change) and two baselines: TF-IDF cosine and token-overlap (Jaccard). Needs at least 10 rows.

## (c) Ranking quality: `ranking_metrics.py`

Input CSV (you create it):

| query_id | doc_id | score | relevance |
| --- | --- | --- | --- |
| profile-1 | job-17 | 0.83 | 3 |

`score` is the system's score (higher ranks first); `relevance` is your judgement (0 = irrelevant, graded 0-3 works well).

```bash
python ranking_metrics.py --csv data/job_relevance.csv --k 5 10 --relevant-threshold 1
```

Prints mean P@K and nDCG@K over queries (linear gain, log2 discount; queries with no relevant item are skipped for nDCG).

## Tests

`python -m pytest -q` in `eval/` checks the metric maths against hand-computed values, the missing-data messages and that
each script runs end to end on **tiny synthetic fixtures**. Those fixtures only prove the code runs; their output says
nothing about model quality and is never reported as a result.
