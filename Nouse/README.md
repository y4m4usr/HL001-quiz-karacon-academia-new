Nouse (Not In Use)

- Purpose: Store files currently not used by the app so they are excluded from deployment/runtime and don’t get accidentally referenced.
- Policy: Anything moved here is considered disabled. For code files, add a hard guard that throws if the file is ever loaded.

Conventions

- For JavaScript/Apps Script (`.gs`/`.js`) files, add at the top:
  - `(function(){ throw new Error("[Nouse] <file> is deprecated and must not be used."); })();`
- Only re-enable by moving the file back to its original location and removing the guard in a reviewed PR.
- Binary/assets can be placed here without code guards.

Current Items

- `QuizLogic.UNUSED.gs`: Legacy quiz logic (superseded by `DataAccess.generateQuestions_`). Guarded to throw if loaded.
- `assets/fonts/*`: Local NotoSansJP font files are not referenced by `gas/index.html` (uses Google Fonts), so they’ve been moved out of `gas/`.
- `large/lens_images.zip`: Local archive of images; not required at runtime.
- `large/docs/`: Documentation and exported lists; not required at runtime.
- `large/quarantine/`: Quarantined lens/samune images; excluded from runtime.
- `large/logs/`: Restore logs; not required by the app.
- `large/image_processing_failures.csv`: Large CSV used for offline analysis only.
- `large/manual_fix_queue.csv`: Large CSV used for offline analysis only.
