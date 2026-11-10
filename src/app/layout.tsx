import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "enterprise-hybrid-devops · control plane",
  description:
    "Operations console for the enterprise hybrid DevOps project: WildFly on EC2, Spring Boot on EKS, Terraform, Jenkins, Kubernetes and environment-specific monitoring.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-text antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
