# Branch Protection and Pull Request Workflow

This guide explains the branch protection rules and workflow for contributing to the Manic Miners Level Indexer project.

## Table of Contents

1. [Branch Protection Overview](#branch-protection-overview)
2. [Protected Branches](#protected-branches)
3. [Pull Request Workflow](#pull-request-workflow)
4. [Working with Feature Branches](#working-with-feature-branches)
5. [GitHub CLI Usage](#github-cli-usage)
6. [Best Practices](#best-practices)

## Branch Protection Overview

The main branch of this repository has protection rules enabled to ensure code quality and maintain a stable codebase. All changes must go through a pull request process with proper reviews and checks.

### Why Branch Protection?

- **Code Quality**: Ensures all code is reviewed before merging
- **Stability**: Prevents accidental direct pushes to main
- **History**: Maintains a clean commit history
- **Collaboration**: Facilitates team collaboration and knowledge sharing
- **Testing**: Ensures all tests pass before merging

## Protected Branches

### Main Branch Rules

The `main` branch has the following protection rules:

1. **Require pull request reviews before merging**
   - At least 1 approving review required
   - Dismiss stale reviews when new commits are pushed
   - Review from code owners required (if applicable)

2. **Require status checks to pass before merging**
   - TypeScript compilation must succeed
   - ESLint checks must pass
   - All tests must pass
   - Code formatting must be correct

3. **Require branches to be up to date before merging**
   - Branch must be up to date with main

4. **Include administrators**
   - Even administrators must follow these rules

5. **Restrict who can push to matching branches**
   - Only authorized users can merge PRs

## Pull Request Workflow

### 1. Create a Feature Branch

Always create a new branch for your changes:

```bash
# Update your local main branch
git checkout main
git pull origin main

# Create and switch to a new feature branch
git checkout -b feature/your-feature-name

# For bug fixes
git checkout -b fix/bug-description

# For documentation updates
git checkout -b docs/update-description
```

### 2. Make Your Changes

Develop your feature or fix on the feature branch:

```bash
# Make your changes
# ... edit files ...

# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: add new indexing feature

- Implement feature X
- Update documentation
- Add tests"
```

### 3. Push to Remote

Push your feature branch to the remote repository:

```bash
# Push branch to remote
git push -u origin feature/your-feature-name
```

### 4. Create Pull Request

Create a pull request using GitHub web interface or CLI:

#### Using GitHub Web Interface:
1. Navigate to the repository on GitHub
2. Click "Pull requests" → "New pull request"
3. Select your feature branch as the compare branch
4. Fill in the PR template with:
   - Clear title describing the change
   - Detailed description of what and why
   - Related issue numbers (if any)
   - Testing steps
   - Screenshots (if UI changes)

#### Using GitHub CLI:
```bash
# Install GitHub CLI if not already installed
# https://cli.github.com/

# Create PR interactively
gh pr create

# Or create with specific details
gh pr create \
  --title "Add new indexing feature" \
  --body "Description of changes..." \
  --base main
```

### 5. Code Review Process

Once the PR is created:

1. **Automated Checks**: Wait for all automated checks to pass
   - TypeScript compilation
   - ESLint validation
   - Test suite execution
   - Code formatting check

2. **Request Review**: Request review from maintainers or specific team members

3. **Address Feedback**: 
   - Respond to review comments
   - Make requested changes
   - Push new commits to the same branch

4. **Re-review**: Request re-review after addressing feedback

### 6. Merging

Once approved and all checks pass:

```bash
# The PR can be merged via GitHub web interface
# Or using GitHub CLI
gh pr merge --merge --delete-branch
```

## Working with Feature Branches

### Keeping Your Branch Updated

Keep your feature branch up to date with main:

```bash
# Fetch latest changes
git fetch origin

# Merge or rebase main into your branch
git merge origin/main
# OR
git rebase origin/main
```

### Resolving Conflicts

If conflicts arise:

```bash
# After merge/rebase, resolve conflicts in your editor
# Stage resolved files
git add .

# Continue the merge
git commit
# OR continue rebase
git rebase --continue
```

## GitHub CLI Usage

### Installation

```bash
# macOS
brew install gh

# Windows
scoop install gh
# or
choco install gh

# Linux
# See https://github.com/cli/cli/blob/trunk/docs/install_linux.md
```

### Authentication

```bash
# Authenticate with GitHub
gh auth login
```

### Common Commands

```bash
# List PRs
gh pr list

# View PR details
gh pr view <pr-number>

# Check PR status
gh pr status

# Review a PR
gh pr review <pr-number>

# Approve a PR
gh pr review <pr-number> --approve

# Merge a PR
gh pr merge <pr-number> --merge

# Close a PR without merging
gh pr close <pr-number>
```

## Best Practices

### 1. Branch Naming Conventions

Use descriptive branch names:
- `feature/add-map-renderer`
- `fix/discord-auth-timeout`
- `docs/update-api-reference`
- `refactor/optimize-indexer`
- `test/add-unit-tests`

### 2. Commit Messages

Follow conventional commit format:
```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test additions or changes
- `chore`: Maintenance tasks

### 3. PR Guidelines

- **Small, Focused PRs**: Keep PRs small and focused on a single change
- **Clear Description**: Provide context and reasoning
- **Tests**: Include tests for new features
- **Documentation**: Update docs for API changes
- **Screenshots**: Include for UI changes
- **Link Issues**: Reference related issues

### 4. Review Etiquette

- **Be Constructive**: Provide helpful feedback
- **Be Specific**: Point to specific lines when commenting
- **Be Timely**: Respond to reviews promptly
- **Test Locally**: Pull and test changes when possible

### 5. Pre-Push Checklist

Before pushing:
```bash
# Run type check
npm run type-check

# Run linter
npm run lint

# Run tests
npm test

# Format code
npm run format
```

## Troubleshooting

### Common Issues

**Cannot push to main**:
```bash
# This is expected! Create a feature branch instead
git checkout -b feature/my-feature
git push -u origin feature/my-feature
```

**PR checks failing**:
```bash
# Run checks locally
npm run lint
npm run type-check
npm test
```

**Merge conflicts**:
```bash
# Update your branch
git fetch origin
git rebase origin/main
# Resolve conflicts, then continue
git rebase --continue
```

## Emergency Procedures

If you need to bypass protection (admin only):

1. This should be extremely rare
2. Document why it's necessary
3. Create an issue explaining the bypass
4. Follow up with proper PR afterwards

## Additional Resources

- [GitHub Pull Request Documentation](https://docs.github.com/en/pull-requests)
- [GitHub CLI Manual](https://cli.github.com/manual/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)