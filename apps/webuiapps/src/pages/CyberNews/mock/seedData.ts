import type { Article, Case } from '../types';
import imgArticle001 from '../assets/article-001.jpg';
import imgArticle002 from '../assets/article-002.jpg';
import imgArticle003 from '../assets/article-003.jpg';
import imgArticle004 from '../assets/article-004.jpg';
import imgArticle005 from '../assets/article-005.jpg';
import imgArticle006 from '../assets/article-006.jpg';

export const SEED_ARTICLES: Article[] = [
  {
    id: 'article-001',
    title: 'ARASAKA TOWER BREACH: INTERNAL SECURITY COMPROMISED',
    category: 'breaking',
    summary:
      "Multiple reports confirm unauthorized access to Arasaka Tower's secure floors. Corporate security has been deployed across Night City districts.",
    content:
      "In what appears to be the most significant security breach in recent corporate history, Arasaka Corporation's flagship tower in City Center has been compromised. Sources close to the investigation report that unknown operatives gained access to floors 120 through 140, which house the corporation's most sensitive data archives.\n\nArasaka security chief Goro Takemura issued a brief statement: \"The situation is under control. Any reports of data theft are premature and unsubstantiated.\" However, multiple NCPD sources confirm that MaxTac units were deployed to the area within minutes of the breach.\n\nThe incident has sent shockwaves through Night City's corporate sector, with Militech and Kang Tao stocks rising sharply as investors reassess the security landscape. Street-level fixers report increased demand for netrunners capable of corporate-grade intrusions.\n\nThis marks the third major security incident at Arasaka facilities this quarter, raising questions about the megacorp's ability to protect its assets in an increasingly volatile Night City.",
    imageUrl: imgArticle001,
    publishedAt: '2077-11-15T08:30:00Z',
  },
  {
    id: 'article-002',
    title: 'BIOTECHNICA ANNOUNCES BREAKTHROUGH IN SYNTHETIC ORGAN PRODUCTION',
    category: 'corporate',
    summary:
      'New bio-printing technology promises to reduce synthetic organ costs by 60%, potentially revolutionizing healthcare access in Night City.',
    content:
      'Biotechnica has unveiled its latest generation of bio-printing technology at a press conference in Westbrook. The new BioForge 7000 system can produce fully functional synthetic organs in under 48 hours, a dramatic improvement over the current 2-week production cycle.\n\nDr. Elena Vasquez, Biotechnica\'s head of R&D, demonstrated the technology by printing a fully functional kidney during the presentation. "This is the democratization of healthcare," she stated. "Within two years, every ripperdoc in Night City will have access to affordable, high-quality synthetic organs."\n\nThe announcement has been met with skepticism from independent ripperdocs, who question whether Biotechnica will truly make the technology accessible or use it to further tighten their grip on the medical supply chain.\n\nMilitarized medical corps from Trauma Team International have already expressed interest in integrating the technology into their field operations.',
    imageUrl: imgArticle002,
    publishedAt: '2077-11-14T14:00:00Z',
  },
  {
    id: 'article-003',
    title: 'MAELSTROM GANG WAR ERUPTS IN WATSON: 23 CASUALTIES REPORTED',
    category: 'street',
    summary:
      'Territorial dispute between Maelstrom factions spills into civilian areas. NCPD establishes perimeter around affected blocks.',
    content:
      'A violent internal power struggle within the Maelstrom gang has erupted in Watson\'s industrial district, leaving at least 23 dead and dozens wounded. The conflict, which began in the early hours of the morning, has spilled out of the gang\'s traditional territory into residential areas.\n\nNCPD spokesperson Lieutenant James Park confirmed that MaxTac units have been deployed: "We are treating this as an active combat zone. Civilians in blocks 14 through 22 of the industrial district are advised to shelter in place."\n\nThe violence appears to be linked to a leadership dispute following the death of Royce, a prominent Maelstrom figure. Two factions have emerged: one loyal to Brick, the former leader believed to have been held captive, and another following a new figure known only as "Chrome Prophet."\n\nLocal businesses have shuttered, and several scav operations in the area have gone dark. Fixers report that the conflict has disrupted supply chains for military-grade cyberware across Night City.',
    imageUrl: imgArticle003,
    publishedAt: '2077-11-15T03:15:00Z',
  },
  {
    id: 'article-004',
    title: 'NETWATCH DEPLOYS NEW ICE ARCHITECTURE ACROSS NIGHT CITY NET',
    category: 'tech',
    summary:
      'Advanced intrusion countermeasures threaten to reshape the netrunning landscape. Independent runners report significant access restrictions.',
    content:
      'NetWatch has rolled out its most aggressive network defense upgrade in five years, deploying what security experts are calling "Black ICE 2.0" across Night City\'s local net infrastructure. The new countermeasures have already claimed at least three netrunners who attempted to breach protected subnets.\n\nThe upgrade includes adaptive AI-driven firewalls, neural feedback loops designed to fry unauthorized users, and quantum-encrypted data barriers. NetWatch claims the measures are necessary to combat the rising tide of corporate espionage and data theft.\n\n"The net was becoming a lawless frontier," said NetWatch Regional Director Sarah Chen. "These measures protect critical infrastructure and civilian data alike."\n\nThe netrunning community has responded with fury. Alt Cunningham, a legendary netrunner and vocal critic of NetWatch, posted a manifesto calling the upgrade "digital fascism." Underground forums are already buzzing with attempts to crack the new architecture.\n\nRipperdocs specializing in cyberdeck upgrades report a surge in demand for hardware capable of handling the increased security load.',
    imageUrl: imgArticle004,
    publishedAt: '2077-11-13T19:45:00Z',
  },
  {
    id: 'article-005',
    title: 'NIGHT CITY COUNCIL APPROVES MEGABUILDING H11 EXPANSION PROJECT',
    category: 'corporate',
    summary:
      'Controversial 200-story expansion will displace thousands of residents. Protests erupt in Watson and Heywood.',
    content:
      'The Night City Council voted 7-4 to approve the controversial Megabuilding H11 expansion project in Watson. The project, backed by a consortium of Arasaka, Militech, and local developers, will add 200 stories to the existing structure, making it the tallest residential building in Night City.\n\nThe expansion will require the demolition of six surrounding city blocks, displacing an estimated 15,000 residents. Relocation packages have been described by housing advocates as "insulting," offering displaced families vouchers for temporary housing in the combat zone.\n\nProtests erupted within hours of the vote, with demonstrations in Watson and Heywood drawing thousands. Several fixers have publicly offered their services to organizers pro bono, and at least one boostergang—the Valentinos—has pledged to protect protesters from corporate security forces.\n\nMayor Lucius Rhyne issued a statement calling the project "essential for Night City\'s continued growth and prosperity."',
    imageUrl: imgArticle005,
    publishedAt: '2077-11-12T11:20:00Z',
  },
  {
    id: 'article-006',
    title: 'MILITECH COMBAT CAB FLEET SPOTTED ON NIGHT CITY HIGHWAYS',
    category: 'tech',
    summary:
      'Autonomous armored vehicles undergo field testing. Privacy advocates raise surveillance concerns.',
    content:
      'A fleet of Militech\'s new autonomous Combat Cab vehicles has been spotted conducting field tests on Night City\'s highway system. The heavily armored vehicles, originally designed for military personnel transport, are being repurposed for civilian executive protection services.\n\nEach Combat Cab is equipped with anti-ballistic plating, electronic countermeasures, and what appears to be a retractable turret system. The vehicles operate using Militech\'s proprietary AI navigation system, requiring no human driver.\n\n"This is the future of urban mobility for high-value individuals," said Militech VP of Consumer Products Diana Torres. "In a city where a routine commute can become a firefight, our clients deserve military-grade protection."\n\nPrivacy advocates have raised concerns about the extensive sensor arrays mounted on each vehicle, which continuously map and monitor the surrounding environment. Several netrunners have already identified vulnerabilities in the vehicles\' communication protocols.',
    imageUrl: imgArticle006,
    publishedAt: '2077-11-14T09:30:00Z',
  },
];

