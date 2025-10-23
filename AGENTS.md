# Agent Coding Guidelines for LMA

## Build/Test Commands
- **Python tests**: `pytest <test_file>.py` (single test) or `pytest` (all tests in dir)
- **JavaScript tests**: `npm test` (in component package.json directory)
- **Linting**: `make lint` (runs all linters: cfn-lint, pylint, flake8, mypy, black, bandit, eslint, prettier)
- **Build**: `make build` (requires CONFIG_ENV set, e.g., `CONFIG_ENV=dev make build`)
- **No generic npm scripts** - this is a multi-stack CloudFormation project, not a monorepo

## Code Style

### Python
- **Line length**: Max 100 chars (enforced by pylint/flake8)
- **Imports**: Standard lib → third-party → local, with type checking imports under `if TYPE_CHECKING:`
- **Type hints**: Required; use mypy with `ignore_missing_imports = True`
- **Formatting**: Black formatter, snake_case naming
- **Error handling**: Use boto3 botocore.exceptions.ClientError
- **Headers**: MIT License header with copyright Amazon.com

### TypeScript/JavaScript
- **ESLint**: Airbnb base config for JS, recommended for TS
- **Line length**: Max 120 chars
- **Formatting**: Prettier (printWidth: 120, singleQuote: true, trailingComma: 'all')
- **TypeScript**: Strict mode enabled, ES2021+
- **Naming**: camelCase for variables/functions, PascalCase for components


### MCP
- When you need to search docs, use `context7` tools.
- When you need to search read, edit database, use `supabase` tools
- When you need to test , find error in ui, use `playwright` tools