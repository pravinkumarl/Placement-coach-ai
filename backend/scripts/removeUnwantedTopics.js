import mongoose from 'mongoose';
import env from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import TopicPerformance from '../src/models/TopicPerformance.js';
import Question from '../src/models/Question.js';
import Assessment from '../src/models/Assessment.js';

async function run() {
  await connectDatabase();
  console.log('Connected to DB.');

  const unwantedTopics = ['Blood Relations', 'Seating Arrangement'];

  // 1. Delete from TopicPerformance
  const delTopicPerf = await TopicPerformance.deleteMany({ topic: { $in: unwantedTopics } });
  console.log(`Deleted ${delTopicPerf.deletedCount} records from TopicPerformance.`);

  // 2. Delete from standalone Questions
  const delQuestions = await Question.deleteMany({ topic: { $in: unwantedTopics } });
  console.log(`Deleted ${delQuestions.deletedCount} records from Questions.`);

  // 3. Remove from Assessment.questions
  const logical = await Assessment.findOne({ moduleKey: 'logical' });
  if (logical) {
    const origCount = logical.questions.length;
    logical.questions = logical.questions.filter((q) => !unwantedTopics.includes(q.topic));
    logical.questionCount = logical.questions.length;
    await logical.save();
    console.log(`Updated logical assessment: questions reduced from ${origCount} to ${logical.questionCount}.`);
  }

  // 4. Fill in missing categories in remaining TopicPerformance documents
  const topicCategoryMap = {
    'Time & Work': 'Aptitude & Problem Solving',
    'Profit & Loss': 'Aptitude & Problem Solving',
    'Speed & Distance': 'Aptitude & Problem Solving',
    'Probability': 'Aptitude & Problem Solving',
    'Compound Interest': 'Aptitude & Problem Solving',
    'Syllogisms': 'Logical Reasoning',
    'Coding-Decoding': 'Logical Reasoning',
    'Pattern Series': 'Logical Reasoning',
    'Direction Sense': 'Logical Reasoning',
    'Statement & Assumptions': 'Logical Reasoning',
    'Sentence Correction': 'Verbal Ability',
    'Vocabulary in Context': 'Verbal Ability',
    'Para-Jumbles': 'Verbal Ability',
    'Idioms & Phrases': 'Verbal Ability',
    'Arrays & Hash Maps': 'Data Structures & Algorithms',
    'Dynamic Programming': 'Data Structures & Algorithms',
    'Binary Trees': 'Data Structures & Algorithms',
    'Subqueries & Window Functions': 'Database Systems',
    'JOINs & Group By': 'Database Systems',
    'LEFT JOIN & NULL Checks': 'Database Systems',
    'High-Level System Design': 'Technical Core',
    'Database Indexing & Internals': 'Technical Core',
    'STAR Framework: Conflict Resolution': 'Communication & HR',
    'Handling Pressure & Deadlines': 'Communication & HR',
    'Client Incident Communication': 'Communication & HR',
    'Executive Summary': 'Communication & HR',
  };

  const allTopics = await TopicPerformance.find({});
  for (const t of allTopics) {
    if (!t.category && topicCategoryMap[t.topic]) {
      t.category = topicCategoryMap[t.topic];
      await t.save();
    }
  }
  console.log('Populated missing categories for existing TopicPerformance records.');

  await disconnectDatabase();
  console.log('Finished.');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
