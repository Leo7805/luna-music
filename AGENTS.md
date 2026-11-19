# Luna Music — Agent Guidelines

## Code Quality

- Keep code simple, readable, modular, and maintainable.
- Follow the Single Responsibility Principle.
- Prefer 200–300 lines or fewer per source file.
- Review and refactor files exceeding 300 lines.
- **500 lines is the absolute maximum**, including exceptional cases.
- Split large files by responsibility, not merely to reduce line counts.
- Avoid unnecessary abstractions, duplication, and circular dependencies.
- Reuse existing utilities, hooks, components, and patterns.

## Architecture

- Keep UI, business logic, and persistence concerns separate.
- Maintain a single authoritative state source for each feature.
- Avoid duplicated React state and unnecessary synchronization effects.
- Keep components and hooks focused on clearly defined responsibilities.
- Preserve existing data models and public interfaces unless changes are necessary.

## Development Workflow

- Inspect relevant code before making changes.
- Prefer small, focused, reversible changes over large rewrites.
- Preserve existing functionality and backward compatibility.
- Add or update regression tests when changing behaviour.
- Run tests, TypeScript checks, and production build before committing.
- Check `git diff` and ensure no unrelated changes are included.

## Git & Project Boundaries

- Use clear, concise English commit messages.
- Commit locally after successful verification.
- **Never push unless explicitly requested.**
- Never modify `/Users/leo/Projects/luna-player`; it is a read-only reference project.

## Reporting

After completing a task, briefly report:

- What changed and why.
- Tests and build results.
- Any remaining issues or limitations.
- Git commit hash and status.