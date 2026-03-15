.PHONY: dev dev-release build test format clean

# Development (debug Rust, fast compile)
dev:
	npm run tauri dev

# Development (release Rust, fast runtime)
dev-release:
	npm run tauri dev -- --release

# Build release
build:
	npm run tauri build

# Run all tests
test: test-rust test-ts

# Rust tests
test-rust:
	cd src-tauri && cargo test --lib

# TypeScript type check
test-ts:
	npx tsc --noEmit

# Format code
format:
	cd src-tauri && cargo fmt
	npx eslint --fix src/

# Check formatting without modifying
format-check:
	cd src-tauri && cargo fmt --check
	npx eslint src/

# E2E tests (headless)
test-e2e:
	npx playwright test

# E2E tests (interactive UI)
test-e2e-ui:
	npx playwright test --ui

# All tests including e2e
test-all: test test-e2e

# Clean build artifacts
clean:
	cd src-tauri && cargo clean
	rm -rf node_modules dist
