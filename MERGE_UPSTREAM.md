# Merging Upstream Changes

This guide walks you through merging upstream changes from the remote repository into your local branch while preserving your uncommitted changes.

## Quick Method (Automated)

Run the provided script:
```bash
./merge-upstream.sh
```

## Manual Method (Step-by-Step)

### 1. Check Current Status
First, see what changes you have:
```bash
git status
```

### 2. Fetch Latest Changes
Get the latest changes from the remote repository:
```bash
git fetch origin
```

### 3. Check What's New
See what commits are available upstream that you don't have:
```bash
git log HEAD..origin/master --oneline
```

### 4. Stash Your Local Changes
Temporarily save your uncommitted changes:
```bash
git stash push -m "Stashing local changes before merging upstream"
```

### 5. Merge Upstream Changes
Merge the upstream changes into your branch:
```bash
git merge origin/master
```

### 6. Restore Your Changes
Reapply your stashed changes on top of the merged code:
```bash
git stash pop
```

### 7. Check for Conflicts
Verify everything merged cleanly:
```bash
git status
```

If you see conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`), you'll need to resolve them manually.

## Handling Merge Conflicts

If conflicts occur during `git stash pop`:

1. **Open the conflicted files** - Git will mark conflict areas
2. **Resolve conflicts** - Edit the files to choose which changes to keep
3. **Mark as resolved**:
   ```bash
   git add <resolved-file>
   ```
4. **Continue** - Once all conflicts are resolved, you're done

## Troubleshooting

### If the merge fails
- Check `git status` to see what went wrong
- You may need to commit your changes first, then merge
- Or create a new branch for your changes

### If stash pop has conflicts
- Resolve the conflicts in the affected files
- Run `git add` on resolved files
- The stash will be automatically dropped after successful pop

### To see what's in your stash
```bash
git stash list
git stash show -p
```

## Notes

- The script automatically handles the stashing and merging process
- Always review the changes after merging to ensure everything looks correct
- Consider committing your changes before merging if you want a cleaner history