# Contributing to DeviceLab

Thank you for your interest in contributing to DeviceLab! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a new branch for your feature or fix
4. Make your changes
5. Run the checks listed below
6. Commit your changes
7. Push to your fork and submit a pull request

## Development Setup

```bash
npm install
npm run dev
```

## Before Submitting

Ensure all of the following pass:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

## Pull Request Guidelines

- Keep changes focused and minimal
- Write clear commit messages
- Update documentation if needed
- Add tests for new functionality
- Ensure all checks pass

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `style:` — Code style changes (formatting, etc.)
- `refactor:` — Code refactoring
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

## Code Style

- Use TypeScript for all source files
- Follow the existing code conventions
- Use Tailwind CSS for styling
- Keep components small and focused

## Reporting Issues

Use the GitHub issue templates for bug reports and feature requests. Include as much relevant information as possible.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
