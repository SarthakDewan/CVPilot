// DEMO DATA ONLY. Every person, company, email and phone number below is fictional.
// It is used exclusively by the "Load demo" buttons on the Resume Studio page and is never
// shown on the dashboard or sent to the API.

export interface DemoResume { id: string; label: string; role: string; jdId: string; text: string }
export interface DemoJd { id: string; label: string; text: string }

export const DEMO_RESUMES: DemoResume[] = [
  {
    "id": "priya",
    "label": "Priya Raman",
    "role": "Senior Software Engineer",
    "jdId": "swe",
    "text": "PRIYA RAMAN\nSenior Software Engineer\nSeattle, WA | priya.raman@mailhub.example | (206) 555-0148 | linkedin.com/in/priyaraman | github.com/priyaraman | priyaraman.dev\n\nPROFESSIONAL SUMMARY\nFull-stack engineer with 8+ years of experience building scalable web platforms in fintech and e-commerce. Strong background in TypeScript, React, Node.js and AWS, with a record of shipping high-impact features and mentoring engineers.\n\nEXPERIENCE\nSenior Software Engineer | Northwind Payments | Seattle, WA | Mar 2021 – Present\n• Led a team of 5 engineers to rebuild the checkout platform in React and Node.js, increasing conversion by 18% and handling 2M+ transactions per month\n• Designed event-driven microservices on AWS (Lambda, SQS, DynamoDB) that cut infrastructure cost by $240K annually\n• Reduced p95 API latency from 820ms to 190ms by introducing Redis caching and query optimization in PostgreSQL\n• Implemented CI/CD pipelines with GitHub Actions and Docker, shrinking release time from 2 days to 45 minutes\n• Mentored 4 junior engineers, 3 of whom were promoted within 18 months\n\nSoftware Engineer | BrightCart Inc. | Portland, OR | Jun 2017 – Feb 2021\n• Developed a GraphQL API serving 30+ React storefronts, improving page load time by 35%\n• Migrated a monolithic Rails application to Node.js services, eliminating 99% of deployment downtime\n• Built automated test suites with Jest and Cypress, raising code coverage from 41% to 87%\n• Collaborated with product and design teams to launch 12 customer-facing features in an agile environment\n\nJunior Developer | Lumen Web Studio | Portland, OR | Jul 2015 – May 2017\n• Created responsive websites for 20+ small-business clients using JavaScript, HTML and CSS\n• Optimized SEO and accessibility, boosting average client organic traffic by 27%\n\nEDUCATION\nB.S. in Computer Science | University of Washington, Seattle, WA | 2011 – 2015\nGPA: 3.7/4.0\n\nSKILLS\nLanguages: JavaScript, TypeScript, Python, SQL, Go\nFrontend: React, Redux, Next.js, HTML, CSS, Tailwind CSS\nBackend & Cloud: Node.js, Express, GraphQL, REST APIs, PostgreSQL, Redis, AWS, Docker, Kubernetes\nPractices: CI/CD, Agile, Scrum, Test-Driven Development, System Design\n\nPROJECTS\nOpenLedger – Open-source expense tracker | TypeScript, React, Node.js\n• Reached 1.4K GitHub stars and 60+ contributors; featured in a weekly developer newsletter\nStatusPulse – Uptime monitoring SaaS | Go, PostgreSQL, Docker\n• Monitors 500+ endpoints with sub-second alerting for 300 active users\n\nCERTIFICATIONS\nAWS Certified Solutions Architect – Associate (2022)\nCertified Kubernetes Application Developer (2023)"
  },
  {
    "id": "marcus",
    "label": "Marcus Whitfield",
    "role": "Data Analyst",
    "jdId": "data",
    "text": "Marcus Whitfield\nData Analyst\nAustin, TX • marcus.whitfield@mailhub.example • 512-555-0192 • linkedin.com/in/marcuswhitfield\n\nSUMMARY\nData analyst with 4 years of experience turning messy datasets into clear business insights. Skilled in SQL, Python and Tableau with a focus on customer analytics, forecasting and experimentation.\n\nWORK EXPERIENCE\nData Analyst — Lone Star Retail Group, Austin, TX — Aug 2021 to Present\n- Built 25+ Tableau dashboards used by 120 store managers, reducing weekly reporting time by 12 hours\n- Wrote complex SQL queries on a 4TB Snowflake warehouse to analyze customer churn, identifying a segment that drove 22% of lost revenue\n- Developed a demand forecasting model in Python (scikit-learn) with 91% accuracy, lowering overstock by $1.2M\n- Designed and analyzed 15 A/B tests that lifted email click-through rate by 14%\n\nJunior Business Analyst — Pecos Logistics, Dallas, TX — Jun 2019 to Jul 2021\n- Automated monthly KPI reports with Excel VBA and Python, saving 20 hours per month\n- Cleaned and merged 8 data sources to create a single source of truth for operations\n\nEDUCATION\nBachelor of Science in Statistics — Texas A&M University, College Station, TX — 2015 - 2019\n\nTECHNICAL SKILLS\nSQL, Python, R, Tableau, Power BI, Excel, Snowflake, pandas, scikit-learn, A/B Testing, Statistics, Data Visualization, ETL\n\nCERTIFICATIONS\nGoogle Data Analytics Professional Certificate\nTableau Desktop Specialist"
  },
  {
    "id": "jordan",
    "label": "Jordan Ellis",
    "role": "Marketing (needs work)",
    "jdId": "mkt",
    "text": "Jordan Ellis\nMarketing Coordinator\nChicago, IL\njordan.ellis@mailhub.example\n\nOBJECTIVE\nI am a hard working and passionate person looking for a marketing job where I can grow my skills.\n\nEXPERIENCE\nMarketing Assistant, Windy City Home Goods, Chicago, IL, 2020 - Present\n• Responsible for posting on social media\n• Worked on email newsletters and helped with events\n• I helped the team with many different tasks as needed\n• Was in charge of updating the website sometimes\n\nIntern, Lakeshore Media, 2019\n• Helped with social media\n• Made some posters\n\nEDUCATION\nBA Communications, Illinois State University, 2019\n\nSKILLS\nSocial media, Microsoft Office, Canva, teamwork, communication, hard worker"
  }
];

