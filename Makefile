# (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com>
# SPDX-License-Identifier: Apache-2.0
#
# PaveDB TypeScript Client — Makefile
#
# Basic usage:
#   make test                    # typecheck + unit/contract tests
#   make docs                    # generate the markdown API reference
#   make docs-check              # verify the generated reference contract
#   make changelog               # preview the next changelog entry
#   make release                 # changelog + tarball, ready to tag
#
# VERSION is read from package.json and is the single source of truth. CI
# publishes to the GitLab npm registry from a v$(VERSION) tag; nothing here
# pushes or tags.

SHELL := $(shell command -v bash)
VERSION := $(shell node -p "require('./package.json').version")

.PHONY: help test docs docs-check bump changelog changelog-write \
        release-tag-check release-tarball release-tarball-check \
        publish-npmjs-check release clean

help:
	@grep -E '^[a-z-]+:' Makefile | cut -d: -f1 | sort | column

test:
	npm run lint
	npm test

docs:
	node scripts/gen-docs.mjs > docs/reference/api.md

docs-check: docs
	@git diff --exit-code docs/reference/api.md || \
	  { echo "docs/reference/api.md is stale — commit the regenerated file"; exit 1; }

bump:
	@test -n "$(V)" || { echo "usage: make bump V=x.y.z"; exit 2; }
	npm version --no-git-tag-version "$(V)"

changelog:
	CHANGELOG_PATH=- scripts/changelog.sh "$(VERSION)"

changelog-write:
	scripts/changelog.sh "$(VERSION)"

release-tag-check:
	@git describe --tags --exact-match 2>/dev/null | grep -qx "v$(VERSION)" || \
	  { echo "HEAD is not tagged v$(VERSION)"; exit 1; }

release-tarball: docs-check
	npm run build
	npm pack --pack-destination dist

release-tarball-check: release-tarball
	@test -f "dist/flowlexi-pavedb-client-$(VERSION).tgz" || \
	  { echo "tarball for $(VERSION) missing"; exit 1; }
	@tar -tzf "dist/flowlexi-pavedb-client-$(VERSION).tgz" | \
	  grep -q "package/dist/index.js" || \
	  { echo "tarball misses dist/index.js"; exit 1; }

publish-npmjs-check: release-tarball-check
	npm publish "dist/flowlexi-pavedb-client-$(VERSION).tgz" \
	  --access public --registry https://registry.npmjs.org --dry-run

release: changelog-write release-tarball-check
	@echo "ready: dist/flowlexi-pavedb-client-$(VERSION).tgz — tag v$(VERSION) to publish"

clean:
	rm -rf dist node_modules
