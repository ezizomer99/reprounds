#!/bin/sh
# RepRounds secret / sensitive-file scanner shared by the git hooks.
#
# Usage:
#   scan-secrets.sh staged            # scan staged changes (pre-commit)
#   scan-secrets.sh range <gitrange>  # scan a commit range (pre-push)
#
# Exit 0 = clean (warnings allowed), 1 = blocked, 2 = bad invocation.
# Bypass a false positive with `git commit --no-verify` / `git push --no-verify`.

set -u

MODE="${1:-staged}"

case "$MODE" in
  staged)
    FILES="$(git diff --cached --name-only --diff-filter=ACMR)"
    DIFF="$(git diff --cached --diff-filter=ACMR -U0)"
    ;;
  range)
    RANGE="${2:-}"
    [ -z "$RANGE" ] && { echo "scan-secrets: range mode needs a git range" >&2; exit 2; }
    FILES="$(git diff --name-only --diff-filter=ACMR "$RANGE")"
    DIFF="$(git diff --diff-filter=ACMR -U0 "$RANGE")"
    ;;
  *)
    echo "scan-secrets: unknown mode '$MODE'" >&2
    exit 2
    ;;
esac

BLOCK=0
WARN=0

note_block() { echo "  BLOCK  $1"; BLOCK=1; }
note_warn()  { echo "  warn   $1"; WARN=1; }

# --- 1. Sensitive filenames that must never be committed --------------------
# Allow *.example / *.sample / *.template variants.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.example|*.sample|*.template|*.example.*|*.sample.*) continue ;;
  esac
  base="${f##*/}"
  case "$base" in
    .env|.env.*|.dev.vars) note_block "env / secrets file staged: $f" ;;
    *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore) note_block "key / certificate staged: $f" ;;
    id_rsa|id_dsa|id_ecdsa|id_ed25519) note_block "private SSH key staged: $f" ;;
    *.mobileprovision) note_block "provisioning profile staged: $f" ;;
    google-services.json|GoogleService-Info.plist|credentials.json|secrets.json)
      note_warn "possibly sensitive config staged: $f" ;;
  esac
  case "$f" in
    .claude/settings.local.json|.claude/settings.json)
      note_block "local Claude Code settings staged: $f" ;;
  esac
done <<EOF
$FILES
EOF

# --- 2. Secret-looking content in ADDED lines only -------------------------
ADDED="$(printf '%s\n' "$DIFF" | grep -E '^\+' | grep -Ev '^\+\+\+')"

# block_pattern <label> <ERE>
block_pattern() {
  hits="$(printf '%s\n' "$ADDED" | grep -E -- "$2")" || true
  [ -z "$hits" ] && return 0
  echo "  BLOCK  $1:"
  printf '%s\n' "$hits" | sed 's/^+/    /' | cut -c1-140
  BLOCK=1
}

block_pattern "private key block"      '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
block_pattern "AWS access key id"      'AKIA[0-9A-Z]{16}'
block_pattern "Google API key"         'AIza[0-9A-Za-z_-]{35}'
block_pattern "GitHub token"           'gh[pousr]_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{20,}'
block_pattern "Slack token"            'xox[baprs]-[0-9A-Za-z-]{10,}'
block_pattern "Stripe live secret key" 'sk_live_[0-9A-Za-z]{16,}'
block_pattern "service-account key"    '"private_key"[[:space:]]*:'

# Generic credential assignment -> warn (noisy, exclude obvious placeholders).
GENERIC='(password|passwd|secret|client_secret|access_token|api[_-]?key|token)["'"'"' ]*[:=]["'"'"' ]*[A-Za-z0-9/+_-]{8,}'
gen_hits="$(printf '%s\n' "$ADDED" \
  | grep -Ei -- "$GENERIC" \
  | grep -Eiv 'process\.env|import\.meta\.env|EXPO_PUBLIC|example|placeholder|your[_-]|changeme|xxxx|<[^>]+>|\$\{|null|undefined')" || true
if [ -n "$gen_hits" ]; then
  echo "  warn   possible hardcoded credential:"
  printf '%s\n' "$gen_hits" | sed 's/^+/    /' | cut -c1-140
  WARN=1
fi

# --- 3. Verdict ------------------------------------------------------------
echo ""
if [ "$BLOCK" -ne 0 ]; then
  echo "Security scan BLOCKED this operation."
  echo "Remove the items above, or bypass with --no-verify if it is a false positive."
  exit 1
fi
[ "$WARN" -ne 0 ] && echo "Security scan passed with warnings (review above)."
echo "Security scan passed."
exit 0
