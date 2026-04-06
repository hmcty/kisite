# KiShare

A lightweight tool to view and share your KiCad projects online.

Built on [KiCanvas](https://kicanvas.org/), KiShare scans for KiCad project
files and generates a static site.

See the demo site [here](https://hmcty.github.io/kishare/).

## Features

- Out-of-the-box support for hosting on GitHub Pages
- Can create and share location markers, e.g. to reference in GitHub issues / PR reviews
- Generates links for easy download of project-specific ZIP archives
- Provides basic support for inline documentation

## Usage

### Configuration

Create `kishare-config.json` in the root directory:

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
name: Build and Deploy KiShare

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Build KiShare
        uses: hmcty/kishare@main

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

