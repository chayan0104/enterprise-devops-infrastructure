###############################################################################
# Module: eks
# One managed EKS cluster + one managed node group for all Spring Boot
# services and Kafka consumers. Cluster IAM, OIDC provider (for IRSA) and the
# node group live here so the module is self-contained.
# AWS Load Balancer Controller, External Secrets Operator and the Secrets
# Store CSI driver are platform prerequisites (see docs/OPERATIONS.md).
###############################################################################

data "aws_partition" "current" {}

# ---------------------------------------------------------------------------
# Control plane role
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "cluster_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster" {
  name               = "${var.cluster_name}-cluster"
  assume_role_policy = data.aws_iam_policy_document.cluster_assume.json
  tags               = merge(var.tags, { Name = "${var.cluster_name}-cluster" })
}

resource "aws_iam_role_policy_attachment" "cluster" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_security_group" "cluster" {
  name        = "${var.cluster_name}-control-plane"
  description = "EKS control plane security group"
  vpc_id      = var.vpc_id

  egress {
    description = "Control plane to nodes and AWS APIs"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.cluster_name}-control-plane" })
}

resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  version  = var.kubernetes_version
  role_arn = aws_iam_role.cluster.arn

  vpc_config {
    subnet_ids              = var.private_subnet_ids
    security_group_ids      = [aws_security_group.cluster.id, var.nodes_security_group_id]
    endpoint_private_access = true
    # PROD: keep public access restricted to office/VPN CIDRs or disable it.
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.public_access_cidrs
  }

  # EKS control plane logs -> CloudWatch (no separate CloudWatch module).
  enabled_cluster_log_types = var.cluster_log_types

  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }

  tags = var.tags

  depends_on = [aws_iam_role_policy_attachment.cluster]
}

# OIDC provider enables IRSA: service accounts get their own least-privilege role.
data "tls_certificate" "oidc" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "this" {
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.oidc.certificates[0].sha1_fingerprint]
  tags            = var.tags
}

# ---------------------------------------------------------------------------
# Managed node group role (least privilege: worker, ECR pull, CNI)
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "node_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node" {
  name               = "${var.cluster_name}-node"
  assume_role_policy = data.aws_iam_policy_document.node_assume.json
  tags               = merge(var.tags, { Name = "${var.cluster_name}-node" })
}

resource "aws_iam_role_policy_attachment" "node" {
  for_each = toset([
    "AmazonEKSWorkerNodePolicy",
    "AmazonEKS_CNI_Policy",
    "AmazonEC2ContainerRegistryReadOnly",
  ])

  role       = aws_iam_role.node.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/${each.value}"
}

# Nodes get BOTH the project node security group (ALB -> NodePort, WildFly -> 443)
# and the EKS cluster security group (kubelet <-> control plane). A launch
# template is the only supported way to attach the project group to a managed
# node group, so it lives here rather than in the security-groups module.
resource "aws_launch_template" "node" {
  name_prefix = "${var.cluster_name}-node-"

  vpc_security_group_ids = [var.nodes_security_group_id, aws_security_group.cluster.id]

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2 # pods need IMDS access for the EKS CNI
  }

  tag_specifications {
    resource_type = "instance"
    tags          = merge(var.tags, { Name = "${var.cluster_name}-node", Environment = var.environment_tag })
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Nodes -> control plane only. No 443 rule on the cluster SG from the internet.
resource "aws_security_group_rule" "nodes_to_control_plane" {
  type                     = "ingress"
  description              = "Node kubelets and webhooks to the EKS control plane"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.cluster.id
  source_security_group_id = var.nodes_security_group_id
}

resource "aws_eks_node_group" "app" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.cluster_name}-app"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids

  instance_types = var.node_instance_types
  capacity_type  = var.capacity_type # ON_DEMAND in prod, SPOT allowed in UAT

  launch_template {
    id      = aws_launch_template.node.id
    version = aws_launch_template.node.latest_version
  }

  scaling_config {
    min_size     = var.node_min_size
    max_size     = var.node_max_size
    desired_size = var.node_desired_size
  }

  update_config {
    max_unavailable = 1
  }

  labels = {
    role        = "applications"
    environment = var.environment_tag
  }

  tags = merge(var.tags, {
    "kubernetes.io/cluster/${var.cluster_name}" = "owned"
  })

  lifecycle {
    ignore_changes = [scaling_config[0].desired_size] # HPA/cluster-autoscaler owns this
  }

  depends_on = [aws_iam_role_policy_attachment.node]
}

# Core add-ons only. Observability add-ons are installed from the monitoring
# directory, not from Terraform.
resource "aws_eks_addon" "this" {
  for_each = toset(["vpc-cni", "coredns", "kube-proxy"])

  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = each.value
  resolve_conflicts_on_update = "OVERWRITE"

  tags = var.tags
}
