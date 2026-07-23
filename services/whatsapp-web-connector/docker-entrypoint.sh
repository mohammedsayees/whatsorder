#!/bin/sh
set -e

mkdir -p "${CONNECTOR_DATA_DIR:-/data/sessions}"
chown -R node:node /data

exec gosu node "$@"
