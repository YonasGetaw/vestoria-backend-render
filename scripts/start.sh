#!/bin/bash
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Migrations completed. Starting server..."
npm start
