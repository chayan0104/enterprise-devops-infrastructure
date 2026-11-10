const box = "fill-[#0b141f] stroke-[#22303f]";
const label = "fill-[#e7eef8] font-mono";
const sub = "fill-[#8598ae] font-mono";
const accent = "#a3e635";
const cyan = "#38bdf8";
const amber = "#fbbf24";

export function ArchitectureDiagram() {
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox="0 0 1020 470"
        role="img"
        aria-label="Hybrid architecture: public ALB to WildFly EC2, internal ALB to EKS microservices, with existing Oracle, DocumentDB, Kafka and SFTP dependencies."
        className="h-auto w-full min-w-[760px]"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4b6076" />
          </marker>
          <marker id="arrowAccent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
          </marker>
        </defs>

        {/* users */}
        <rect x="16" y="26" width="150" height="52" rx="8" className={box} />
        <text x="30" y="48" className={`${label} text-[12px]`}>Users / corporate</text>
        <text x="30" y="66" className={`${sub} text-[10px]`}>https only</text>

        {/* ALB */}
        <rect x="222" y="22" width="212" height="62" rx="8" className={box} stroke={accent} strokeOpacity="0.35" />
        <text x="238" y="44" className={`${label} text-[12px]`}>Public ALB · module alb</text>
        <text x="238" y="61" className={`${sub} text-[10px]`}>443 https · 80 → 301</text>
        <text x="238" y="75" className={`${sub} text-[10px]`}>tg wildfly-http:8080</text>

        <line x1="168" y1="52" x2="216" y2="52" stroke="#4b6076" strokeWidth="1.2" markerEnd="url(#arrow)" />
        <text x="170" y="44" className={`${sub} text-[9px]`}>443</text>

        {/* vpc boundary */}
        <rect x="470" y="12" width="534" height="308" rx="10" fill="none" stroke="#1b2836" strokeDasharray="5 5" />
        <text x="486" y="32" className={`${sub} text-[10px] uppercase tracking-[0.16em]`}>aws vpc · private subnets · 2 az</text>

        {/* WildFly ASG */}
        <rect x="490" y="48" width="230" height="104" rx="8" className={box} />
        <text x="506" y="70" className={`${label} text-[12px]`}>WildFly main app · EC2</text>
        <text x="506" y="88" className={`${sub} text-[10px]`}>ASG 2 min (uat) / 3 min (prod)</text>
        <text x="506" y="103" className={`${sub} text-[10px]`}>WAR via JFrog → SSM deploy</text>
        <text x="506" y="118" className={`${sub} text-[10px]`}>instance profile · IMDSv2</text>
        <text x="506" y="136" className={`${sub} text-[10px]`}>jmx exporter :9404 (uat)</text>

        <line x1="434" y1="53" x2="484" y2="80" stroke="#4b6076" strokeWidth="1.2" markerEnd="url(#arrow)" />

        {/* internal ALB */}
        <rect x="490" y="188" width="230" height="58" rx="8" className={box} stroke={cyan} strokeOpacity="0.35" />
        <text x="506" y="210" className={`${label} text-[12px]`}>Internal ALB · ingress</text>
        <text x="506" y="228" className={`${sub} text-[10px]`}>scheme internal · ip targets</text>
        <line x1="605" y1="152" x2="605" y2="184" stroke="#4b6076" strokeWidth="1.2" markerEnd="url(#arrow)" />
        <text x="614" y="174" className={`${sub} text-[9px]`}>https 443</text>

        {/* EKS */}
        <rect x="750" y="48" width="238" height="198" rx="8" className={box} stroke={cyan} strokeOpacity="0.3" />
        <text x="766" y="70" className={`${label} text-[12px]`}>EKS · namespace ehd-apps</text>
        <text x="766" y="88" className={`${sub} text-[10px]`}>order-service · 2–6 pods</text>
        <text x="766" y="103" className={`${sub} text-[10px]`}>notification-service · 2 pods</text>
        <text x="766" y="118" className={`${sub} text-[10px]`}>kafka-consumer · 2–6 pods</text>
        <text x="766" y="138" className={`${sub} text-[10px]`}>hpa · pdb · probes · limits</text>
        <text x="766" y="153" className={`${sub} text-[10px]`}>irsa service accounts</text>
        <text x="766" y="168" className={`${sub} text-[10px]`}>secrets store csi</text>
        <text x="766" y="183" className={`${sub} text-[10px]`}>dynatrace oneagent (prod)</text>
        <text x="766" y="203" className={`${sub} text-[10px]`}>node group 2–8 · m6i</text>
        <text x="766" y="222" className={`${sub} text-[10px]`}>ecr pull via node role</text>

        <line x1="720" y1="214" x2="746" y2="170" stroke="#4b6076" strokeWidth="1.2" markerEnd="url(#arrow)" />

        {/* dependency band */}
        <rect x="470" y="330" width="534" height="124" rx="8" fill="none" stroke="#3a2d16" strokeDasharray="4 4" />
        <text x="486" y="350" className={`${sub} text-[10px] uppercase tracking-[0.16em]`}>existing dependencies · not provisioned here</text>

        <rect x="490" y="364" width="152" height="34" rx="6" fill="#100f0a" stroke="#3a2d16" />
        <text x="502" y="386" className={`${label} text-[11px]`}>Oracle RDS :1521</text>

        <rect x="656" y="364" width="152" height="34" rx="6" fill="#100f0a" stroke="#3a2d16" />
        <text x="668" y="386" className={`${label} text-[11px]`}>DocumentDB :27017</text>

        <rect x="822" y="364" width="90" height="34" rx="6" fill="#100f0a" stroke="#3a2d16" />
        <text x="834" y="386" className={`${label} text-[11px]`}>Kafka :9093</text>

        <rect x="924" y="364" width="64" height="34" rx="6" fill="#100f0a" stroke="#3a2d16" />
        <text x="936" y="386" className={`${label} text-[11px]`}>SFTP :22</text>

        <rect x="490" y="408" width="230" height="34" rx="6" className={box} />
        <text x="502" y="430" className={`${label} text-[11px]`}>S3 documents (IAM, no keys)</text>

        <rect x="736" y="408" width="252" height="34" rx="6" className={box} />
        <text x="748" y="430" className={`${label} text-[11px]`}>S3 log archive ← CloudWatch</text>

        <line x1="605" y1="290" x2="605" y2="360" stroke="#4b6076" strokeWidth="1.2" markerEnd="url(#arrow)" />
        <line x1="868" y1="246" x2="868" y2="360" stroke="#4b6076" strokeWidth="1.2" markerEnd="url(#arrow)" />
        <line x1="605" y1="152" x2="605" y2="186" stroke="#4b6076" strokeWidth="1.2" />

        {/* CI/CD band */}
        <rect x="16" y="120" width="418" height="92" rx="8" className={box} />
        <text x="32" y="142" className={`${label} text-[12px]`}>Jenkins · delivery control</text>
        <text x="32" y="160" className={`${sub} text-[10px]`}>main-app → WAR → SSM → target health</text>
        <text x="32" y="175" className={`${sub} text-[10px]`}>microservice → trivy → ecr → kubectl rollout</text>
        <text x="32" y="190" className={`${sub} text-[10px]`}>terraform → plan → approval → apply saved plan</text>
        <text x="32" y="205" className={`${sub} text-[10px]`}>sts assume-role · no static keys</text>
        <path d="M 278 120 C 300 104 330 96 484 96" fill="none" stroke={accent} strokeOpacity="0.45" strokeDasharray="3 4" markerEnd="url(#arrowAccent)" />
        <path d="M 434 168 C 600 168 640 120 746 118" fill="none" stroke={cyan} strokeOpacity="0.45" strokeDasharray="3 4" markerEnd="url(#arrowAccent)" />

        {/* observability band */}
        <rect x="16" y="244" width="418" height="76" rx="8" className={box} />
        <text x="32" y="266" className={`${label} text-[12px]`}>Observability (environment specific)</text>
        <text x="32" y="284" className={`${sub} text-[10px]`}>uat: prometheus · grafana · alertmanager</text>
        <text x="32" y="299" className={`${sub} text-[10px]`}>prod: dynatrace · cloudwatch · s3 archive</text>
        <text x="32" y="313" className={`${sub} text-[10px]`}>node-exporter · kube-state-metrics · jmx</text>

        <text x="16" y="392" className={`${sub} text-[10px]`} fill={amber}>
          excluded: CloudFront · WAF · API Gateway
        </text>
        <text x="16" y="408" className={`${sub} text-[10px]`} fill={amber}>
          excluded: Route 53 · MSK · RDS · DocumentDB
        </text>
        <text x="16" y="424" className={`${sub} text-[10px]`} fill={amber}>
          excluded: GoldenGate provisioning
        </text>
      </svg>
    </div>
  );
}
