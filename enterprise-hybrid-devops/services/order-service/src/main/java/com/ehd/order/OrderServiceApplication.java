package com.ehd.order;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Minimal, deliberately boring Spring Boot service.
 *
 * It exists to show the container contract the platform depends on:
 *   - /actuator/health/readiness and /actuator/health/liveness for probes
 *   - /api/orders as a business endpoint called by the WildFly application
 *   - configuration from environment variables (ConfigMap + Secrets Manager)
 * Nothing here knows about AWS: credentials arrive as environment variables
 * synced from Secrets Manager, or are fetched by the AWS SDK using the pod's
 * IRSA role.
 */
@SpringBootApplication
public class OrderServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }

    @RestController
    static class OrderController {

        private final OrderRepository repository;

        OrderController(OrderRepository repository) {
            this.repository = repository;
        }

        @GetMapping("/api/orders")
        OrderSummary orders() {
            return repository.summary();
        }

        @GetMapping("/api/orders/health")
        String health() {
            return "order-service ok";
        }
    }
}
