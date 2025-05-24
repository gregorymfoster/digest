# Digest Documentation

This directory contains the documentation website for Digest, built with [Nextra](https://nextra.site/).

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Export static site
npm run export
```

## Deployment

The documentation is designed to be deployed on Vercel:

1. Connect your GitHub repository to Vercel
2. Set the root directory to `docs/`
3. Vercel will automatically detect the Next.js project
4. Deploy automatically on push to main branch

## Structure

- `pages/` - Documentation content (MDX format)
- `theme.config.tsx` - Nextra theme configuration
- `next.config.js` - Next.js configuration
- `public/` - Static assets (if needed)

## Contributing

When adding new documentation:

1. Create `.mdx` files in the appropriate `pages/` subdirectory
2. Update `_meta.json` files to control navigation
3. Use MDX for enhanced content (React components in Markdown)
4. Test locally with `npm run dev`

## URL Structure

The documentation will be available at:
- https://digest-docs.vercel.app (or your custom domain)
- Individual pages follow the file structure: `/getting-started`, `/commands/sync`, etc.