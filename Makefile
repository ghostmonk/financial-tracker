.PHONY: dev build test format clean

# Development
dev:
	npm run tauri dev

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

# Clean build artifacts
clean:
	cd src-tauri && cargo clean
	rm -rf node_modules dist
