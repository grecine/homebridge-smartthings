#!/bin/bash

# Script to:
#   1. Sync your GitHub fork with the original upstream repo (via gh CLI)
#   2. Pull those changes into your local clone
#   3. Preserve any uncommitted local changes throughout
#
# Prerequisites:
#   - GitHub CLI installed and authenticated: https://cli.github.com
#
# Usage: ./merge-upstream.sh

set -e  # Exit on error

echo "🔄 Syncing fork with upstream and merging locally..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ── Preflight checks ──────────────────────────────────────────────────────────

if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ Error: GitHub CLI (gh) is not installed.${NC}"
    echo "   Install it from https://cli.github.com or: brew install gh"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo -e "${RED}❌ Error: Not authenticated with GitHub CLI.${NC}"
    echo "   Run: gh auth login"
    exit 1
fi

# ── Derive repo slug from origin remote URL ───────────────────────────────────
# Handles both:
#   https://github.com/owner/repo.git
#   git@github.com:owner/repo.git

ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
if [ -z "$ORIGIN_URL" ]; then
    echo -e "${RED}❌ Error: No 'origin' remote found.${NC}"
    exit 1
fi

REPO=$(echo "$ORIGIN_URL" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
if [ -z "$REPO" ]; then
    echo -e "${RED}❌ Error: Could not parse GitHub repo from origin URL: ${ORIGIN_URL}${NC}"
    exit 1
fi
echo -e "${YELLOW}Fork repo: ${REPO}${NC}"

# ── Detect default branch (main vs master) ───────────────────────────────────

UPSTREAM_BRANCH=$(gh repo view "$REPO" --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || echo "main")
echo -e "${YELLOW}Upstream default branch: ${UPSTREAM_BRANCH}${NC}"

CURRENT_BRANCH=$(git branch --show-current)
echo -e "${YELLOW}Current local branch:    ${CURRENT_BRANCH}${NC}"

# ── Stash uncommitted changes ─────────────────────────────────────────────────

if ! git diff-index --quiet HEAD --; then
    echo ""
    echo -e "${YELLOW}📦 Uncommitted changes detected. Stashing...${NC}"
    git stash push -m "Auto-stash before merging upstream $(date +%Y-%m-%d\ %H:%M:%S)"
    STASHED=true
else
    STASHED=false
fi

# Ensure stash is always popped on exit (even on unexpected errors)
restore_stash() {
    if [ "$STASHED" = true ]; then
        echo ""
        echo -e "${YELLOW}📤 Restoring stashed changes...${NC}"
        if git stash pop; then
            echo -e "${GREEN}✓ Stash restored${NC}"
        else
            echo -e "${RED}⚠️  Conflicts while restoring stash. Resolve manually, then run: git stash drop${NC}"
        fi
    fi
}
trap restore_stash EXIT

# ── Sync GitHub fork with upstream ───────────────────────────────────────────

echo ""
echo -e "${YELLOW}🔁 Syncing GitHub fork with upstream repo...${NC}"
if gh repo sync "$REPO" --branch "${UPSTREAM_BRANCH}"; then
    echo -e "${GREEN}✓ Fork synced on GitHub${NC}"
else
    echo -e "${RED}❌ Fork sync failed. The upstream may have diverged from your fork.${NC}"
    echo "   You may need to resolve this manually on GitHub or force-sync:"
    echo "   gh repo sync \"${REPO}\" --branch ${UPSTREAM_BRANCH} --force"
    exit 1
fi

# ── Pull synced changes into local clone ─────────────────────────────────────

echo ""
echo -e "${YELLOW}📥 Fetching updated origin...${NC}"
git fetch origin

NEW_COMMITS=$(git log HEAD..origin/${UPSTREAM_BRANCH} --oneline 2>/dev/null | wc -l | tr -d ' ')

if [ "$NEW_COMMITS" -eq 0 ]; then
    echo -e "${GREEN}✓ Already up to date locally${NC}"
    exit 0
fi

echo -e "${YELLOW}📋 Found ${NEW_COMMITS} new commit(s):${NC}"
git log HEAD..origin/${UPSTREAM_BRANCH} --oneline

echo ""
echo -e "${YELLOW}🔀 Merging origin/${UPSTREAM_BRANCH}...${NC}"
if ! git merge origin/${UPSTREAM_BRANCH}; then
    echo -e "${RED}❌ Merge failed — resolve conflicts, then run: git merge --continue${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Merge successful${NC}"

# ── Done (trap will restore stash) ───────────────────────────────────────────

echo ""
echo -e "${GREEN}✅ All done!${NC}"
echo ""
git status --short
