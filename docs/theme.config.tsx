import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span>📊 Digest</span>,
  project: {
    link: 'https://github.com/gregorymfoster/digest',
  },
  docsRepositoryBase: 'https://github.com/gregorymfoster/digest/tree/main/docs',
  footer: {
    text: 'Digest Documentation - Management insights for software teams',
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s – Digest'
    }
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="Digest" />
      <meta property="og:description" content="Management insights dashboard for software development teams via GitHub PR analysis" />
    </>
  ),
  sidebar: {
    titleComponent({ title, type }) {
      if (type === 'separator') {
        return <span className="cursor-default">{title}</span>
      }
      return <>{title}</>
    }
  }
}

export default config