#!/bin/bash
# ---------------------------------------------------------------------------
# Runs ON a WildFly EC2 instance (invoked by Jenkins through SSM RunCommand).
# Never run it from a laptop against production.
#
#   deploy-wildfly.sh <release-version>
#
# Steps: download the approved WAR from S3 -> keep the previous WAR -> replace
# the deployment -> restart WildFly -> wait for local readiness -> let the ALB
# health check decide whether the instance serves traffic.
# ---------------------------------------------------------------------------
set -euo pipefail

RELEASE_VERSION="${1:?usage: deploy-wildfly.sh <release-version>}"
ENVIRONMENT="${EHD_ENVIRONMENT:-prod}"
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-ehd-${ENVIRONMENT}-deploy-artifacts}"
LOCAL_DIR="/opt/ehd/releases"
DEPLOYMENTS="/opt/wildfly/standalone/deployments"
WAR_NAME="ehd-main-app.war"

mkdir -p "$LOCAL_DIR"
cd "$LOCAL_DIR"

echo "[$(date -Is)] Fetching ${RELEASE_VERSION}"
aws s3 cp "s3://${ARTIFACT_BUCKET}/main-app/${RELEASE_VERSION}/${WAR_NAME}" \
  "./${WAR_NAME}.${RELEASE_VERSION}" --only-show-errors

# Keep exactly one previous release for manual rollback on the instance.
if [ -f "${WAR_NAME}.current" ]; then
  cp -f "${WAR_NAME}.current" "${WAR_NAME}.previous"
fi
cp -f "${WAR_NAME}.${RELEASE_VERSION}" "${WAR_NAME}.current"

# Undeploy cleanly, then deploy the new WAR.
rm -f "${DEPLOYMENTS}/${WAR_NAME}.deployed" "${DEPLOYMENTS}/${WAR_NAME}.failed" || true
install -o wildfly -g wildfly -m 0640 "${WAR_NAME}.current" "${DEPLOYMENTS}/${WAR_NAME}"

systemctl restart wildfly
echo "[$(date -Is)] Restarted WildFly, waiting for readiness"

for _ in $(seq 1 24); do
  if curl -fsS "http://127.0.0.1:8080/health/ready" >/dev/null 2>&1; then
    echo "[$(date -Is)] ${RELEASE_VERSION} is ready"
    echo "$RELEASE_VERSION" > /etc/ehd/deployed-version
    exit 0
  fi
  sleep 10
done

echo "[$(date -Is)] Readiness failed, rolling back to the previous WAR" >&2
if [ -f "${WAR_NAME}.previous" ]; then
  install -o wildfly -g wildfly -m 0640 "${WAR_NAME}.previous" "${DEPLOYMENTS}/${WAR_NAME}"
  systemctl restart wildfly
fi
exit 1
