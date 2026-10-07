import mongoose from 'mongoose';

const interviewQuestionSchema = new mongoose.Schema(
  {
    id: { type: String, default: '' },
    category: { type: String, default: 'general' },
    question: { type: String, required: true },
    expectedAnswer: { type: String, default: '' },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
  },
  { _id: false }
);

const transcriptEntrySchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const interviewSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['hr', 'technical', 'managerial', 'mock'],
      default: 'mock',
      index: true,
    },
    title: { type: String, default: 'Mock Interview' },
    role: { type: String, default: '' },
    company: { type: String, default: '' },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    questions: { type: [interviewQuestionSchema], default: [] },
    answers: [
      {
        questionId: { type: String, default: '' },
        answer: { type: String, default: '' },
        feedback: { type: String, default: '' },
        score: { type: Number, default: 0, min: 0, max: 100 },
        _id: false,
      },
    ],
    transcript: { type: [transcriptEntrySchema], default: [] },
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
    },
    overallScore: { type: Number, default: 0, min: 0, max: 100 },
    communicationScore: { type: Number, default: 0, min: 0, max: 100 },
    technicalScore: { type: Number, default: 0, min: 0, max: 100 },
    problemSolvingScore: { type: Number, default: 0, min: 0, max: 100 },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    overallFeedback: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

interviewSessionSchema.index({ userId: 1, startedAt: -1 });

const InterviewSession = mongoose.model('InterviewSession', interviewSessionSchema);

export default InterviewSession;
