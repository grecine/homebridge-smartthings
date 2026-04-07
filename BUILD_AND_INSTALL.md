# Build and Install Guide

This guide covers how to build the plugin locally and install it on the Homebridge server.

## Overview

The plugin is written in TypeScript and must be compiled before packaging. The resulting `.tgz` is copied to the Homebridge server and installed inside the Docker container.

## Prerequisites

- Node.js >= 20.0.0
- SSH access to the Homebridge server (aliased as `home`)
- The Homebridge container is named `homebridge`
- The Homebridge data directory on the server is: `~/docker/homebridge/homebridge/`

---

## Step 1: Build

Compile the TypeScript source into `dist/`:

```bash
npm run build
```

This runs `rimraf ./dist && tsc` — it cleans the old build first.

> **Note:** `npm run build` does NOT run linting. If you want to lint first, run `npm run lint` manually.

## Step 2: Package

Remove any stale `.tgz` from the project root, then create a fresh one:

```bash
rm -f homebridge-smartthings-oauth-*.tgz
npm pack
```

This produces `homebridge-smartthings-oauth-X.Y.Z.tgz` in the project root, where `X.Y.Z` matches the version in `package.json`.

## Step 3: Copy to Homebridge server

```bash
VERSION=$(node -p "require('./package.json').version")
scp homebridge-smartthings-oauth-${VERSION}.tgz home:~/docker/homebridge/homebridge/
```

## Step 4: Install inside the Docker container

```bash
ssh home
cd ~/docker/homebridge/homebridge/
docker exec -it homebridge npm install homebridge-smartthings-oauth-X.Y.Z.tgz
```

Replace `X.Y.Z` with the actual version you just copied over. You can check what's there with `ls homebridge-smartthings-oauth-*.tgz`.

## Step 5: Restart Homebridge

A restart is required for the new plugin version to take effect. Either use the Homebridge UI, or from the command line:

```bash
ssh home "docker restart homebridge"
```

## Step 6: Clean up old packages on the server

Old `.tgz` files accumulate in `~/docker/homebridge/homebridge/`. After confirming the new version is working, remove the old ones:

```bash
ssh home "ls ~/docker/homebridge/homebridge/homebridge-smartthings-oauth-*.tgz"
ssh home "rm ~/docker/homebridge/homebridge/homebridge-smartthings-oauth-OLD.tgz"
```

---

## Full Sequence (copy-paste)

Run all of this from your Mac, inside the project directory:

```bash
VERSION=$(node -p "require('./package.json').version")
npm run build
rm -f homebridge-smartthings-oauth-*.tgz
npm pack
scp homebridge-smartthings-oauth-${VERSION}.tgz home:~/docker/homebridge/homebridge/
ssh home "cd ~/docker/homebridge/homebridge && docker exec -it homebridge npm install homebridge-smartthings-oauth-${VERSION}.tgz"
ssh home "docker restart homebridge"
```
