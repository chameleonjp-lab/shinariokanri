#!/usr/bin/env bash
set -euo pipefail
# Requires an isolated, fresh local PostgreSQL container. Never run against a remote URL.
contract_container=${1:?local container name required}
if [[ "$contract_container" != shinariokanri-rb09-contract* ]]; then exit 2; fi
contract_database=${2:?fresh local database name required}
if [[ "$contract_database" != rb09_contract_* ]]; then exit 2; fi
docker exec "$contract_container" createdb -U postgres "$contract_database"
repo_root=$(cd "$(dirname "$0")/../.." && pwd)
docker exec -i "$contract_container" psql -U postgres -d "$contract_database" -v ON_ERROR_STOP=1 < "$repo_root/tests/fixtures/sync/postgres-auth-storage-fixture.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do docker exec -i "$contract_container" psql -U postgres -d "$contract_database" -v ON_ERROR_STOP=1 < "$migration"; done
docker exec -i "$contract_container" psql -U postgres -d "$contract_database" -v ON_ERROR_STOP=1 < "$repo_root/tests/fixtures/sync/rls-contract.sql"
docker exec -i "$contract_container" psql -U postgres -d "$contract_database" -v ON_ERROR_STOP=1 < "$repo_root/tests/fixtures/sync/review-lifecycle-contract.sql"
