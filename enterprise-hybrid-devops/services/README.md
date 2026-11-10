# Microservices

`order-service/` is the **complete reference implementation** (pom, Dockerfile,
configuration, controller). The other two deployables follow exactly the same
layout so that the review focuses on the platform contract instead of three
copies of the same `pom.xml`.

```
services/
├── order-service/          # complete reference: HTTP API + Actuator
├── notification-service/   # same skeleton, no business endpoints called by users
└── kafka-consumer/         # same skeleton + spring-kafka listener
```

## The contract every service must honour

1. **Build**: `mvn -B clean verify` produces exactly one jar named
   `target/<service>.jar`. The Jenkinsfile builds the image with
   `--build-arg JAR_FILE=target/<service>.jar`.
2. **Ports**: `8080` application, `8081` Actuator. Probes and metrics use 8081,
   so the ingress never exposes health endpoints.
3. **Health**: `/actuator/health/readiness` and `/actuator/health/liveness` must
   exist and reflect real dependency state for readiness only. Liveness must not
   fail because Oracle or Kafka is slow — that would restart healthy pods.
4. **Config**: everything comes from environment variables (ConfigMap) or the
   mounted secret volume. No `application-prod.yml` with hostnames in it.
5. **Shutdown**: `server.shutdown: graceful` plus the `preStop` sleep in the
   Deployment, so the endpoint is removed before the JVM exits.
6. **Container**: non-root UID 10001, writable `/tmp` only, image built with a
   multi-stage Dockerfile, no secrets in layers.

## Kafka consumer skeleton

```java
@Component
class OrdersListener {

    private final OrderRepository repository;

    OrdersListener(OrderRepository repository) {
        this.repository = repository;
    }

    @KafkaListener(
        topics = "${ehd.kafka.topic-orders}",
        groupId = "kafka-consumer",
        concurrency = "${ehd.kafka.concurrency:3}")
    void onOrderEvent(OrderEvent event) {
        // Idempotent handling: every event carries an eventId used as a
        // deduplication key. Offset is committed only after this returns.
        repository.apply(event);
    }
}
```

Credentials (`KAFKA_USERNAME`, `KAFKA_PASSWORD`) come from the Secret synced by
the Secrets Store CSI driver. `KAFKA_BOOTSTRAP_SERVERS` and the topic name come
from the ConfigMap. Because the consumer group is the Deployment name, `HPA
maxReplicas` must never exceed the partition count.
