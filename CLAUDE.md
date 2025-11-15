# IMPORTANT

## Commands Reference

### Setup and Installation

```bash
# Install dependencies
bun install
```

### Build Commands

```bash
# Build everything
bun run build

# Build only a package (eg web)
cd packages/web && bun run build
```

### Lint Commands

```bash
# Lint everything
bun lint
```

### Testing Commands

```bash
# Run all tests
bun test
```

## Project Architecture

### Development Rules

- Use bun (not npm)
- Use as many bun apis as possible like Bun.file()
- TypeScript is used throughout for type safety
- Environment variables are managed via dotenv files
- NEVER remove existing comments or console statements
- PREFER early returns when possible
- Use consts instead of functions, for example, "const toggle = () =>". Also, define a type if possible.
- NEVER use the "any" type with typescript, fix the underlying type problem. If you absolutely must then use "unknown" but present solid evidence why.
- NEVER cast variables as a type (eg. const foo = bar as SomeType), fix the underlying type problem.
- NEVER pass or expect accountId or userId through a API request, instead if the values are needed, get it from the token

## Code Quality Checks

After making code changes, run the following commands to ensure the code can lint, build and test successfully:

```bash
# lint and build and test
bun lint && bun run build && bun test

# If there are type errors or lint errors / warnings then fix them before proceeding as changes cannot be pushed with type errors or lint warnings
```

This step is important to verify that type definitions are correct and to catch potential issues early.
