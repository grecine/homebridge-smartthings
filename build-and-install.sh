#!/bin/bash

# Build, package, and install the homebridge-smartthings-oauth plugin
# on the Homebridge Docker server.
# Usage: ./build-and-install.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

REMOTE_HOST="home"
REMOTE_DIR="~/docker/homebridge/homebridge"
CONTAINER_NAME="homebridge"
PACKAGE_NAME="homebridge-smartthings-oauth"

echo "🏗️  Build and Install: ${PACKAGE_NAME}"
echo ""

# ── Step 1: Compare local version vs installed version ────────────────────────
LOCAL_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}🔍 Local version:     ${LOCAL_VERSION}${NC}"

# Extract just the semver (e.g. "1.0.56") from npm list output, ignoring any trailing text
INSTALLED_VERSION=$(ssh ${REMOTE_HOST} "docker exec ${CONTAINER_NAME} npm list ${PACKAGE_NAME} --depth=0 2>/dev/null | grep ${PACKAGE_NAME} | sed 's/.*@//' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1" 2>/dev/null || echo "unknown")
echo -e "${YELLOW}🔍 Installed version: ${INSTALLED_VERSION}${NC}"
echo ""

if [ "$INSTALLED_VERSION" = "$LOCAL_VERSION" ]; then
    echo -e "${YELLOW}⚠️  Version ${LOCAL_VERSION} is already installed on the server.${NC}"
    echo -e "${YELLOW}   You may not have any new changes to deploy.${NC}"
    echo ""
    read -p "Continue anyway? [y/N] " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    echo ""
else
    echo -e "${GREEN}✓ Upgrading ${INSTALLED_VERSION} → ${LOCAL_VERSION}${NC}"
    echo ""
fi

# ── Step 2: Build ─────────────────────────────────────────────────────────────
echo -e "${YELLOW}🔨 Building...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# ── Step 3: Clean up local .tgz files and pack ───────────────────────────────
echo -e "${YELLOW}🧹 Cleaning up local .tgz files...${NC}"
rm -f ${PACKAGE_NAME}-*.tgz
npm pack
TGZ_FILE="${PACKAGE_NAME}-${LOCAL_VERSION}.tgz"
echo -e "${GREEN}✓ Packaged: ${TGZ_FILE}${NC}"
echo ""

# ── Step 4: Clean up old .tgz files on the server ────────────────────────────
echo -e "${YELLOW}🔍 Checking for old versions on server...${NC}"
OLD_FILES=$(ssh ${REMOTE_HOST} "ls ${REMOTE_DIR}/${PACKAGE_NAME}-*.tgz 2>/dev/null || true")

if [ -z "$OLD_FILES" ]; then
    echo -e "${GREEN}✓ No old versions found on server${NC}"
else
    echo "Found these files on the server:"
    echo "$OLD_FILES" | while read -r f; do echo "  $f"; done
    echo ""
    read -p "Delete all old versions from server before installing? [y/N] " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        ssh ${REMOTE_HOST} "rm -f ${REMOTE_DIR}/${PACKAGE_NAME}-*.tgz"
        echo -e "${GREEN}✓ Old versions removed${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipping cleanup — old files will remain on server${NC}"
    fi
fi
echo ""

# ── Step 5: Copy to server ────────────────────────────────────────────────────
echo -e "${YELLOW}📤 Copying ${TGZ_FILE} to server...${NC}"
scp "${TGZ_FILE}" "${REMOTE_HOST}:${REMOTE_DIR}/"
echo -e "${GREEN}✓ Copied${NC}"
echo ""

# ── Step 6: Install inside Docker container ───────────────────────────────────
echo -e "${YELLOW}🐳 Installing inside Docker container '${CONTAINER_NAME}'...${NC}"
ssh ${REMOTE_HOST} "cd ${REMOTE_DIR} && docker exec -it ${CONTAINER_NAME} npm install ${TGZ_FILE}"
echo -e "${GREEN}✓ Installed${NC}"
echo ""

# ── Step 7: Restart Homebridge ────────────────────────────────────────────────
echo -e "${YELLOW}🔄 Restarting Homebridge container...${NC}"
ssh ${REMOTE_HOST} "docker restart ${CONTAINER_NAME}"
echo -e "${GREEN}✓ Restarted${NC}"
echo ""

echo -e "${GREEN}✅ Done! ${PACKAGE_NAME}@${LOCAL_VERSION} is installed and running.${NC}"
