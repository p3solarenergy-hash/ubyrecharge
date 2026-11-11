const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "docs", "nova", "sw.js"), "utf8");
const start = worker.indexOf('self.addEventListener("notificationclick"');
assert(start >= 0, "missing notification click handler");
const handler = worker.slice(start);

// A WhatsApp/push notification may arrive while the operator is working in any
// screen. Clicking it must focus that window, not change its hash to Envios.
assert.match(handler, /if \(!open\) return self\.clients\.openWindow\(url\);/,
  "the notification must still open the relevant route when the app is closed");
assert.match(handler, /return open\.focus\(\);/,
  "an already-open UBY window must only be focused");
assert.doesNotMatch(handler, /\.navigate\(url\)/,
  "a notification must not navigate an active UBY session away from its current screen");

console.log("WhatsApp notification background-navigation tests ok");
