variable "environment" {
  description = "Deployment environment: local, staging, or production."
  type        = string

  validation {
    condition     = contains(["local", "staging", "production"], var.environment)
    error_message = "environment must be one of: local, staging, production."
  }
}

variable "aws_region" {
  description = "AWS region for data residency. Confirm with legal counsel before production use (spec §4.3)."
  type        = string
  default     = "us-east-1"
}
