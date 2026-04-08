# KiSite

A lightweight tool to view and share your KiCad projects online.

Built on [KiCanvas](https://kicanvas.org/), KiSite scans for KiCad project
files and generates a static site.

See the demo [here](https://hmcty.github.io/kisite/).

## Features

- Out-of-the-box support for hosting on GitHub Pages
- Location markers for reference in GitHub issues / PR reviews
- Download links for each project ZIP
- Basic support for inline documentation

## Usage

### Configuration

Create `kisite-config.json` in the root directory:

```json
{
  "title": "My KiCad Projects",
  "projectDirs": ["projects"],
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `title` | Displayed as site title | Repository name |
| `projectDirs` | Array of directories containing KiCad project files | `["projects"]` |

### Deployment

#### GitHub Pages

After enabling [GitHub Pages in your repository settings](https://docs.github.com/en/pages/quickstart), add the following GitHub workflow:

```yaml
name: Build and Deploy KiSite

on:
  push:
    branches: [main]
  workflow_dispatch:

# Sets permissions for GitHub Pages deployment
permissions:
  contents: read
  pages: write
  id-token: write

# Allow only one concurrent deployment
concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          submodules: recursive

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '24'

      - run: npm install kisite@1.1.0
      - run: npm exec kisite build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

See the [demo workflow](./.github/workflows/deploy.yml) for a complete example.

#### Manual Build

Install the KiSite CLI:

```bash
npm install -g kisite
```

Build site:

```bash
npm exec kisite build
```

Alternatively, run the development server:

```bash
npm exec kisite dev
```
