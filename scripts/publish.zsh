pnpm install
pnpm build:clean
npm version ${VERSION:-null} --no-git-tag-version
pnpm publish --no-git-checks
