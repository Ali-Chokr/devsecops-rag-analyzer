# Terraform (AWS skeleton)

Provisions baseline resources for the RAG platform:

- S3 bucket for raw log archival (versioning enabled)
- EKS cluster skeleton

## Usage

```bash
cd deploy/terraform
terraform init
terraform plan  -var='subnet_ids=["subnet-abc","subnet-def"]'
terraform apply -var='subnet_ids=["subnet-abc","subnet-def"]'
```

After apply, push images to ECR and deploy Kubernetes manifests from [deploy/aws/k8s/](../aws/README.md).
