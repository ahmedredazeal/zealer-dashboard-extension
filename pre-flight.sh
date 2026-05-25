#!/bin/bash
# pre-flight.sh — Zealer Dashboard release-gate checks.
# Mirrors EM Dashboard's pre-flight, adapted for this repo's file set.
# Must exit 0 before tagging a release.

set +e  # Don't exit on first error — collect all failures, report once.

echo "======================================"
echo "Zealer Dashboard — Pre-Flight Validation"
echo "======================================"
echo ""

ERRORS=0

# ── 1. JS syntax check ────────────────────────────────────────────────────
echo "1. Checking JS syntax..."
for file in popup.js settings.js background.js theme-loader.js src/*.js tests/*.js; do
  if [ -f "$file" ]; then
    if node --check "$file" 2>&1; then
      echo "   ✓ $file"
    else
      echo "   ✗ $file FAILED"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done
echo ""

# ── 2. Brace balance ──────────────────────────────────────────────────────
echo "2. Checking brace balance..."
for file in popup.js settings.js background.js theme-loader.js src/*.js; do
  if [ -f "$file" ]; then
    diff=$(python3 -c "
code = open('$file').read()
print(code.count('{') - code.count('}'))
")
    if [ "$diff" != "0" ]; then
      echo "   ✗ $file — unbalanced braces (diff=$diff)"
      ERRORS=$((ERRORS + 1))
    else
      echo "   ✓ $file"
    fi
  fi
done
echo ""

# ── 3. Element-ID audit (popup.html ↔ popup.js, settings.html ↔ settings.js) ─
echo "3. Running element-ID audit..."
python3 - <<'EOF'
import re, sys, os

audits = [
    ('popup.js',    'popup.html'),
    ('settings.js', 'settings.html'),
]
fail = False
for js_path, html_path in audits:
    if not (os.path.exists(js_path) and os.path.exists(html_path)):
        continue
    js   = open(js_path).read()
    html = open(html_path).read()

    referenced = set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", js))

    # Tolerate IDs that are created dynamically by the JS itself
    dynamic = set()
    for m in re.finditer(r'id=["\']([^"\']+)["\']', js):
        dynamic.add(m.group(1))
    for m in re.finditer(r"\.id\s*=\s*['\"]([^'\"]+)['\"]", js):
        dynamic.add(m.group(1))

    missing = sorted(e for e in referenced
                     if (f'id="{e}"' not in html and f"id='{e}'" not in html)
                     and e not in dynamic)
    if missing:
        print(f"   ✗ {js_path} → {html_path} missing: {missing}")
        fail = True
    else:
        print(f"   ✓ {js_path} ↔ {html_path}")

sys.exit(1 if fail else 0)
EOF
if [ $? -ne 0 ]; then ERRORS=$((ERRORS + 1)); fi
echo ""

# ── 4. CSP compliance ─────────────────────────────────────────────────────
echo "4. Checking CSP compliance (no inline scripts / event handlers)..."
CSP_VIOLATIONS=0
for file in *.html; do
  if [ -f "$file" ]; then
    # Inline <script>code</script> (not <script src="..."></script>)
    if grep -E '<script[^>]*>[^<[:space:]]+' "$file" >/dev/null 2>&1; then
      echo "   ✗ $file contains inline script"
      CSP_VIOLATIONS=$((CSP_VIOLATIONS + 1))
    fi
    # Inline event handlers (onclick, onload, etc.)
    if grep -E 'on(click|load|change|submit|keyup|keydown|input|focus|blur)=' "$file" >/dev/null 2>&1; then
      echo "   ✗ $file contains inline event handler"
      CSP_VIOLATIONS=$((CSP_VIOLATIONS + 1))
    fi
  fi
done
if [ $CSP_VIOLATIONS -eq 0 ]; then
  echo "   ✓ No CSP violations found"
else
  echo "   ✗ $CSP_VIOLATIONS CSP violation(s)"
  ERRORS=$((ERRORS + CSP_VIOLATIONS))
fi
echo ""

# ── 5. manifest.json valid JSON ───────────────────────────────────────────
echo "5. Validating manifest.json..."
if python3 -m json.tool manifest.json > /dev/null 2>&1; then
  echo "   ✓ manifest.json is valid JSON"
else
  echo "   ✗ manifest.json is invalid"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── 6. Required files exist ───────────────────────────────────────────────
echo "6. Checking required files..."
REQUIRED_FILES=(
  "manifest.json"
  "background.js"
  "popup.html"
  "popup.js"
  "settings.html"
  "settings.js"
  "styles.css"
  "theme-loader.js"
  "changelog.html"
  "CHANGELOG.md"
  "README.md"
  "docs/ARCHITECTURE.md"
  "src/jira-api.js"
  "src/sentry-api.js"
  "src/sentry-trend.js"
  "src/worklog-aggregator.js"
  "src/burndown.js"
  "src/parsers.js"
  "src/metrics.js"
  "src/privacy-mode.js"
  "src/sprint-cache.js"
  "src/changelog-parser.js"
  "src/migrations.js"
)
MISSING=0
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "   ✗ Missing: $file"
    MISSING=$((MISSING + 1))
  fi
done
if [ $MISSING -eq 0 ]; then
  echo "   ✓ All required files present"
else
  ERRORS=$((ERRORS + MISSING))
fi
echo ""

# ── 7. Icons exist ────────────────────────────────────────────────────────
echo "7. Checking icons..."
ICON_MISSING=0
for size in 16 32 48 128; do
  if [ ! -f "icons/icon${size}.png" ]; then
    echo "   ✗ Missing: icons/icon${size}.png"
    ICON_MISSING=$((ICON_MISSING + 1))
  fi
done
if [ $ICON_MISSING -eq 0 ]; then
  echo "   ✓ All icons present"
else
  ERRORS=$((ERRORS + ICON_MISSING))
fi
echo ""

# ── 8. Version consistency (manifest ↔ changelog.html ↔ CHANGELOG.md) ─────
echo "8. Checking version consistency..."
MANIFEST_VERSION=$(grep '"version"' manifest.json | sed -E 's/.*"version": "([^"]+)".*/\1/')
echo "   manifest.json version: ${MANIFEST_VERSION}"
if grep -q "v${MANIFEST_VERSION}" changelog.html; then
  echo "   ✓ v${MANIFEST_VERSION} in changelog.html"
