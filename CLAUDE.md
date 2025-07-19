# Claude Instructions

## Git Configuration

**IMPORTANT**: When committing and pushing changes, always configure git to use the human's credentials do not commit as claude if you need to use the github api as the user:
- Email: aquataze@yahoo.com
- GitHub username: Wal33D

Before committing, ensure git is configured with:
```bash
git config user.email "aquataze@yahoo.com"
git config user.name "Wal33D"
```

**DO NOT** commit or push changes as Claude. All commits should appear as authored by Wal33D.

# ⚠️ NEVER INCLUDE CO-AUTHORED-BY OR ANY CONTRIBUTOR LINES IN COMMITS! ⚠️

## Branch Protection and Pull Request Workflow

The main branch has protection enabled. When you need to push changes, create a pull request:

1. **Create a feature branch**:
   ```bash
   # Create and switch to a new branch
   git checkout -b claude-updates
   ```

2. **Push your changes to the feature branch**:
   ```bash
   git push -u origin claude-updates
   ```

3. **Create a pull request**:
   ```bash
   # Create PR using GitHub CLI
   gh pr create --title "Your PR title" --body "Description of changes" --base main
   ```

4. **Review and merge the pull request**:
   ```bash
   # View the PR in browser for review
   gh pr view --web
   
   # After review, merge the PR
   gh pr merge --auto --merge
   ```

5. **Switch back to main and pull latest changes**:
   ```bash
   git checkout main
   git pull origin main
   ```

**Note**: Always use pull requests to maintain code quality and ensure all tests pass before merging.

## Post-Development Checks

After making any code changes to this project, always run the following commands to ensure code quality:

1. **Type Check** - Verify TypeScript types are correct:
   ```bash
   npm run type-check
   ```

2. **Lint** - Check and fix ESLint issues:
   ```bash
   npm run lint
   ```

3. **Format** - Apply Prettier formatting:
   ```bash
   npm run format
   ```

## Important Notes

- These checks should be run AFTER completing any coding task
- If any of these commands fail, fix the issues before considering the task complete
- The project uses:
  - TypeScript for type safety
  - ESLint for code quality
  - Prettier for consistent formatting
