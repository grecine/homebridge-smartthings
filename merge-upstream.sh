#!/bin/bash

# Script to merge upstream changes while preserving local uncommitted changes
# Usage: ./merge-upstream.sh

set -e  # Exit on error

echo "🔄 Merging upstream changes..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${YELLOW}Current branch: ${CURRENT_BRANCH}${NC}"

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}📦 Uncommitted changes detected. Stashing...${NC}"
    git stash push -m "Auto-stash before merging upstream $(date +%Y-%m-%d\ %H:%M:%S)"
    STASHED=true
else
    echo -e "${GREEN}✓ No uncommitted changes${NC}"
    STASHED=false
fi

# Fetch latest changes
echo ""
echo -e "${YELLOW}📥 Fetching latest changes from origin...${NC}"
git fetch origin

# Check if there are new commits
NEW_COMMITS=$(git log HEAD..origin/master --oneline 2>/dev/null | wc -l | tr -d ' ')

if [ "$NEW_COMMITS" -eq 0 ]; then
    echo -e "${GREEN}✓ Already up to date with origin/master${NC}"
    if [ "$STASHED" = true ]; then
        echo -e "${YELLOW}📤 Restoring stashed changes...${NC}"
        git stash pop
    fi
    exit 0
fi

echo -e "${YELLOW}📋 Found ${NEW_COMMITS} new commit(s):${NC}"
git log HEAD..origin/master --oneline

# Merge upstream changes
echo ""
echo -e "${YELLOW}🔀 Merging origin/master...${NC}"
if git merge origin/master; then
    echo -e "${GREEN}✓ Merge successful${NC}"
else
    echo -e "${RED}❌ Merge failed${NC}"
    if [ "$STASHED" = true ]; then
        echo -e "${YELLOW}📤 Restoring stashed changes...${NC}"
        git stash pop
    fi
    exit 1
fi

# Restore stashed changes if we stashed any
if [ "$STASHED" = true ]; then
    echo ""
    echo -e "${YELLOW}📤 Restoring stashed changes...${NC}"
    if git stash pop; then
        echo -e "${GREEN}✓ Changes restored${NC}"
    else
        echo -e "${RED}⚠️  Conflicts detected while restoring changes${NC}"
        echo -e "${YELLOW}Please resolve conflicts manually and run: git stash drop${NC}"
        exit 1
    fi
fi

# Final status check
echo ""
echo -e "${GREEN}✅ Merge complete!${NC}"
echo ""
echo "Current status:"
git status --short

echo ""
echo -e "${GREEN}Done! Your local changes have been preserved on top of the merged upstream changes.${NC}"