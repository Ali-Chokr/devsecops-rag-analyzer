# Terraform IaC for DevSecOps RAG Analyzer

This module provisions baseline AWS resources:

- S3 bucket for raw log archival (versioning enabled)
- EKS cluster skeleton

## Usage

```bash
cd deploy/terraform
terraform init
terraform plan -var='subnet_ids=["subnet-abc123","subnet-def456"]'
terraform apply -var='subnet_ids=["subnet-abc123","subnet-def456"]'
```

After apply, push container images to ECR and deploy Kubernetes manifests from `deploy/aws/k8s/`.
