#!/bin/bash
echo "Generating Prisma client..."
node --max-old-space-size=256 ./node_modules/prisma/build/index.js generate
echo "Running Prisma migrations..."
node --max-old-space-size=256 ./node_modules/prisma/build/index.js migrate deploy
echo "Migrations completed. Starting server..."
node --max-old-space-size=256 dist/index.js