else
  echo "   ✗ v${MANIFEST_VERSION} missing from changelog.html"
  ERRORS=$((ERRORS + 1))
fi
if grep -q "v${MANIFEST_VERSION}" CHANGELOG.md; then
  echo "   ✓ v${MANIFEST_VERSION} in CHANGELOG.md"
else
  echo "   ✗ v${MANIFEST_VERSION} missing from CHANGELOG.md"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── 9. Run unit tests ─────────────────────────────────────────────────────
echo "9. Running unit tests..."
TEST_FILES=(
  "tests/parsers.test.js"
  "tests/burndown.test.js"
  "tests/burndown-algorithm.test.js"
  "tests/sentry-trend.test.js"
  "tests/worklog-aggregator.test.js"
  "tests/integration.test.js"
)
TOTAL_PASS=0
TOTAL_FAIL=0
for t in "${TEST_FILES[@]}"; do
  if node "$t" > /tmp/zealer-test.txt 2>&1; then
    summary=$(grep -E "passed.*failed" /tmp/zealer-test.txt | tail -1)
    echo "   ✓ $(basename "$t" .test.js): $summary"
    p=$(echo "$summary" | sed -E 's/^([0-9]+) passed.*/\1/')
    [ -n "$p" ] && TOTAL_PASS=$((TOTAL_PASS + p))
  else
    echo "   ✗ $(basename "$t" .test.js) failed:"
    tail -10 /tmp/zealer-test.txt | sed 's/^/      /'
    ERRORS=$((ERRORS + 1))
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
  fi
done
echo "   ── Tests: ${TOTAL_PASS} passed, ${TOTAL_FAIL} file(s) failed"
echo ""

# ── Final report ──────────────────────────────────────────────────────────
echo "======================================"
if [ $ERRORS -eq 0 ]; then
  echo "✓ PRE-FLIGHT PASSED — Ready to package v${MANIFEST_VERSION}"
  echo "======================================"
  exit 0
else
  echo "✗ PRE-FLIGHT FAILED — $ERRORS error(s)"
  echo "Fix errors before packaging"
  echo "======================================"
  exit 1
fi
