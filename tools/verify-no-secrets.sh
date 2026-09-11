#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Proves the acceptance criterion: "No business logic, formulas or
#  secrets appear in the browser bundle."
#
#  Greps everything this site actually serves for (a) the coefficients and
#  formulas that make up the proprietary model, and (b) anything shaped like
#  a private credential. Exits non-zero on any hit.
#
#  Run:  bash tools/verify-no-secrets.sh
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")/.."

# Everything served to a browser, minus vendored third-party libraries
# (Chart.js and supabase-js are public MIT code, not our logic).
FILES=$(find . \
  -path ./.git -prune -o \
  -path ./assets/vendor -prune -o \
  -path ./docs -prune -o \
  -path ./node_modules -prune -o \
  \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name '*.json' \) -print)

fail=0
check() {
  local label="$1"; shift
  local pattern="$1"; shift
  local hits
  hits=$(grep -rniE "$pattern" $FILES 2>/dev/null | grep -v 'verify-no-secrets' || true)
  if [ -n "$hits" ]; then
    printf '  ✖ %-42s FOUND\n' "$label"
    echo "$hits" | head -5 | sed 's/^/        /'
    fail=1
  else
    printf '  ✔ %-42s absent\n' "$label"
  fi
}

echo "── Proprietary model: regression coefficients ──────────────"
# The exact constants from the BSR estimate model.
check "badge-anchored intercept (2.637617154)" '2\.6376171'
check "bsr-regression intercept (6.424250557)" '6\.4242505'
check "rank coefficient (-0.28777473)"         '0\.2877747'
check "review coefficient (0.23086161)"        '0\.2308616'
check "price coefficient (-0.42218872)"        '0\.4221887'
check "family coefficient (-0.70887953)"       '0\.7088795'
check "badge coefficient (0.86298248)"         '0\.8629824'

echo
echo "── Proprietary model: formula shapes ───────────────────────"
check "Math.exp( ... Math.log(rank) ... )"     'Math\.exp\([^)]*Math\.log'
check "opportunity score derivation"           'opportunityScore\s*[:=]\s*[^,;}]*[/*]'
check "HHI derivation"                         'Math\.pow\([^,]*share[^,]*,\s*2\)|hhi\s*=\s*[^;]*reduce'
check "market-share derivation"                'share\s*=\s*[^;=]*\/\s*total'

echo
echo "── Credentials ─────────────────────────────────────────────"
check "service_role key"                       'service_role'
check "sb_secret_ key"                         'sb_secret_'
check "SUPABASE_SERVICE_ROLE_KEY"              'SUPABASE_SERVICE_ROLE_KEY'
check "generic private key block"              'BEGIN (RSA |EC )?PRIVATE KEY'
check "bearer token literal"                   'Bearer [A-Za-z0-9._-]{40,}'

echo
echo "── Confirming the client only ASKS for these numbers ───────"
printf '  research API call sites:\n'
grep -rn "callFunction('research'" assets/js/api.js | sed 's/^/        /'
printf '  scored fields are read, never computed:\n'
grep -rno "bsrEstimatedRevenueMid\|opportunityScore\|\.hhi\|\.share" assets/js/views/*.js \
  | awk -F: '{print $1}' | sort | uniq -c | sed 's/^/        /'

echo
if [ "$fail" -eq 0 ]; then
  echo "PASS — no model coefficients, no derived formulas, no secrets in anything served."
else
  echo "FAIL — see the hits above."
fi
exit "$fail"