export const SEED_CASES: Case[] = [
  {
    id: 'case-001',
    caseNumber: 'NC-2077-0451',
    title: 'The Arasaka Data Heist',
    status: 'open',
    clues: [
      {
        id: 'clue-001',
        type: 'document',
        title: 'Security Footage Analysis',
        content:
          'Footage from floors 120-140 shows three unidentified operatives. Facial recognition returns no matches in any corporate database. Equipment appears to be custom-built, no known manufacturer markings.',
        posX: 80,
        posY: 60,
        connections: ['clue-002', 'clue-003'],
      },
      {
        id: 'clue-002',
        type: 'message',
        title: 'Anonymous Tip - Afterlife',
        content:
          "Got a whisper from a merc at Afterlife. Says the job was contracted through a fixer nobody's heard of. Payment was in untraceable crypto. The crew? Ghosts. No street cred, no history.",
        posX: 400,
        posY: 120,
        connections: ['clue-004'],
      },
      {
        id: 'clue-003',
        type: 'report',
        title: 'NCPD Incident Report #4451',
        content:
          'MaxTac response time: 4 minutes. By arrival, all operatives had exfiltrated. No physical evidence recovered. Digital forensics ongoing. Estimated data volume accessed: 2.3 TB.',
        posX: 250,
        posY: 300,
        connections: ['clue-005'],
      },
      {
        id: 'clue-004',
        type: 'press',
        title: 'Arasaka Official Statement',
        content:
          'Arasaka Corporation categorically denies any significant data breach. All systems are operating within normal parameters. We are cooperating with NCPD as a matter of protocol.',
        posX: 600,
        posY: 80,
        connections: ['clue-005'],
      },
      {
        id: 'clue-005',
        type: 'note',
        title: 'Personal Notes',
        content:
          "Something doesn't add up. Arasaka's response was TOO fast. 4 minutes for MaxTac? They were pre-staged. Either Arasaka knew it was coming, or this was an inside job. Need to dig deeper into Takemura's movements that night.",
        posX: 150,
        posY: 450,
      },
    ],
  },
  {
    id: 'case-002',
    caseNumber: 'NC-2077-0452',
    title: 'Chrome Prophet Identity',
    status: 'open',
    clues: [
      {
        id: 'clue-006',
        type: 'report',
        title: 'Gang Intel Brief',
        content:
          'New Maelstrom faction leader, calls themselves "Chrome Prophet." No prior records. First appeared approximately 3 weeks ago. Rhetoric focuses on "transcendence through chrome." Followers display unusual cybernetic modifications.',
        posX: 120,
        posY: 100,
        connections: ['clue-007', 'clue-008'],
      },
      {
        id: 'clue-007',
        type: 'message',
        title: 'Street Contact - Kabuki',
        content:
          "My contact in Kabuki says Chrome Prophet isn't Maelstrom born. Came from outside Night City. Maybe European? Has tech nobody's seen before. Custom cyberware that makes borgs look like flatlines.",
        posX: 450,
        posY: 200,
        connections: ['clue-008'],
      },
      {
        id: 'clue-008',
        type: 'document',
        title: 'Intercepted Communications',
        content:
          'Partial decrypt of Maelstrom comms: "...the Prophet speaks of a signal beyond the Blackwall... promises connection to something greater... the chrome is just the beginning..."',
        posX: 280,
        posY: 380,
      },
    ],
  },
  {
    id: 'case-003',
    caseNumber: 'NC-2077-0453',
    title: 'Biotechnica Clinical Trials',
    status: 'classified',
    clues: [
      {
        id: 'clue-009',
        type: 'document',
        title: 'Leaked Internal Memo',
        content:
          'Subject: Project LAZARUS Phase 3 Results\nClassification: EYES ONLY\n\nPhase 3 trials show 73% success rate in neural regeneration. Side effects include... [REDACTED]. Recommend proceeding to human trials despite ethics committee concerns.',
        posX: 200,
        posY: 150,
        connections: ['clue-010'],
      },
      {
        id: 'clue-010',
        type: 'press',
        title: 'Missing Persons Report Pattern',
        content:
          'Cross-referencing NCPD missing persons reports with Biotechnica facility locations reveals a statistical anomaly. 40% increase in disappearances within 2km radius of Biotechnica labs over the past 6 months.',
        posX: 500,
        posY: 250,
      },
    ],
  },
];
