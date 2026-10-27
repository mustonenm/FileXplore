# Changelog

All notable changes to FileXplorer are documented here.

## [2.0.4] - 2026-10-27
- Fixed `serve-dist.js` failing to start: converted to ES module syntax (root package is `"type": "module"`) and updated the catch-all route to Express 5 syntax (`/{*splat}`).
- Removed unused `cors` and `body-parser` dependencies from the frontend `package.json` (they remain in `server/package.json`).

## [2.0.3] - 2026-10-23
- Security: ran `npm audit fix` on the server dependencies to resolve reported vulnerabilities (updated `server/package-lock.json`).

## [2.0.2] - 2026-10-08
- Added `ForceConvertToUTF8` config option: files whose extension is listed are converted to UTF-8 before transfer (BOM-aware, with Windows ANSI/CP1252 and UTF-16 fallback). An empty or missing list disables conversion.
- Added a Refresh button to reload the current folder without leaving it.
- Fixed the Home button doing nothing when already at the default path; it now always reloads.

## [2.0.1] - 2026-09-30
- FileXplore version shown only 1 second

## [2.0.0] - 2026-09-25

- Added a version display showing FileXplore for five seconds.
- Modified ftp to chunked HTTPS file uploads (works in arsim also)
- Added filename header sanitization for PLC-compatible transfers.
- Added configurable file browsing and transfer settings.