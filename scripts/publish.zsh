pnpm install
pnpm build:clean
pnpm exec tsx scripts/publish-package-json.ts "${VERSION:-null}"
pnpm publish --access public --no-git-checks
