export const ASSESSMENT_MODULES = {
      quant: {
        title: "Quantitative Aptitude",
        category: "Aptitude & Problem Solving",
        duration: 45,
        questions: [
          {
            id: "quant-1",
            difficulty: "Medium",
            topic: "Time & Work",
            type: "mcq",
            title: "Q1: Time & Work Efficiency",
            question: "A can do a piece of work in 12 days, and B can do it in 18 days. They worked together for 4 days, then A left. How many days will B take alone to finish the remaining work?",
            hint: "Compute the combined work rate: 1/12 + 1/18 = 5/36. Find work done in 4 days, then determine B's remaining days.",
            options: [
              { key: "A", text: "8 days" },
              { key: "B", text: "10 days" },
              { key: "C", text: "6 days" },
              { key: "D", text: "9 days" }
            ],
            correctKey: "A"
          },
          {
            id: "quant-2",
            difficulty: "Medium",
            topic: "Profit & Loss",
            type: "mcq",
            title: "Q2: Markup and Discount",
            question: "A trader marks his goods 25% above the cost price and allows a discount of 10% on the marked price for cash payment. What is his net gain percentage?",
            hint: "Assume Cost Price = 100. Marked Price = 125. Selling Price = 125 - 10% of 125.",
            options: [
              { key: "A", text: "15%" },
              { key: "B", text: "12.5%" },
              { key: "C", text: "14.2%" },
              { key: "D", text: "10%" }
            ],
            correctKey: "B"
          },
          {
            id: "quant-3",
            difficulty: "Hard",
            topic: "Speed & Distance",
            type: "mcq",
            title: "Q3: Relative Speed & Trains",
            question: "Two trains 140 m and 160 m long are moving in opposite directions at speeds of 60 km/h and 48 km/h respectively. In how many seconds will they completely cross each other?",
            hint: "Relative speed in opposite directions = 60 + 48 = 108 km/h. Convert to m/s: 108 × (5/18) = 30 m/s. Total distance = 140 + 160 = 300 m.",
            options: [
              { key: "A", text: "8 seconds" },
              { key: "B", text: "10 seconds" },
              { key: "C", text: "12 seconds" },
              { key: "D", text: "15 seconds" }
            ],
            correctKey: "B"
          },
          {
            id: "quant-4",
            difficulty: "Medium",
            topic: "Probability",
            type: "mcq",
            title: "Q4: Probability of Selection",
            question: "A bag contains 5 red, 4 blue, and 3 green balls. If 2 balls are drawn at random without replacement, what is the probability that both are blue?",
            hint: "Total balls = 12. P(First blue) = 4/12. P(Second blue) = 3/11.",
            options: [
              { key: "A", text: "1/11" },
              { key: "B", text: "2/11" },
              { key: "C", text: "1/9" },
              { key: "D", text: "3/22" }
            ],
            correctKey: "A"
          },
          {
            id: "quant-5",
            difficulty: "Hard",
            topic: "Compound Interest",
            type: "mcq",
            title: "Q5: CI vs SI Difference",
            question: "The difference between simple interest and compound interest compounded annually on a certain sum of money for 2 years at 10% per annum is ₹65. What is the principal sum?",
            hint: "For 2 years: Difference = P × (R / 100)². Here 65 = P × (10/100)².",
            options: [
              { key: "A", text: "₹5,500" },
              { key: "B", text: "₹6,500" },
              { key: "C", text: "₹7,200" },
              { key: "D", text: "₹6,000" }
            ],
            correctKey: "B"
          }
        ]
      },

      logical: {
        title: "Logical Reasoning",
        category: "Analytical & Deduction",
        duration: 35,
        questions: [
          {
            id: "log-1",
            difficulty: "Medium",
            topic: "Syllogisms",
            type: "mcq",
            title: "Q1: Deductive Syllogism",
            question: "Statements:\n1. All engineers are problem solvers.\n2. Some problem solvers are researchers.\n\nConclusions:\nI. Some researchers are engineers.\nII. Some problem solvers are engineers.",
            hint: "Evaluate Venn diagram overlaps. 'Some problem solvers are engineers' is a direct valid converse of Statement 1.",
            options: [
              { key: "A", text: "Only Conclusion I follows" },
              { key: "B", text: "Only Conclusion II follows" },
              { key: "C", text: "Both I and II follow" },
              { key: "D", text: "Neither I nor II follows" }
            ],
            correctKey: "B"
          },
          {
            id: "log-2",
            difficulty: "Hard",
            topic: "Seating Arrangement",
            type: "mcq",
            title: "Q2: Circular Arrangement",
            question: "Six persons P, Q, R, S, T, and U are seated around a circular table facing the center.\n• P is second to the left of T.\n• Q is to the immediate right of T.\n• R is seated between P and S.\nWho is seated opposite to P?",
            hint: "Place T at the bottom. T's right is counter-clockwise. Work out the relative circular positions.",
            options: [
              { key: "A", text: "Q" },
              { key: "B", text: "S" },
              { key: "C", text: "U" },
              { key: "D", text: "T" }
            ],
            correctKey: "A"
          },
          {
            id: "log-3",
            difficulty: "Medium",
            topic: "Blood Relations",
            type: "mcq",
            title: "Q3: Pointing Relationship",
            question: "Pointing to a man on stage, Sunita said, 'His mother is the only daughter of my mother.' How is Sunita related to the man on stage?",
            hint: "'Only daughter of my mother' = Sunita herself (since Sunita is female). Thus the man's mother is Sunita.",
            options: [
              { key: "A", text: "Aunt" },
              { key: "B", text: "Sister" },
              { key: "C", text: "Mother" },
              { key: "D", text: "Grandmother" }
            ],
            correctKey: "C"
          },
          {
            id: "log-4",
            difficulty: "Easy",
            topic: "Coding-Decoding",
            type: "mcq",
            title: "Q4: Alphabet Cipher",
            question: "In a certain code language, if CLOUD is coded as ENQWF (+2 shift for each letter), how is SMILE coded in the same language?",
            hint: "S(+2) = U, M(+2) = O, I(+2) = K, L(+2) = N, E(+2) = G.",
            options: [
              { key: "A", text: "UOKNG" },
              { key: "B", text: "TNJKF" },
              { key: "C", text: "UOKNH" },
              { key: "D", text: "VNLOG" }
            ],
            correctKey: "A"
          },
          {
            id: "log-5",
            difficulty: "Medium",
            topic: "Pattern Series",
            type: "mcq",
            title: "Q5: Number Sequence Progression",
            question: "Find the next missing number in the sequence:\n3, 7, 15, 31, 63, ?",
            hint: "Notice the difference doubling: +4, +8, +16, +32, so next is +64. Alternatively: 2n + 1.",
            options: [
              { key: "A", text: "95" },
              { key: "B", text: "125" },
              { key: "C", text: "127" },
              { key: "D", text: "131" }
            ],
            correctKey: "C"
          }
        ]
      },

      verbal: {
        title: "Verbal Ability",
        category: "English Communication & Grammar",
        duration: 30,
        questions: [
          {
            id: "verb-1",
            difficulty: "Medium",
            topic: "Sentence Correction",
            type: "mcq",
            title: "Q1: Subject-Verb Agreement",
            question: "Identify the grammatically correct sentence from the following options:",
            options: [
              { key: "A", text: "Neither the team leader nor the engineers was present at the sync." },
              { key: "B", text: "Neither the team leader nor the engineers were present at the sync." },
              { key: "C", text: "Neither the team leader or the engineers was present at the sync." },
              { key: "D", text: "Neither the team leader nor the engineers is present at the sync." }
            ],
            correctKey: "B"
          },
          {
            id: "verb-2",
            difficulty: "Hard",
            topic: "Vocabulary in Context",
            type: "mcq",
            title: "Q2: Vocabulary & Nuance",
            question: "Choose the word closest in meaning to the highlighted word:\n'The executive gave a brief, **laconic** response that concealed any trace of anxiousness.'",
            options: [
              { key: "A", text: "Verbose" },
              { key: "B", text: "Terse / Concise" },
              { key: "C", text: "Hostile" },
              { key: "D", text: "Ambiguous" }
            ],
            correctKey: "B"
          },
          {
            id: "verb-3",
            difficulty: "Medium",
            topic: "Para-Jumbles",
            type: "mcq",
            title: "Q3: Sentence Ordering",
            question: "Rearrange the sentences into a logically coherent paragraph:\n[P] Consequently, organizations are redesigning their campus hiring pipelines.\n[Q] The rapid adoption of generative AI has changed everyday software engineering.\n[R] Candidates must now demonstrate strong system thinking alongside algorithmic skill.\n[S] Traditional rote memorization is no longer sufficient to assess problem solvers.",
            options: [
              { key: "A", text: "Q - S - R - P" },
              { key: "B", text: "Q - P - S - R" },
              { key: "C", text: "S - Q - P - R" },
              { key: "D", text: "P - Q - R - S" }
            ],
            correctKey: "A"
          },
          {
            id: "verb-4",
            difficulty: "Easy",
            topic: "Idioms & Phrases",
            type: "mcq",
            title: "Q4: Professional Idioms",
            question: "What is the meaning of the idiom **'Touch base'** in a professional workplace context?",
            options: [
              { key: "A", text: "To play sports with colleagues" },
              { key: "B", text: "To briefly connect or communicate with someone to update on progress" },
              { key: "C", text: "To assign blames for an error" },
              { key: "D", text: "To start a project from the physical headquarters" }
            ],
            correctKey: "B"
          }
        ]
      },

      coding: {
        title: "DSA Coding Challenge",
        category: "Data Structures & Algorithms",
        duration: 90,
        questions: [
          {
            id: "code-1",
            difficulty: "Medium",
            topic: "Arrays & Hash Maps",
            type: "code",
            title: "Q1: Two Sum Problem",
            question: "Given an array of integers <code>nums</code> and an integer <code>target</code>, return indices of the two numbers such that they add up to <code>target</code>.<br><br>Each input has exactly one solution and you may not use the same element twice.",
            example: "Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]\nExplanation: nums[0] + nums[1] == 9",
            starterCode: `def twoSum(nums, target):
    # Your solution here
    lookup = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in lookup:
            return [lookup[complement], i]
        lookup[num] = i
    return []`
          },
          {
            id: "code-2",
            difficulty: "Hard",
            topic: "Dynamic Programming",
            type: "code",
            title: "Q2: Longest Increasing Subsequence",
            question: "Given an integer array <code>nums</code>, return the length of the longest strictly increasing subsequence in O(N log N) or O(N²).",
            example: "Input: nums = [10,9,2,5,3,7,101,18]\nOutput: 4\nExplanation: The longest increasing subsequence is [2,3,7,101], length = 4.",
            starterCode: `def lengthOfLIS(nums):
    if not nums:
        return 0
    # Complete DP solution below
    dp = [1] * len(nums)
    for i in range(len(nums)):
        for j in range(i):
            if nums[i] > nums[j]:
                dp[i] = max(dp[i], dp[j] + 1)
    return max(dp)`
          },
          {
            id: "code-3",
            difficulty: "Medium",
            topic: "Binary Trees",
            type: "code",
            title: "Q3: Validate Binary Search Tree",
            question: "Given the root of a binary tree, determine if it is a valid binary search tree (BST). The left subtree contains only nodes with keys less than the node's key, and the right subtree contains only keys greater.",
            example: "Input: root = [2,1,3]\nOutput: true",
            starterCode: `def isValidBST(root, low=float('-inf'), high=float('inf')):
    if not root:
        return True
    if not (low < root.val < high):
        return False
    return isValidBST(root.left, low, root.val) and isValidBST(root.right, root.val, high)`
          }
        ]
      },

      dbms: {
        title: "DBMS & SQL Queries",
        category: "Databases & SQL Engineering",
        duration: 45,
        questions: [
          {
            id: "sql-1",
            difficulty: "Medium",
            topic: "Subqueries & Window Functions",
            type: "sql",
            title: "Q1: Second Highest Salary",
            question: "Write an SQL query to report the second highest salary from the <code>Employee</code> table. If there is no second highest salary, query should return null.",
            schema: `TABLE Employee (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  salary INT,
  department_id INT
);`,
            starterCode: `SELECT MAX(salary) AS SecondHighestSalary
FROM Employee
WHERE salary < (SELECT MAX(salary) FROM Employee);`,
            expectedResult: [
              { SecondHighestSalary: 85000 }
            ]
          },
          {
            id: "sql-2",
            difficulty: "Hard",
            topic: "JOINs & Group By",
            type: "sql",
            title: "Q2: Department Highest Salary",
            question: "Write an SQL query to find employees who have the highest salary in each of the departments.",
            schema: `TABLE Department (
  id INT PRIMARY KEY,
  dept_name VARCHAR(50)
);`,
            starterCode: `SELECT d.dept_name AS Department, e.name AS Employee, e.salary AS Salary
FROM Employee e
JOIN Department d ON e.department_id = d.id
WHERE (e.department_id, e.salary) IN (
    SELECT department_id, MAX(salary)
    FROM Employee
    GROUP BY department_id
);`,
            expectedResult: [
              { Department: "Engineering", Employee: "Alice", Salary: 95000 },
              { Department: "Marketing", Employee: "Bob", Salary: 72000 }
            ]
          },
          {
            id: "sql-3",
            difficulty: "Medium",
            topic: "LEFT JOIN & NULL Checks",
            type: "sql",
            title: "Q3: Customers Who Never Ordered",
            question: "Find all customers who never placed any orders using <code>LEFT JOIN</code> on <code>Customers</code> and <code>Orders</code>.",
            schema: `TABLE Customers (id INT, name VARCHAR);
TABLE Orders (id INT, customer_id INT);`,
            starterCode: `SELECT c.name AS Customers
FROM Customers c
LEFT JOIN Orders o ON c.id = o.customer_id
WHERE o.id IS NULL;`,
            expectedResult: [
              { Customers: "Henry" },
              { Customers: "Max" }
            ]
          }
        ]
      },

      technical: {
        title: "AI Technical Interview",
        category: "System Design & Architecture",
        duration: 45,
        questions: [
          {
            id: "tech-1",
            difficulty: "Hard",
            topic: "High-Level System Design",
            type: "interview",
            title: "Q1: Design a Scalable URL Shortener (TinyURL)",
            question: "Design a URL shortening service like TinyURL / Bit.ly handling 100M new URLs per day.<br>Discuss your high-level architecture, database schema, unique hash generation (Base62 vs Snowflake), cache layer, and redirection latency.",
            starterAiMessage: "Hello! Welcome to your AI Technical Interview round. Let's begin with System Design: Can you walk me through how you would architect a URL shortener like bit.ly? What database and encoding strategy would you choose to ensure unique short codes?"
          },
          {
            id: "tech-2",
            difficulty: "Medium",
            topic: "Database Indexing & Internals",
            type: "interview",
            title: "Q2: Database Indexing Trade-offs",
            question: "Explain how B+ Tree indexing works in relational databases (MySQL InnoDB / Postgres). Why do we prefer B+ Trees over Hash Maps or binary search trees for disk-based storage?",
            starterAiMessage: "Great progress! Now let's dive into Database internals. How does a B+ Tree index optimize disk I/O and range scans compared to a standard binary search tree or hash index?"
          }
        ]
      },

      hr: {
        title: "AI HR Interview",
        category: "Behavioral & Culture Fit",
        duration: 30,
        questions: [
          {
            id: "hr-1",
            difficulty: "Medium",
            topic: "STAR Framework: Conflict Resolution",
            type: "interview",
            title: "Q1: Team Conflict & Collaboration",
            question: "Tell me about a time you had a significant technical disagreement or conflict with a teammate or project partner. How did you handle the situation and what was the outcome?",
            starterAiMessage: "Welcome to your HR & Culture Fit round! I'm your AI HR interviewer. Tell me about a time you faced a difficult conflict or technical disagreement with a team member. Please structure your response using the STAR method (Situation, Task, Action, Result)."
          },
          {
            id: "hr-2",
            difficulty: "Medium",
            topic: "Handling Pressure & Deadlines",
            type: "interview",
            title: "Q2: Tight Deadlines & Prioritization",
            question: "Describe a situation where a project deadline was at risk due to an unexpected blocker or scope creep. How did you prioritize your deliverables and communicate with stakeholders?",
            starterAiMessage: "Excellent. Now imagine your project deadline is 24 hours away and you discover a critical blocker that cannot be resolved in time. What exact steps would you take to communicate with your lead and prioritize deliverables?"
          }
        ]
      },

      communication: {
        title: "Communication Assessment",
        category: "Professional Written Communication",
        duration: 25,
        questions: [
          {
            id: "comm-1",
            difficulty: "Easy",
            topic: "Client Incident Communication",
            type: "communication",
            title: "Task 1: Incident & Delay Escalation Email",
            scenario: "You are the tech lead for an enterprise customer onboarding project. A database migration issue has caused a 2-day delay on a promised go-live date.",
            prompt: "Draft an empathetic, professional email to the client's VP of Engineering explaining the incident, outline the mitigation steps already taken, and provide a clear revised timeline.",
            starterSubject: "Update regarding production onboarding timeline - Placement Coach platform",
            starterDraft: "Dear Client Team,\n\nI am writing to provide an important update regarding our upcoming go-live milestone..."
          },
          {
            id: "comm-2",
            difficulty: "Medium",
            topic: "Executive Summary",
            type: "communication",
            title: "Task 2: Technical Proposal Summary",
            scenario: "Your team has decided to migrate a monolithic backend to serverless microservices to reduce infrastructure costs.",
            prompt: "Write a concise 3-paragraph executive summary for non-technical leadership highlighting the business benefits, cost savings, and risk mitigation strategies.",
            starterSubject: "Executive Summary: Cloud Infrastructure Optimization",
            starterDraft: "Executive Summary:\n\nOur engineering team has evaluated options to optimize our current infrastructure..."
          }
        ]
      }
    };
