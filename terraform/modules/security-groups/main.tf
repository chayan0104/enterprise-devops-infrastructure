###############################################################################
# Module: security-groups
# Three groups, each with one owner and one job:
#   alb        -> internet 443 (+80 redirect), egress to WildFly + EKS nodes
#   wildfly    -> 8080 from ALB only, SSH from bastion CIDR only, egress to
#                 EKS runtime nodes, RDS, DocumentDB, Kafka, SFTP, AWS APIs
#   eks_nodes  -> pod-to-pod, ALB to NodePort/Ingress, egress to dependencies
# Stateful security groups mean replies are automatic; only request rules are
# declared. NACLs are left at VPC defaults so SG rules stay the single source.
###############################################################################

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public ALB: HTTPS from approved CIDRs"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from users / corporate ingress"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.alb_ingress_cidrs
  }

  ingress {
    description = "HTTP, redirected to HTTPS by the listener"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.alb_ingress_cidrs
  }

  egress {
    description     = "Forward to WildFly targets on the app port"
    from_port       = var.wildfly_port
    to_port         = var.wildfly_port
    protocol        = "tcp"
    security_groups = [aws_security_group.wildfly.id]
  }

  egress {
    description     = "Forward to EKS ingress / NodePort"
    from_port       = 30000
    to_port         = 32767
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  tags = merge(var.tags, { Name = "${var.name}-alb" })
}

resource "aws_security_group" "wildfly" {
  name        = "${var.name}-wildfly"
  description = "WildFly EC2: HTTP 8080 from ALB, SSH from bastion only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Application traffic from the ALB"
    from_port       = var.wildfly_port
    to_port         = var.wildfly_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "SSH from the bastion / SSM-less emergency path"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.bastion_cidrs
  }

  # WildFly JGroups cluster traffic (optional standalone HA setup)
  ingress {
    description = "JGroups cluster communication inside the ASG"
    from_port   = 7600
    to_port     = 7600
    protocol    = "tcp"
    self        = true
  }

  egress {
    description = "HTTPS to AWS APIs (Secrets Manager, S3, CloudWatch, SSM)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description     = "HTTPS to EKS microservices through the internal NLB/Ingress"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  egress {
    description     = "Plain HTTP to internal microservice NodePort range (UAT only)"
    from_port       = 30000
    to_port         = 32767
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  egress {
    description = "Oracle RDS / DocumentDB / Kafka / SFTP live outside this VPC"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = var.external_dependency_cidrs
  }

  tags = merge(var.tags, { Name = "${var.name}-wildfly" })
}

resource "aws_security_group" "eks_nodes" {
  name        = "${var.name}-eks-nodes"
  description = "EKS worker nodes: pods, kubelet, ingress traffic"
  vpc_id      = var.vpc_id

  ingress {
    description = "Node to node / pod to pod inside the node group"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  ingress {
    description     = "ALB / ingress to NodePort for HTTP services"
    from_port       = 30000
    to_port         = 32767
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "WildFly calling internal microservices on 443"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.wildfly.id]
  }

  egress {
    description = "AWS APIs, ECR image pulls, external dependencies via NAT/peering"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name}-eks-nodes"
    # Recommended tag so the AWS Load Balancer Controller can target the group.
    "kubernetes.io/cluster/${var.eks_cluster_name}" = "owned"
  })
}

# NOTE: the node -> control-plane rule is owned by the eks module, because the
# cluster security group is created there. Referencing it from this module would
# create a dependency cycle (eks consumes this module's node security group).