export const DEMO_JDS: DemoJd[] = [
  {
    "id": "swe",
    "label": "Senior Full-Stack Engineer – Northwind-style fintech",
    "text": "We are hiring a Senior Full-Stack Engineer to build scalable payment and checkout experiences. You will design and ship features using React, TypeScript and Node.js, build REST APIs and GraphQL services, and run workloads on AWS. Experience with PostgreSQL, Redis, Docker, Kubernetes and CI/CD pipelines is required. You will mentor engineers, work in an Agile team, write automated tests, and contribute to system design. Bonus: Python, microservices, Terraform."
  },
  {
    "id": "data",
    "label": "Data Analyst – Retail analytics",
    "text": "Seeking a Data Analyst to own reporting and insights for our retail business. Must be proficient in SQL, Python, Tableau or Power BI, and Excel. Experience with Snowflake, A/B testing, statistics, forecasting and data visualization is required. You will build dashboards, partner with stakeholders, automate reporting, and communicate insights to leadership. Knowledge of ETL, pandas and R is a plus."
  },
  {
    "id": "mkt",
    "label": "Digital Marketing Specialist – Consumer brand",
    "text": "Looking for a Digital Marketing Specialist to run campaigns across social media, email marketing and paid search. Experience with SEO, Google Analytics, content marketing, HubSpot, Mailchimp, Canva and A/B testing is required. You will manage campaign budgets, grow audience engagement, analyze performance metrics and report on ROI, conversion and lead generation."
  },
  {
    "id": "custom",
    "label": "Custom (paste your own below)",
    "text": ""
  }
];
