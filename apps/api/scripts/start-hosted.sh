#!/bin/sh
# Free demo hosts have no separate migration/release hook.
set -eu

node node_modules/prisma/build/index.js migrate deploy
exec node dist/main.js
