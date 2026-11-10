package com.ehd.order;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import java.time.Instant;

/**
 * Placeholder repository. In the real service this is a JPA repository backed
 * by the EXISTING Oracle RDS primary, with the credential read from
 * /mnt/secrets-store or the synced Kubernetes Secret.
 *
 * <p>The point of this class in the reference project is the configuration
 * contract: every environment-specific value comes from the environment, so
 * the same image runs in UAT and PROD.
 */
@Repository
public class OrderRepository {

    private final String oracleHost;
    private final String environment;

    public OrderRepository(
            @Value("${ORACLE_HOST:not-configured}") String oracleHost,
            @Value("${SPRING_PROFILES_ACTIVE:local}") String environment) {
        this.oracleHost = oracleHost;
        this.environment = environment;
    }

    public OrderSummary summary() {
        // No database call in the reference implementation: the connectivity
        // and failover behaviour belongs to the real service and its DBA-owned
        // schema. We only report which endpoint the pod is configured with.
        return new OrderSummary(
                "OK",
                environment,
                oracleHost,
                Instant.now().toString());
    }

    public record OrderSummary(String status, String environment, String oracleHost, String checkedAt) {
    }
}
