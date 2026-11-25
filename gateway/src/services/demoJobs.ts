/**
 * Deterministic generator for fictional DEMO job listings (source "demo").
 * Every company, URL and posting is made up; nothing here comes from Adzuna.
 */
export const DEMO_SOURCE = "demo";

export interface DemoListing {
  source: string;
  sourceId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  salary: { min: number; max: number; currency: string };
  requiredSkills: string[];
  scamRisk: { band: "safe" | "caution" | "high"; score: number; reasons: string[]; mode: "rule-only" };
  fetchedAt: Date;
}

// mulberry32: small seeded PRNG so the same seed always yields the same 1000 listings.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Role { title: string; skills: string[]; lpa: [number, number]; blurb: string }
const ROLES: Role[] = [
  { title: "Data Analyst", skills: ["SQL", "Python", "Excel", "Tableau", "Power BI", "Statistics", "pandas", "A/B Testing", "ETL"], lpa: [4, 14], blurb: "turn raw data into dashboards and insights for business teams" },
  { title: "Senior Data Analyst", skills: ["SQL", "Python", "Tableau", "Snowflake", "Statistics", "Forecasting", "Looker", "dbt"], lpa: [12, 26], blurb: "own reporting and experimentation for a product line" },
  { title: "Data Scientist", skills: ["Python", "scikit-learn", "SQL", "TensorFlow", "Machine Learning", "Statistics", "pandas", "NLP"], lpa: [10, 32], blurb: "build and ship predictive models that move key metrics" },
  { title: "Machine Learning Engineer", skills: ["Python", "PyTorch", "Docker", "Kubernetes", "AWS", "MLOps", "FastAPI", "SQL"], lpa: [14, 40], blurb: "deploy and monitor ML services at scale" },
  { title: "Software Engineer", skills: ["Java", "Spring Boot", "SQL", "REST APIs", "Git", "Microservices", "Docker", "AWS"], lpa: [6, 28], blurb: "design and build reliable backend services" },
  { title: "Full Stack Developer", skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "GraphQL", "Docker", "Git", "CSS"], lpa: [6, 30], blurb: "deliver end-to-end features across web and API layers" },
  { title: "Frontend Developer", skills: ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS", "Redux", "Jest"], lpa: [5, 24], blurb: "craft fast, accessible user interfaces" },
  { title: "Backend Developer", skills: ["Node.js", "Python", "Django", "PostgreSQL", "Redis", "REST APIs", "Docker", "CI/CD"], lpa: [6, 28], blurb: "build APIs and data pipelines that serve millions of requests" },
  { title: "DevOps Engineer", skills: ["AWS", "Kubernetes", "Terraform", "Docker", "Jenkins", "CI/CD", "Linux", "Prometheus"], lpa: [8, 34], blurb: "automate infrastructure, deployments and observability" },
  { title: "Cloud Engineer", skills: ["AWS", "Azure", "Terraform", "Linux", "Python", "Networking", "Security", "Kubernetes"], lpa: [8, 32], blurb: "design secure, cost-efficient cloud platforms" },
  { title: "QA Automation Engineer", skills: ["Selenium", "Cypress", "Java", "Python", "API Testing", "CI/CD", "Jira", "Agile"], lpa: [4, 18], blurb: "automate regression suites and raise release quality" },
  { title: "Product Manager", skills: ["Roadmapping", "Agile", "SQL", "Stakeholder Management", "A/B Testing", "Jira", "User Research", "Analytics"], lpa: [14, 45], blurb: "drive product strategy from discovery to launch" },
  { title: "UI/UX Designer", skills: ["Figma", "User Research", "Prototyping", "Design Systems", "Wireframing", "Accessibility", "Adobe XD"], lpa: [4, 22], blurb: "design intuitive experiences backed by research" },
  { title: "Digital Marketing Specialist", skills: ["SEO", "Google Analytics", "Content Marketing", "Mailchimp", "HubSpot", "Social Media", "Paid Search", "Canva"], lpa: [3, 14], blurb: "grow audience and leads across paid and organic channels" },
  { title: "Business Analyst", skills: ["SQL", "Excel", "Power BI", "Requirements Gathering", "Jira", "Agile", "Stakeholder Management", "Process Mapping"], lpa: [5, 20], blurb: "translate business needs into clear requirements and metrics" },
  { title: "Financial Analyst", skills: ["Excel", "Financial Modeling", "SQL", "Power BI", "Forecasting", "Budgeting", "Accounting", "Variance Analysis"], lpa: [4, 18], blurb: "support planning, forecasting and month-end reporting" },
  { title: "HR Executive", skills: ["Recruitment", "Onboarding", "HRIS", "Communication", "Excel", "Employee Engagement", "Payroll"], lpa: [3, 10], blurb: "run hiring, onboarding and employee programmes" },
  { title: "Customer Success Manager", skills: ["Communication", "CRM", "Salesforce", "Account Management", "Onboarding", "Analytics", "Zendesk"], lpa: [5, 20], blurb: "help customers adopt the product and renew" },
  { title: "Android Developer", skills: ["Kotlin", "Android SDK", "Jetpack Compose", "REST APIs", "Room", "Git", "MVVM"], lpa: [6, 28], blurb: "build and maintain a consumer Android app" },
  { title: "Cybersecurity Analyst", skills: ["SIEM", "Incident Response", "Network Security", "Python", "Splunk", "Vulnerability Assessment", "ISO 27001"], lpa: [6, 28], blurb: "monitor threats and harden systems" },
];
const COMPANY_A = ["Nimbus", "Verdant", "Kestrel", "Altair", "Quanta", "Brightwave", "Orbit", "Zenith", "Lumos", "Praxis", "Cobalt", "Helix", "Tessera", "Mosaic", "Vertex", "Aurora", "Pinecone", "Stratus", "Ironleaf", "Sapphire", "Banyan", "Monsoon", "Saffron", "Indigo"];
const COMPANY_B = ["Technologies", "Labs", "Systems", "Analytics", "Software", "Digital", "Solutions", "Networks", "Works", "Retail", "Finserv", "Health", "Logistics", "Cloud", "AI"];
const CITIES = ["Bengaluru", "Hyderabad", "Pune", "Mumbai", "Gurugram", "Noida", "Chennai", "Kolkata", "Ahmedabad", "Kochi", "Jaipur", "Remote"];
const LEVELS: [string, number][] = [["Junior ", 0.8], ["", 1], ["Senior ", 1.35], ["Lead ", 1.6]];
const WORK = ["on-site", "hybrid", "remote-friendly"];

