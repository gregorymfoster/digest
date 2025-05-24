# Contributing to digest

Thank you for considering contributing to digest! This document outlines the guidelines for contributing to this management analytics project.

## Development Setup

1. Ensure you have Node.js 20+ installed (use nvm for managing Node versions)
2. Clone the repository
3. Install dependencies: `npm install`
4. Run tests: `npm test`

## Code Style and Structure

**See `STYLE_GUIDE.md` for complete coding standards.** Key principles:
- Functional programming with no classes
- Composition over inheritance  
- Colocated tests (`.test.ts` files next to source)
- TypeScript strict mode with explicit return types

### Testing

**Test Organization:**
- Tests should live next to the files they're testing (`file.ts` and `file.test.ts`)
- Use vitest for writing tests
- Aim for high test coverage, especially for analytics algorithms

**Testing Layers:**
1. **Unit Tests**: Analytics algorithms and pure functions
   - Test metrics computation with known datasets
   - Validate quality scoring algorithms
   - Test data transformation functions
   - Mock external dependencies using dependency injection

2. **Integration Tests**: Database operations and multi-repo sync
   - Use temporary SQLite databases for testing
   - Test schema migrations and data integrity
   - Verify incremental sync behavior
   - Test multi-repository coordination

3. **Analytics Tests**: Insights accuracy and business logic
   - Validate analytics accuracy with synthetic datasets
   - Test edge cases in metrics computation
   - Verify trend analysis algorithms
   - Test knowledge gap detection logic

4. **Contract Tests**: External API compatibility
   - Test GitHub CLI output parsing for multiple repositories
   - Validate organization discovery functionality
   - Test API response handling across different GitHub configurations

5. **Performance Tests**: Scalability and large dataset handling
   - Test large organization analytics processing
   - Verify query performance with substantial datasets
   - Test memory usage with multiple repositories
   - Validate concurrent processing efficiency

**Test Commands:**
```bash
npm run test                    # Unit tests only
npm run test:integration        # Integration tests with temp databases
npm run test:analytics         # Analytics accuracy tests
npm run test:performance       # Performance and scalability tests
npm run test:all               # All test suites
```

### Management-Focused Testing
- **Privacy Testing**: Verify anonymization features work correctly
- **Accuracy Testing**: Validate that insights match expected outcomes
- **Scalability Testing**: Ensure performance with large organizations
- **Export Testing**: Verify report generation and export functionality

### Development Commands
**See `STYLE_GUIDE.md` for complete command reference.**
- `npm run ci` - Full quality pipeline (lint + typecheck + test + build)
- `npm run test:watch` - Continuous testing during development

## Git Workflow

### Branching
- Create feature branches from `main`
- Use descriptive branch names (`feature/team-analytics`, `fix/quality-scoring`)

### Commits
- Write clear, concise commit messages
- Follow conventional commits format when possible: 
  - `feat: add team collaboration metrics`
  - `fix: handle missing PR review data`
  - `docs: improve analytics configuration guide`

### Pull Requests
- Create PRs against the `main` branch
- Fill out the PR template completely
- Ensure all CI checks pass before requesting review
- Include analytics validation for new metrics

## Running the Project Locally

```bash
# Build the project
npm run build

# Run management commands
npm run dev init --org myorg
npm run dev sync --repos repo1,repo2
npm run dev team --timeframe monthly
npm run dev contributors --top 10
npm run dev report team-summary --export csv

# For development with auto-reload
npm run dev:watch

# Testing during development
npm run test:watch             # Watch mode for unit tests
npm run test:integration        # Run integration tests
npm run test:analytics         # Run analytics accuracy tests
```

## Analytics Development Guidelines

### Metrics Implementation
- **Accuracy First**: All metrics must be mathematically sound
- **Business Value**: Every metric should answer a management question
- **Performance**: Optimize for large datasets and multiple repositories
- **Privacy**: Consider data sensitivity and anonymization needs

### Quality Assurance for Analytics
- Test metrics algorithms with known inputs and expected outputs
- Validate against synthetic datasets with controlled characteristics
- Verify edge case handling (empty repositories, single developers, etc.)
- Ensure consistent results across multiple runs

### Documentation Requirements
- Document the business purpose of each metric
- Explain calculation methodology clearly
- Provide examples of how insights should be interpreted
- Include guidance on when metrics may be misleading

## Definition of Done

Before considering a feature complete, ensure:

1. **Code Quality:**
   - All unit tests pass (`npm run test`)
   - Integration tests pass for database operations
   - Analytics tests validate accuracy with known datasets
   - Linting passes (`npm run lint`)
   - Type checking passes (`npm run typecheck`)
   - Full CI pipeline passes (`npm run ci`)

2. **Analytics Quality:**
   - Metrics algorithms tested with multiple scenarios
   - Performance validated with large synthetic datasets
   - Edge cases handled gracefully
   - Results interpretable and actionable for management

3. **Privacy and Security:**
   - Anonymization features work as expected
   - No sensitive data leaked in exports or logs
   - Data retention policies respected
   - Access controls function correctly

4. **Management Value:**
   - Feature provides clear insights for engineering leadership
   - Documentation explains business value and interpretation
   - Export formats support management workflows
   - Insights are actionable and decision-enabling

5. **Testing Coverage:**
   - Unit tests for all analytics algorithms
   - Integration tests for database operations
   - Performance tests for scalability scenarios
   - Error scenarios tested (API failures, data inconsistencies)

6. **Documentation:**
   - Analytics methodology documented clearly
   - Management interpretation guides provided
   - Configuration options explained
   - Examples of real-world usage included

7. **Architecture Compliance:**
   - Follows design document's analytics architecture
   - Uses functional programming principles
   - Implements proper error handling
   - Maintains separation between data collection and analysis

8. **Scalability:**
   - Supports multiple repositories efficiently
   - Handles large organizations without performance degradation
   - Memory usage remains reasonable with substantial datasets
   - Concurrent operations work correctly

## Management Analytics Focus

When contributing to digest, always consider:

- **Management Perspective**: How will this help engineering leaders make better decisions?
- **Data Privacy**: Are we handling developer data responsibly and transparently?
- **Actionable Insights**: Do the analytics lead to specific, useful actions?
- **Scalability**: Will this work for large organizations with many teams?
- **Accuracy**: Are the insights mathematically sound and business-relevant?

## License

By contributing to digest, you agree that your contributions will be licensed under the project's MIT license.