# Website and Android recap — 14 October 2026

Both clients use the same Express backend, SQLite database, evidence records and versioned cases. This remains a single-owner private pilot, not a multi-account service.

| Area | Website | Android |
| --- | --- | --- |
| Interface | React/Vite browser application | Dedicated React interface packaged with Capacitor |
| Capture | Live photo/video, mandatory location | Live photo/video, mandatory location |
| Imports | No gallery or PDF deposits | No gallery or PDF deposits |
| Evidence | SHA-256, signed manifests, versions, PDF/ZIP exports | Shared backend evidence and certification views |
| Sessions | Browser cookies | Separate Bearer session held in memory; login again after restart |
| Recovery | Server records | Local IndexedDB drafts after online commitment; upload within 24 hours and the same session |
| Export | Browser downloads | Native sharing; 32 MB mobile export limit |
| Additional tools | File comparison, directory, private links, external signature requests | Timestamp/anchor requests, Bitcoin verification and .ots sharing |
| Distribution | Local website; public deployment not verified | Debug APK documented; physical-device validation and signed release pending |

Neither client supports starting a certifiable capture entirely offline. Pending external requests do not count as validated timestamps or signatures. Premium demonstrations do not establish that a professional service is available.

## Recommended order

1. Validate the Android debug APK on a real phone: photo/video, GPS refusal, end-of-video GPS, interrupted uploads, reconnect recovery, native export, rotation and Back navigation. Record device/OS and results.
2. Confirm parity against the same backend: create a case on each client, open it on the other, compare hashes and version-specific certification receipts, and verify exports.
3. Prepare a private HTTPS pilot with persistent storage, a tested backup/restore procedure and a stable backend address. Preserve the single-owner scope.
4. Validate configured external services with real receipts before making availability claims. Keep pending/unavailable states explicit.
5. Configure release signing and build a production Android bundle against the HTTPS backend. Keep signing material out of source control.
6. Prioritize streaming large Android exports and clearer draft expiry/reconnection guidance. Add multi-user access only after designing ownership and authorization boundaries.

## Website update in this review

The homepage now describes live photo/video capture instead of choosing an existing photo, and includes a website/Android comparison with availability and practical limits. The README introduction no longer describes Android imports or optional GPS.

See [Android setup and validation](../README_ANDROID.md) for the existing build results and remaining native-device checks. Those recorded results are separate from checks rerun during this review.
