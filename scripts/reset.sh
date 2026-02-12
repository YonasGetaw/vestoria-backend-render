#!/bin/bash
echo "Resetting database..."
node --max-old-space-size=256 ./node_modules/prisma/build/index.js migrate reset --force
echo "Regenerating Prisma client..."
node --max-old-space-size=256 ./node_modules/prisma/build/index.js generate
echo "Starting server..."
node --max-old-space-size=256 dist/index.js
