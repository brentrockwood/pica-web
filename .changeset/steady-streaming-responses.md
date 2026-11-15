---
"@jmfederico/pi-web": patch
---

Improve streaming responsiveness in long conversations by avoiding repeated session statistics scans, combining adjacent text updates, and reusing unchanged message data. Keep new prose appearing during continuous streaming without replacing completed code controls, and bound Markdown cache memory.
