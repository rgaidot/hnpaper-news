#!/usr/bin/env bash

set -e

if [ -z "$1" ]; then
  echo "❌ Usage: ./release.sh X.Y.Z"
  exit 1
fi

VERSION="$1"
TARGET_BRANCH="main"
REMOTE="origin"

echo "🚀 Starting release $VERSION"
echo ""

if [[ -n $(git status -s) ]]; then
  echo "❌ Working directory not clean. Commit or stash changes first."
  exit 1
fi

git checkout $TARGET_BRANCH

git pull $REMOTE $TARGET_BRANCH

git tag -a $VERSION -m "Release $VERSION"

git push $REMOTE $TARGET_BRANCH
git push $REMOTE $VERSION

echo ""
echo "✅ Release $VERSION completed successfully!"
