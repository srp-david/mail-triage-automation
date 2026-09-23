const fs = require('node:fs');
const path = require('node:path');
const readmePath = path.resolve(__dirname, '../README.md');
const generatedAssets = path.resolve(__dirname, '.generated-assets');
fs.mkdirSync(generatedAssets, { recursive: true });

const config = {
  title: 'Mail Triage 기술 문서',
  tagline: '구조, 개발, 운영과 검증 기록',
  url: 'http://localhost:3000',
  baseUrl: '/',
  trailingSlash: true,
  onBrokenLinks: 'throw',
  noIndex: true,
  staticDirectories: ['.generated-assets'],
  plugins: [
    function sourceDownloads() {
      return {
        name: 'source-downloads',
        getPathsToWatch() {
          return [readmePath];
        },
        loadContent() {
          // Publish exactly this public repository file, never scan the repo/runtime.
          fs.copyFileSync(readmePath, path.join(generatedAssets, 'project-readme.txt'));
        },
        configureWebpack() {
          return { module: { rules: [{ test: /\.cjs$/, type: 'javascript/auto' }] } };
        },
      };
    },
  ],
  i18n: { defaultLocale: 'ko', locales: ['ko'] },
  markdown: {
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks({ url, sourceFilePath }) {
        // The repository README is outside the docs plugin: offer its raw text.
        if (
          url === '../README.md' &&
          sourceFilePath.replaceAll('\\', '/').endsWith('/docs/README.md')
        )
          return '/project-readme.txt';
        throw new Error(`Unresolved Markdown link: ${sourceFilePath} -> ${url}`);
      },
      onBrokenMarkdownImages: 'throw',
    },
  },
  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
        },
        blog: false,
        pages: false,
        theme: { customCss: './src/css/custom.css' },
      },
    ],
  ],
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsDir: '../docs',
        docsRouteBasePath: '/',
        indexBlog: false,
        language: ['ko', 'en'],
        forceIgnoreNoIndex: true,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'Mail Triage',
      items: [
        { type: 'docSidebar', sidebarId: 'guide', label: '기술 문서', position: 'left' },
        { to: '/guides/development/', label: '개발 안내', position: 'left' },
      ],
    },
    footer: { style: 'dark', copyright: 'Mail Triage · 내부 기술 문서' },
    colorMode: { respectPrefersColorScheme: true },
    prism: { additionalLanguages: ['powershell', 'sql', 'bash', 'json'] },
  },
};

module.exports = config;
