# @pascalsalesch/pages

> A build tool and dev server for static sites.

- [Getting Started](#getting-started)
- [GitHub Action](#github-action)
  - [Action Options](#action-options)
- [CLI](#cli)
  - [Command Line Options](#command-line-options)

## Getting Started

This package is published at the GitHub Package Registry.
To install it, you need to authenticate with GitHub.
You can do this by creating a personal access token (`NODE_AUTH_TOKEN`) and then adding it to your `~/.npmrc` file.

```bash 
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
@pascalsalesch:registry=https://npm.pkg.github.com
```

Then you can install the package with `npm install @pascalsalesch/pages`.


## GitHub Action

This repository also provides a GitHub Action to build and deploy your static site.
You can use it like this:

```yaml
jobs:
    - uses: pascalsalesch/pages@latest
      with:
        sourceToken: ${{ secrets.GITHUB_TOKEN }}
        targetToken: ${{ secrets.GITHUB_TOKEN }}
```

The action will build your site and push it to the `gh-pages` branch.

### Action Options

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| `source` | The source repository to build from. | No | `{org}/{repo}@{branch}` |
| `sourceToken` | The token to use to checkout the source repository. | Yes | |
| `target` | The repository to deploy to. | No | `{org}/{repo}@gh-pages` |
| `targetToken` | The token to use to push to the target repository. | Yes | |
| `targetOutput` | The directory to build to in the target repository.<br>The prefix will not be added to this path. | No | `.` |
| `targetKeep` | Comma-separated list of regexes to keep in the target repository (Does not protect from overwriting). | No | |
| `prefix` | The prefix to use. The prefix will be prepended to URLs. | No | |
| `suffix` | The suffix to use. The suffix will be prepended to the URL extension. | No | |


## CLI

You can also install a binary to start a dev server and build your site locally with `npx @pascalsalesch/pages`.

## Command Line Options

| Option | Description | Type | Default |
| --- | --- | --- | --- |
| `--cwd` | The current working directory to use. | string | `process.cwd()` |
| `--output` | The output directory to use.<br>The prefix will be added to this path | string | `./dist` |
| `--port` | The port to use for the development server. | number | `8080` |
| `--watch` | Whether to watch for changes and rebuild automatically. | flag | `false` |
| `--verbose` | Whether to output verbose logging. | flag | `false` |
| `--prefix` | The prefix to use for all generated URLs. | string | `''` |
| `--suffix` | The suffix to use for all generated URLs. | string | `''` |
