# Digest

Management insights dashboard for software development teams via GitHub PR analysis.

## Quick Start

```bash
# Install dependencies
npm install

# Sync PR data from a repository
npm run dev sync owner/repo

# View contributor insights
npm run dev contributors

# Export data for analysis
npm run dev export --csv
```

## Requirements

- Node.js 20+
- GitHub Personal Access Token (PAT) with repository read access
- Access to GitHub repositories you want to analyze

## Authentication

digest supports multiple authentication methods (in order of priority):

1. **Environment variable:** `GITHUB_TOKEN=ghp_your_token_here`
2. **GitHub CLI token:** Automatically uses `gh auth token` if available
3. **Configuration file:** Set `github.token` in config

Run `gh auth login` or set `GITHUB_TOKEN` environment variable to get started.

## Commands

- `digest sync <owner/repo>` - Sync PR data from repository
- `digest contributors` - Show top contributors and activity
- `digest reviews` - Show review turnaround times and patterns
- `digest export` - Export data to CSV/JSON for further analysis

## Development

See [STYLE_GUIDE.md](./STYLE_GUIDE.md) for development standards and [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

```bash
npm run dev        # Run CLI locally
npm run test       # Run tests
npm run ci         # Full quality pipeline
```