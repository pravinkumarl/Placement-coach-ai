import env from '../config/env.js';
import InterviewSession from '../models/InterviewSession.js';
import { generateJson } from './gemini.service.js';
import { ApiError } from '../utils/response.js';

/**
 * Deterministic fallback bank — guarantees interview sessions work even when
 * GEMINI_API_KEY is not configured (and keeps tests offline friendly).
 */
const QUESTION_BANK = {
  hr: [
    { question: 'Tell me about yourself in two minutes.', category: 'intro', expectedAnswer: 'A concise summary of education, skills, projects and career goal.' },
    { question: 'Why do you want to work with us?', category: 'motivation', expectedAnswer: 'Company specific reasons: product, culture, learning opportunities.' },
    { question: 'What are your strengths and weaknesses?', category: 'self-awareness', expectedAnswer: 'Honest strengths backed by examples and a weakness with improvement steps.' },
    { question: 'Where do you see yourself in five years?', category: 'goals', expectedAnswer: 'Realistic growth path aligned with the role.' },
    { question: 'Tell me about a time you worked in a team.', category: 'teamwork', expectedAnswer: 'A STAR story showing collaboration and conflict resolution.' },
  ],
  technical: [
    { question: 'Explain the time and space complexity of binary search.', category: 'dsa', expectedAnswer: 'O(log n) time, O(1) iterative space.' },
    { question: 'How does an index improve database query performance?', category: 'dbms', expectedAnswer: 'Index reduces scan from full table to a B-tree lookup.' },
    { question: 'What is the difference between TCP and UDP?', category: 'networking', expectedAnswer: 'TCP is connection oriented and reliable; UDP is connectionless and fast.' },
    { question: 'Explain SOLID principles with one example.', category: 'design', expectedAnswer: 'Five design principles; single responsibility keeps classes small.' },
    { question: 'How would you detect a cycle in a linked list?', category: 'dsa', expectedAnswer: 'Floyd cycle detection using slow and fast pointers.' },
  ],
  managerial: [
    { question: 'Describe a difficult deadline you met.', category: 'planning', expectedAnswer: 'STAR story with prioritisation and trade offs.' },
    { question: 'How do you handle disagreement with a teammate?', category: 'conflict', expectedAnswer: 'Data driven discussion, escalate only when needed.' },
    { question: 'Tell me about a bug you shipped and fixed.', category: 'ownership', expectedAnswer: 'Honest account with root cause and prevention steps.' },
    { question: 'How do you prioritise when everything is urgent?', category: 'prioritisation', expectedAnswer: 'Impact versus effort, communicate trade offs.' },
    { question: 'Give an example of taking initiative.', category: 'initiative', expectedAnswer: 'Concrete example with measurable outcome.' },
  ],
  mock: [
    { question: 'Walk me through your most interesting project.', category: 'project', expectedAnswer: 'Problem, approach, tech stack, result.' },
    { question: 'What is the hardest technical problem you solved?', category: 'problem-solving', expectedAnswer: 'STAR answer with technical depth.' },
    { question: 'How do you keep learning new technologies?', category: 'growth', expectedAnswer: 'Consistent learning habit with sources.' },
    { question: 'Why should we hire you?', category: 'pitch', expectedAnswer: 'Short pitch linking skills to the role.' },
    { question: 'What questions do you have for us?', category: 'closing', expectedAnswer: 'Thoughtful role and team specific questions.' },
  ],
};

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

function fallbackQuestions(type, count) {
  const bank = QUESTION_BANK[type] || QUESTION_BANK.mock;
  const difficulty = type === 'technical' ? 'Hard' : 'Medium';
  const questions = [];
  for (let i = 0; i < count; i += 1) {
    const source = bank[i % bank.length];
    questions.push({
      id: `q${i + 1}`,
      category: source.category,
      question: source.question,
      expectedAnswer: source.expectedAnswer,
      difficulty: i % 3 === 2 ? 'Hard' : difficulty,
    });
  }
  return questions;
}

/**
 * Create an interview session with generated questions.
 */
