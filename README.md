<p align=center>
  <img width="800" src="https://github.com/user-attachments/assets/96e47109-f9a3-47f6-87ed-ed5c3781c1a2" alt="EasyLayer How It Works"/>
</p>
<p align="center">
  <b>Bitcoin Crawler</b> is a self-hosted framework for building custom blockchain indexers and parsers. Monitor and index Bitcoin blockchain data - both historical and real-time.
</p>
<br>

<p align="center">
  <a href="https://www.npmjs.com/package/@easylayer/bitcoin-crawler"><img alt="npm version" src="https://img.shields.io/npm/v/@easylayer/bitcoin-crawler.svg?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/@easylayer/bitcoin-crawler"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@easylayer/bitcoin-crawler.svg?style=flat-square"></a>
  <a href="./LICENSE">License: AGPL-3.0</a>
</p>

---

<p align="center">
  <a href="https://easylayer.io">Website</a> | <a href="https://easylayer.io/docs">Docs</a> | <a href="https://github.com/easylayer/core/discussions">Discussions</a>
</p>

<br>

# EasyLayer Bitcoin Crawler

> The sections below are intended for contributors. If you are a user and just want to use this application, please visit our [documentation](https://easylayer.io/docs) for usage instructions.

## Table of Contents
- [Monorepo Overview](#monorepo-overview)
- [Architecture Overview](#architecture-overview)
- [Developer Setup](#developer-setup)
- [Development Workflow](#development-workflow)
- [Contributing](#contributing)
- [Issue Reporting](#issue-reporting)
- [License](#license)

## Monorepo Overview

| Component           | Description                                                         |
|---------------------|---------------------------------------------------------------------|
| 📦 `package/`       | Source code of the SDK                                              |
| 🚀 `examples/`      | Apps examples                                                |
| 🧪 `e2e-tests-server/`     | End-to-end test suites                                              |
| 🔌 `integration-tests/` | Integration test suites                                     |

## Architecture Overview

<!-- TODO: Add architecture overview
- Core components (models, providers, event store)
- Event Sourcing and CQRS patterns
- Key modules and their responsibilities
- How components interact
-->

## Developer Setup

> <b>Node.js version:</b> 20 or higher is required. We recommend using the latest LTS (currently 22+).<br>
> <b>Yarn version:</b> 4.5+ is required (Yarn Berry).  
> Yarn is included in the repository under <code>.yarn/releases/</code>, so you do not need to install it globally.  
> You can run all commands using <code>yarn</code> if you have Yarn 4+ or Corepack enabled, or use <code>node .yarn/releases/yarn-4.5.0.cjs &lt;command&gt;</code> directly.

1. **Clone the repository:**
```bash
git clone https://github.com/easylayer/bitcoin-crawler.git
cd bitcoin-crawler
```

2. **Install dependencies:**
```bash
yarn install
```

3. **Build all packages:**
```bash
yarn build
```

4. **Lint and format code:**
```bash
yarn lint
# or
yarn lint:fix
```

5. **Run unit tests:**
```bash
yarn test:unit
```

6. **E2E tests**:
```bash
yarn test:e2e
```

7. **Integration tests**:
```bash
yarn test:integration
```

8. **Run example app**
```bash
cd examples/<app_name>
cp .env.example .env
yarn start
```
- For additional configuration options, refer to the documentation in the `docs/` directory

> **Note:** You can explore more examples in the `examples/` directory or check available commands in the root `package.json`.

## Development Workflow

<!-- TODO: Add development workflow guidelines
- How to create a new feature
- How to write and run tests
- Debugging tips
- Code review process
-->

## Contributing

We welcome contributions! To get started:
- Fork this repository and create a new branch for your feature or bugfix.
- Make your changes and ensure all tests and lints pass locally.
- Submit a pull request (PR) to the `development` branch.
- - All PRs must use the provided pull request template.
- - Branch names and commit messages must follow the [Conventional Changelog](https://www.conventionalcommits.org/) style. Allowed types: `feat`, `fix`, `infra`, `refactor`, `chore`, `BREAKING` (see `.czrc` for details). Please use descriptive messages for each commit.
- - All PRs are automatically checked by our GitHub Actions workflow (build, lint, unit tests).

## Issue Reporting

If you encounter a bug or have a feature request related to the `bitcoin-crawler` repository, please [open an issue](https://github.com/easylayer/bitcoin-crawler/issues/new/choose) and provide as much detail as possible. For issues related to other EasyLayer projects, please use the appropriate repository.

## License

This project is licensed under the [GNU Affero General Public License v3.0](./LICENSE).