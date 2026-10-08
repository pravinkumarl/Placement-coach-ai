import mongoose from 'mongoose';

const topicResultSchema = new mongoose.Schema(
  {
    topic: { type: String, default: '' },
    category: { type: String, default: '' },
    correct: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
  },
  { _id: false }
);

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: String, default: '' },
    topic: { type: String, default: '' },
    type: { type: String, default: '' },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false }
);

const assessmentAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment' },
    moduleKey: { type: String, default: '', index: true },
    roadmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', default: null },
    title: { type: String, default: '' },
    category: { type: String, default: '' },
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
    },
    answers: { type: [answerSchema], default: [] },
    topicResults: { type: [topicResultSchema], default: [] },
    questionCount: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    timeTakenSeconds: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assessmentAttemptSchema.index({ userId: 1, completedAt: -1 });
assessmentAttemptSchema.index({ completedAt: -1 });
assessmentAttemptSchema.index({ userId: 1, assessmentId: 1 });
assessmentAttemptSchema.index({ userId: 1, roadmapId: 1 });

const AssessmentAttempt = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);

export default AssessmentAttempt;
