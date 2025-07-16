#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Get version type (e.g., patch, minor or major)
VERSION="${VERSION:?Error: VERSION must be set (e.g., patch, minor, major)}"

git config user.name "github-actions"
git config user.email "github-actions@github.com"

# Fetch the latest commits and tags from main, then merge into current branch
git fetch origin master --tags
git merge --no-ff origin/master --no-edit

# ────────────────────────────────────────────────────────────────────────────────
# generate_changelog
#
# 1. Fetch all tags and update refs.
# 2. Determine the latest semantic version tag (vX.Y.Z).
# 3a. If no tag is found, generate the full changelog (-r 0).
# 3b. Otherwise, generate only the next release section (-r 1).
# ────────────────────────────────────────────────────────────────────────────────
generate_changelog() {
  # Retrieve the latest semantic version tag
  local latest_tag
  latest_tag=$(git tag --list --sort=-version:refname | head -n1)

  if [ -z "$latest_tag" ]; then
    echo "📝  No tags found. Generating full CHANGELOG…"
    node_modules/.bin/conventional-changelog -p angular -i CHANGELOG.md -s -r 0 -k lerna.json
  else
    echo "📝  Latest tag is $latest_tag — generating only the next release…"
    node_modules/.bin/conventional-changelog -p angular -i CHANGELOG.md -s -r 1 -k lerna.json
  fi
}

# ────────────────────────────────────────────────────────────────────────────────

# Update package versions (e.g., patch, minor or major)
echo "Setting package versions to: $VERSION"

if [[ "$VERSION" == "release" ]]; then
  # Extract the current prerelease version from lerna.json (e.g. "1.0.0-beta.3")
  current_raw=$(jq -r '.version' lerna.json)

  # Strip off any prerelease suffix to get the base version (e.g. "1.0.0")
  release_version="${current_raw%%-*}"
  echo "🚀 Converting prerelease $current_raw to final release version $release_version"

  ./node_modules/.bin/lerna version $release_version --exact --yes --no-git-tag-version --no-push --force-publish=\*
else
  echo "🔄  Bumping version: $VERSION"
  ./node_modules/.bin/lerna version $VERSION --exact --yes --no-git-tag-version --no-push --force-publish=\*
fi

# Read the new version from lerna.json
version_num=$(jq -r '.version' lerna.json)
echo "✨  New version is v$version_num"

# Generate or update CHANGELOG.md in one call
echo "📝  Generating CHANGELOG.md"
generate_changelog

# Inject latest env.example into DOCS.md
echo "🔄  Injecting env variables into DOCS.md"
./node_modules/.bin/ts-node ./package/scripts/generate-docs.ts

# Copy the main DOCS.md into docs/<version>.md
DOCS_DIR="docs"
DOCS_SRC="package/DOCS.md"
DOCS_DEST="docs/v$version_num.md"

# Ensure docs directory exists
mkdir -p "$DOCS_DIR"

# Copy and overwrite the versioned docs file
cp "$DOCS_SRC" "$DOCS_DEST"
echo "📄  Copied $DOCS_SRC to $DOCS_DEST"

# Commit all changes in a single commit (version bump, CHANGELOG, docs)
echo "🚀  Committing all changes"
git add \
  yarn.lock \
  lerna.json \
  CHANGELOG.md \
  "$DOCS_DEST" \
  "$DOCS_SRC" \
  $(find . -name 'package.json' -not -path '*/node_modules/*')

# Only commit if there are staged changes
if ! git diff --cached --quiet; then
  git commit -m "release v$version_num"
  git push origin HEAD
else
  echo "⚠️  No changes to commit"
fi

echo "✅  Prepering branch for v$version_num completed"