export async function createSession(user, options = {}) {
  const type = ['hr', 'technical', 'managerial', 'mock'].includes(options.type)
    ? options.type
    : 'mock';
  const difficulty = DIFFICULTIES.includes(options.difficulty) ? options.difficulty : 'Medium';
  const role = String(options.role || user.targetRole || '').slice(0, 160);
  const company = String(options.company || '').slice(0, 160);
  const count = Math.min(Math.max(Number(options.questionCount) || 5, 3), 10);

  let questions = null;

  if (env.geminiApiKey) {
    try {
      const prompt = [
        `Generate ${count} ${difficulty} level ${type} interview questions for a student.`,
        `Target role: ${role || 'software engineer'}. Company: ${company || 'any company'}.`,
        'Respond with ONLY JSON: {"questions":[{"question": string, "category": string, "expectedAnswer": string}]}',
        'expectedAnswer should be a 1-2 line model answer.',
      ].join('\n');

      const data = await generateJson(prompt, { temperature: 0.6 });
      const list = Array.isArray(data.questions) ? data.questions : [];
      if (list.length > 0) {
        questions = list.slice(0, count).map((q, index) => ({
          id: `q${index + 1}`,
          category: String(q.category || 'general').slice(0, 60),
          question: String(q.question || '').slice(0, 500),
          expectedAnswer: String(q.expectedAnswer || '').slice(0, 800),
          difficulty,
        }));
      }
    } catch (error) {
      questions = null; // fall through to the deterministic bank
    }
  }

  if (!questions || questions.length === 0) {
    questions = fallbackQuestions(type, count);
  }

  return InterviewSession.create({
    userId: user._id,
    type,
    title: `${type[0].toUpperCase()}${type.slice(1)} Interview${role ? ` — ${role}` : ''}`,
    role,
    company,
    difficulty,
    questions,
    transcript: [
      {
        role: 'system',
        content: `Interview started (${type}, ${difficulty}). Answer each question as you would in a real interview.`,
        at: new Date(),
      },
    ],
    status: 'in_progress',
  });
}

/**
 * Deterministic answer scoring so results are reproducible offline.
 * Score = keyword coverage + completeness, clamped to 0..100.
 */
export function scoreAnswer(question, answer) {
  const text = String(answer || '').trim();
  if (text.length === 0) return 0;

  const expected = String(question.expectedAnswer || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const keywords = [...new Set(expected.split(/\s+/).filter((w) => w.length > 4))].slice(0, 12);

  const haystack = text.toLowerCase();
  const hits = keywords.filter((word) => haystack.includes(word)).length;
  const keywordScore = keywords.length ? (hits / keywords.length) * 60 : 30;

  const lengthScore = Math.min(Math.round(text.length / 4), 40);
  return Math.max(0, Math.min(100, Math.round(keywordScore + lengthScore)));
}

/**
 * Score a single answer and produce feedback text.
 */
export async function evaluateAnswer(question, answer) {
  const text = String(answer || '').trim();
  const score = scoreAnswer(question, text);

  let feedback = '';
  if (env.geminiApiKey) {
    try {
      const data = await generateJson(
        [
          'You are an interview evaluator. Score the candidate answer from 0 to 100 and give 2 lines of feedback.',
          'Respond with ONLY JSON: {"score": number, "feedback": string}',
          `Question: ${question.question}`,
          `Model answer: ${question.expectedAnswer}`,
          `Candidate answer: ${text || '(no answer)'}`,
        ].join('\n'),
        { temperature: 0.3, maxOutputTokens: 600 }
      );
      const aiScore = Number(data.score);
      feedback = String(data.feedback || '').slice(0, 600);
      if (Number.isFinite(aiScore)) {
        return { score: Math.max(0, Math.min(100, Math.round(aiScore))), feedback };
      }
    } catch {
      /* use deterministic feedback below */
    }
  }

  if (!text) {
    feedback = 'No answer provided. Structure your answer using STAR and add concrete examples.';
  } else if (score >= 75) {
    feedback = 'Strong answer. It covers most key points; tighten the opening sentence for impact.';
  } else if (score >= 45) {
    feedback = 'Decent answer. Add specific examples, measurable outcomes and clearer structure.';
  } else {
    feedback = 'The answer is too brief or misses key points. Cover the core idea, add an example and end with a result.';
  }

  return { score, feedback };
}

export default { createSession, scoreAnswer, evaluateAnswer };