const SCAM_CAUTION = [
  { text: "Candidates must pay a refundable registration fee to confirm the interview slot.", reason: "Asks for an upfront fee" },
  { text: "Reach us on WhatsApp for instant joining, no formal interview needed.", reason: "Pushes contact to a messaging app and skips the interview" },
  { text: "Salary shown is the minimum guaranteed; unlimited earning potential from day one.", reason: "Unrealistic pay claims" },
];
const SCAM_HIGH = [
  { text: "Earn ₹50,000 per week from home with no experience. Pay a security deposit for your training kit to start immediately.", reason: "Security deposit plus unrealistic earnings" },
  { text: "Send your Aadhaar and bank details by email to get your offer letter today. Limited seats, apply within 24 hours.", reason: "Requests sensitive documents before hiring" },
];

export function generateDemoListings(count = 1000, seed = 20260101, now = new Date()): DemoListing[] {
  const r = rng(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)] as T;
  const sample = (a: string[], n: number) => {
    const c = [...a];
    const out: string[] = [];
    while (out.length < n && c.length) out.push(c.splice(Math.floor(r() * c.length), 1)[0] as string);
    return out;
  };
  const out: DemoListing[] = [];
  for (let i = 1; i <= count; i++) {
    const role = pick(ROLES);
    const [lvlPrefix, mult] = pick(LEVELS);
    const company = `${pick(COMPANY_A)} ${pick(COMPANY_B)}`;
    const city = pick(CITIES);
    const skills = sample(role.skills, 4 + Math.floor(r() * 4));
    const exp = Math.max(0, Math.round((mult - 0.8) * 5 + r() * 2));
    const lo = Math.round(role.lpa[0] * mult * (0.9 + r() * 0.3) * 100000);
    const hi = Math.round(lo * (1.2 + r() * 0.35));
    const roll = r();
    const band: DemoListing["scamRisk"]["band"] = roll < 0.04 ? "high" : roll < 0.12 ? "caution" : "safe";
    const scam = band === "high" ? pick(SCAM_HIGH) : band === "caution" ? pick(SCAM_CAUTION) : null;
    const title = `${lvlPrefix}${role.title}`;
    const mode = city === "Remote" ? "remote" : pick(WORK);
    const description = [
      `${company} is hiring a ${title} to ${role.blurb}.`,
      `You will work with ${skills.slice(0, 3).join(", ")} and collaborate closely with product, design and engineering teammates in a ${mode} setup${city === "Remote" ? "" : ` based in ${city}`}.`,
      `Requirements: ${exp}+ years of experience, hands-on skills in ${skills.join(", ")}, and clear written communication.`,
      `We offer ${pick(["health insurance", "flexible hours", "a learning budget", "stock options", "paid parental leave"])} and ${pick(["a strong mentoring culture", "quarterly bonuses", "fast career growth", "a supportive team"])}.`,
      scam?.text ?? "",
    ].filter(Boolean).join(" ");
    const daysAgo = Math.floor(r() * 30);
    out.push({
      source: DEMO_SOURCE,
      sourceId: `demo-${String(i).padStart(4, "0")}`,
      title,
      company,
      location: city === "Remote" ? "Remote, India" : `${city}, India`,
      description,
      url: `https://jobs.example.com/demo/${String(i).padStart(4, "0")}`,
      salary: { min: lo, max: hi, currency: "INR" },
      requiredSkills: skills,
      scamRisk: {
        band,
        score: band === "high" ? 0.8 + r() * 0.19 : band === "caution" ? 0.4 + r() * 0.25 : r() * 0.15,
        reasons: scam ? [scam.reason] : [],
        mode: "rule-only",
      },
      fetchedAt: new Date(now.getTime() - daysAgo * 86_400_000),
    });
  }
  return out;
}
