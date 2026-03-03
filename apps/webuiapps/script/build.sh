#!/bin/bash

set -e

echo "Build argument: $1"

echo "Starting build for vite-react-template"

if [ "$1" = "test" ]
then
    pnpm build:test
    echo "Build complete"
else
    pnpm run build
    echo "Build complete"
fi
