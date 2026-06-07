resource "aws_s3_bucket" "payment_logs" {
  bucket = "payment-service-logs-staging"
  tags = {
    Environment = "staging"
    Service     = "payment-service"
  }
}

resource "aws_db_instance" "payment_db" {
  identifier     = "payment-db-staging"
  engine         = "postgres"
  instance_class = "db.t3.micro"
  timeout        = "5s"
}

module "payment_networking" {
  source = "./modules/networking"
}
