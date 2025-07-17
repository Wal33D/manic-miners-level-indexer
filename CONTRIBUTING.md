# Contributing to Manic Miners Level Indexer

Thank you for your interest in contributing to the Manic Miners Level Indexer! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/manic-miners-level-indexer.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Install dependencies: `npm install`
5. Make your changes
6. Run tests: `npm test`
7. Commit your changes: `git commit -m "Add your feature"`
8. Push to your fork: `git push origin feature/your-feature-name`
9. Create a Pull Request

## Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build the project
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Code Style

- We use TypeScript for type safety
- ESLint and Prettier are configured for consistent code style
- Run `npm run lint` and `npm run format` before committing
- All code must pass type checking: `npm run type-check`

## Testing

- Write tests for new features
- Ensure all tests pass before submitting a PR
- Run `npm test` to execute the test suite
- Aim for good test coverage

## Commit Messages

Follow conventional commit format:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions or modifications
- `chore:` Build process or auxiliary tool changes

Examples:
- `feat: add Discord channel filtering`
- `fix: correct archive pagination logic`
- `docs: update README with new CLI options`

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Ensure all tests pass and linting is clean
3. Update the documentation for any API changes
4. Your PR will be reviewed by maintainers
5. Once approved, it will be merged

## Adding New Features

When adding new features:

1. **Indexers**: New source indexers should implement the common interface
2. **CLI Commands**: Add new commands in `src/cli/commands.ts`
3. **Configuration**: Update types and default config if needed
4. **Documentation**: Update README and inline documentation

## Reporting Issues

- Use GitHub Issues to report bugs
- Include steps to reproduce the issue
- Provide system information (OS, Node version)
- Include relevant error messages and logs

## Questions?

Feel free to open an issue for any questions about contributing.