import mongoose from 'mongoose';

const codingSubmissionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentAttempt', default: null },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', default: null },
    moduleKey: { type: String, default: '', index: true },
    roadmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', default: null },
    questionId: { type: String, required: true, trim: true },
    questionTitle: { type: String, default: '' },
    topic: { type: String, default: '' },
    language: { type: String, required: true, trim: true },
    sourceCode: { type: String, default: '' },
    status: { type: String, default: 'Accepted' },
    passedTests: { type: Number, default: 0 },
    totalTests: { type: Number, default: 0 },
    score: { type: Number, default: 0, min: 0, max: 100 },
    compileOutput: { type: String, default: '' },
    stderr: { type: String, default: '' },
    executionTime: { type: Number, default: 0 },
    memory: { type: Number, default: null },
  },
  { timestamps: true }
);

codingSubmissionSchema.index({ userId: 1, questionId: 1, submittedAt: -1 });
codingSubmissionSchema.index({ userId: 1, submittedAt: -1 });
codingSubmissionSchema.index({ userId: 1, attemptId: 1 });

const CodingSubmission = mongoose.model('CodingSubmission', codingSubmissionSchema);

export default CodingSubmission;