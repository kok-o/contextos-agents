# Terraform - Examples & Refactoring Scenarios

## Example 1: Zero-Downtime Address Refactoring with `moved` Blocks

When moving an inline resource into a dedicated child module, never allow Terraform to destroy and recreate it:

```hcl
# Before refactor (in root main.tf):
# resource "aws_s3_bucket" "assets" {
#   bucket = "company-production-assets"
# }

# After refactor:
module "storage" {
  source      = "../../modules/storage"
  bucket_name = "company-production-assets"
}

# Refactor migration declaration (prevents destructive delete/recreate):
moved {
  from = aws_s3_bucket.assets
  to   = module.storage.aws_s3_bucket.this
}
```

---

## Example 2: Safe Environment Module Pattern

```hcl
# environments/prod/versions.tf
terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50.0"
    }
  }

  backend "s3" {
    bucket         = "tf-state-prod-lock"
    key            = "core/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tf-state-locks"
    encrypt        = true
  }
}
```

---

## Example 3: Safe Destroy Verification Script

```bash
#!/usr/bin/env bash
set -euo pipefail

TARGET_RESOURCE="${1:-}"

if [[ -z "$TARGET_RESOURCE" ]]; then
  echo "Error: Target resource address must be specified."
  exit 1
fi

echo "Running safe destroy inspection for: $TARGET_RESOURCE"
terraform plan -destroy -target="$TARGET_RESOURCE" -out="destroy.tfplan"

# Display affected resources
terraform show -json destroy.tfplan | jq -r '.resource_changes[] | select(.change.actions[] == "delete") | .address'

echo "Carefully inspect the resources above. Run terraform apply destroy.tfplan only after manual confirmation."
```
