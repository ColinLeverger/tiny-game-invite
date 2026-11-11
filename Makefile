.DEFAULT_GOAL := help
PORT ?= 8000
E2E_PORT ?= 8766

.PHONY: help run smoke e2e check

help:  ## List targets
	@grep -E '^[a-z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  %-8s %s\n",$$1,$$2}'

run:  ## Serve the site on http://localhost:$(PORT) (link generator: /lien.html)
	python3 -m http.server $(PORT)

smoke:  ## Check required files exist and the game script parses
	@for f in index.html lien.html game.js icon.png og.png .nojekyll; do test -f $$f || { echo "missing: $$f"; exit 1; }; done
	@node --check game.js && echo "smoke: OK"

e2e:  ## Play the whole game in a headless browser (needs Playwright)
	@if ! node -e "try{require.resolve('playwright')}catch(e){require.resolve('playwright-core')}" >/dev/null 2>&1; then \
	  echo "SKIP e2e (no Playwright here; CI runs it with the runner's Chrome; locally: npm install --no-save playwright-core and set CHROMIUM_PATH)"; exit 0; fi; \
	python3 -m http.server $(E2E_PORT) >/dev/null 2>&1 & pid=$$!; trap "kill $$pid" EXIT; sleep 0.7; \
	BASE=http://localhost:$(E2E_PORT) node tests/e2e.mjs

check: smoke e2e  ## Full gate: what CI runs
