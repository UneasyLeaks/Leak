# UneasyVanilla Coordinate Leak Site

This repository is a static website. It is not malware, it does not install or run anything, it does not grab sessions, it does not log checked coordinates, it does not collect IP addresses, and it does not run visitor analytics (had google analytics briefly but removed now). Additionally google analytics on this site only ever recorded country and number of visits and what pages, and is now completely gone.

## What The Site Does

- Loads static files from this repository, including `coords.txt`, `alts_with_main.txt`, `bans.txt`, screenshots, and Xaero archive parts.
- Renders those files in the browser as tables, charts, downloads, and an interactive coordinate graph.
- Lets a visitor manually submit an optional report/feedback form.

## What The Site Does Not Do

- No malware or executable client is shipped by the website.
- No account/session/token collection exists.
- No coordinate checks are submitted anywhere.
- No IP logging code exists in the site JavaScript.
- No analytics, tracking pixels, `sendBeacon`, WebSocket, or hidden background POST requests are used.
- No browser geolocation API is used.

## How To Verify It Yourself

1. Open the source files in this repository:
   - `index.html`, `intel.html`, and `xaero.html` define the pages.
   - `script.js` powers the coordinate graph, local leak checker, gallery, and report form.
   - `intel.js` powers the alts and bans page.
   - `styles.css` is only styling.
2. Search for network APIs:
   ```sh
   rg "fetch\\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\\.sendBeacon|geolocation|localStorage|reportEndpointUrl" .
   ```
3. Confirm the expected results:
   - `script.js` fetches `coords.txt`, which is a static local file for the graph and local leak checker.
   - `intel.js` fetches `alts_with_main.txt` and `bans.txt`, which are static local files for display.
   - `script.js` contains one POST endpoint, `reportEndpointUrl`, used only by `submitReport(reportPayload)`.
4. Check the local coordinate checker:
   - In `script.js`, `checkLeakCoordinate(event)` compares typed X/Z values with the already-loaded `coords.txt` data.
   - That function does not call `fetch`, does not build `FormData`, and does not send the checked coordinate anywhere.
5. Check the report form:
   - `handleReportSubmit(event)` builds a report only after the visitor presses `Send Report`.
   - `submitReport(reportPayload)` is the only code path that posts to the Worker.
   - The payload is made from form fields plus an optional proof image.
6. Confirm there is no IP logging in this repo:
   ```sh
   rg -i "ip|address|cf-connecting-ip|x-forwarded-for|remote_addr|analytics|tracking|pixel" .
   ```
   Any IP address visible to a static host or CDN would be handled by that host's normal server logs, not by code in this repository.

## Local Review

Because the site is static, you can review it without running a backend:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Use your browser devtools Network tab to verify that normal browsing only loads local static files. The only POST should happen when you intentionally submit the report form.
>>>>>>> a05beab (Transparency!)
