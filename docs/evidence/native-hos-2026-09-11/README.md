# Native HOS evidence — September 11, 2026

Accepted bounded packet: expose reviewed driver HOS evidence and preserve synthetic duty occurrence time in the Android release. Scope mobile only; main authorized; 30-minute ceiling, no new resources/model spend, maximum two repairs. Third visual pass retained.

The API35 emulator displayed the driver-owned reviewed profile without an assignment: revision 2, source/reviewer, operator day, shift, rest requirement and remaining budgets. A fresh shift has 780 driving minutes but zero cycle allowance. Screenshots were inspected directly. Airplane mode plus Wi-Fi/data disabled and force-stop/reopen retained the dated SQLite snapshot and explicit offline warning. Network restored afterward.

The first synthetic action was correctly prevented because driver snapshots withhold dispatcher scenario records. The correction uses the driver's server-evaluated HOS `budgetAsOf` when scenario records are unavailable. Missing/invalid evidence still fails closed. A rebuilt release recorded `on_duty` through the native UI; Firebase API readback confirms exactly one event at September 13 12:00 UTC, driver version 4, reviewed revision 2 and cycle allowance still zero. No wall-clock September 11 duty event was written. Source `server.json` preserves that readback.

Verification: native TypeScript passed; 32 native tests passed, zero skipped; ARM64/x86_64 release build and install succeeded. Online/offline captures precede the final clock fallback repair; final `duty-synchronized.png` is from the rebuilt release. UI source was unchanged by that repair. APK SHA256 is in verification.json. Local web returned HTTP 200 at localhost:5174.

Limitations: emulator proof only; physical Android/iOS explicitly deferred. These are planning clocks, not certified ELD records or driving permission. Unsupported/incomplete synthetic HOS without a usable evaluated timestamp cannot record a guessed occurrence. No new API/cloud deployment or media redesign. Next: native dispatcher approval parity, remaining scenario acceptance and measured demo alignment.
