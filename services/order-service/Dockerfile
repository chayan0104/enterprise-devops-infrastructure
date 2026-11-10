# Multi-stage build: Maven/JDK only in the builder, tiny runtime image.
# No secrets, no AWS credentials and no environment-specific values are baked in.
# Build args are limited to the jar location so the image is reproducible.

# ---------- build stage ----------
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace
# Cache dependencies separately from sources.
COPY pom.xml .
RUN mvn -B -ntp dependency:go-offline
COPY src ./src
RUN mvn -B -ntp clean package -DskipTests

# ---------- runtime stage ----------
FROM eclipse-temurin:17-jre-jammy
ARG JAR_FILE=target/order-service.jar

# Run as a non-root user that matches the Kubernetes securityContext.
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /workspace/${JAR_FILE} /app/app.jar
RUN mkdir -p /app/logs && chown -R 10001:10001 /app
USER 10001:10001

# 8080 = application, 8081 = actuator/management (probes and metrics)
EXPOSE 8080 8081

# MaxRAMPercentage keeps the JVM inside the container limit; ExitOnOutOfMemoryError
# lets Kubernetes restart a broken pod instead of hanging.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseG1GC -XX:+ExitOnOutOfMemoryError" \
    SERVER_PORT=8080 \
    MANAGEMENT_SERVER_PORT=8081

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
