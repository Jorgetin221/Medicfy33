// Resources are added as each module needs them, not speculatively.
// Expected shape per spec §4.3: RDS (PostgreSQL 16), ECS Fargate or Railway
// for the API, S3/R2 with SSE-KMS for file storage, and Redis for BullMQ.
