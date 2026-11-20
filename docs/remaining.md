# Remaining work from 80% to final submission

These owners and dates are a prepared draft. The team should confirm them together during the checkpoint.

| Priority | Task | Owner | Target date | Done when |
| --- | --- | --- | --- | --- |
| P0 | Collect and label phone-camera hard negatives and partial-body positives | Kristel / maaxzxz | 2026-11-23 | At least 300 reviewed examples with source IDs |
| P0 | Train/tune the next candidate using train/validation only | Kristel / maaxzxz | 2026-11-25 | Candidate config, weights, and validation log committed |
| P0 | Freeze candidate and rerun the untouched test once | Kristel / maaxzxz | 2026-11-26 | New metrics and failure gallery committed |
| P1 | Optimize crop schedule / benchmark mobile and laptop | Shaine Macatangay | 2026-11-25 | Warm-up excluded; device and FPS documented |
| P1 | Run all live cases plus teacher inputs and record results | Team | 2026-11-27 | CSV updated; failures retained |
| P1 | Replace generated backup with narrated end-to-end screen recording | Shaine Macatangay | 2026-11-27 | Recording opens and shows interface + evaluator |
| P2 | Final report, references, slide polish, and repository audit | Team | 2026-11-29 | Fresh clone passes README steps |

## Risks

- Collecting more of the same public CCTV imagery will not solve phone-camera false positives.
- Lowering the threshold may improve recall while increasing objects/body-part false positives.
- The locked test must remain untouched during tuning to preserve a valid final comparison.
