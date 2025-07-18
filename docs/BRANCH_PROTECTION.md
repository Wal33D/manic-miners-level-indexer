# Branch Protection Setup

This document describes the branch protection rules configured for the main branch of the Manic Miners Level Indexer repository.

## Protection Rules

The following protection rules are enforced on the `main` branch:

### ✅ Required Status Checks
- **Test Workflow**: The "Run Tests" workflow must pass before merging
- **Strict Updates**: Branches must be up to date with the base branch before merging
- This ensures all code is tested with the latest changes

### ✅ Pull Request Reviews
- **Required Reviews**: At least 1 approving review is required
- **Dismiss Stale Reviews**: Reviews are dismissed when new commits are pushed
- **Code Owner Reviews**: Not required (can be enabled if CODEOWNERS file is added)

### ✅ Push Restrictions
- **Force Pushes**: ❌ Disabled - prevents history rewriting
- **Deletions**: ❌ Disabled - prevents accidental branch deletion
- **Direct Pushes**: ❌ Disabled - all changes must go through pull requests

### ✅ Additional Protections
- **Admin Enforcement**: Disabled (admins can bypass if needed for emergencies)
- **Linear History**: Not required (merge commits allowed)
- **Conversation Resolution**: Not required (can be enabled later)

## GitHub Actions Workflows

### Tests Workflow (.github/workflows/tests.yml)
Runs on every push and pull request to ensure:
1. **Type Checking**: TypeScript compilation without errors
2. **Linting**: ESLint passes with no errors
3. **Formatting**: Code follows Prettier standards
4. **Unit Tests**: All tests pass successfully

## Making Changes

To make changes to the protected main branch:

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   ```bash
   # Edit files
   npm run lint        # Fix any linting issues
   npm run format      # Format code
   npm test           # Ensure tests pass
   ```

3. **Push Your Branch**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature-name
   ```

4. **Create a Pull Request**
   - Go to GitHub and create a PR from your branch to main
   - Wait for the Tests workflow to pass
   - Request a review from a team member
   - Once approved and tests pass, the PR can be merged

## Emergency Procedures

If you need to bypass protection in an emergency:

1. **Admin Override**: Repository admins can force push if absolutely necessary
2. **Disable Protection**: Can be done via Settings → Branches (use with caution)
3. **Fix Failed Tests**: If tests are blocking critical fixes:
   ```bash
   # Run tests locally to debug
   npm test -- --verbose
   
   # Check specific test file
   npm test -- path/to/test.spec.ts
   ```

## Monitoring

- **Workflow Status**: Check [Actions tab](https://github.com/Wal33D/manic-miners-level-indexer/actions)
- **Protection Status**: View in [Settings → Branches](https://github.com/Wal33D/manic-miners-level-indexer/settings/branches)
- **PR Status**: Each PR shows required checks at the bottom

## Updating Protection Rules

To modify branch protection settings:

```bash
# View current settings
gh api repos/Wal33D/manic-miners-level-indexer/branches/main/protection

# Update settings (example: require 2 reviewers)
curl -X PATCH \
  -H "Authorization: Bearer $(gh auth token)" \
  https://api.github.com/repos/Wal33D/manic-miners-level-indexer/branches/main/protection/required_pull_request_reviews \
  -d '{"required_approving_review_count": 2}'
```

## Benefits

1. **Code Quality**: All code is tested and reviewed before merging
2. **Stability**: Main branch always has passing tests
3. **Collaboration**: Changes are reviewed by team members
4. **History**: Clean git history without force pushes
5. **Safety**: Protection against accidental deletions or bad merges