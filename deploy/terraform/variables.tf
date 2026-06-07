variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "cluster_name" {
  type    = string
  default = "devsecops-rag"
}

variable "kubernetes_version" {
  type    = string
  default = "1.29"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnet IDs for the EKS cluster"
}

variable "s3_bucket_name" {
  type    = string
  default = "devsecops-rag-raw-logs"
}
