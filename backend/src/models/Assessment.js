import mongoose from 'mongoose';

/**
 * A single question is stored as a Mixed document so every existing
 * question type (mcq, code, sql, interview, communication) keeps all of the
 * rendering fields the frontend already uses.
 */
const assessmentSchema = new mongoose.Schema(
  {
    moduleKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    topic: { type: String, default: '', trim: true },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard', 'Mixed'],
      default: 'Mixed',
    },
    durationMinutes: { type: Number, default: 45, min: 1, max: 600 },
    questionCount: { type: Number, default: 0 },
    questions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

assessmentSchema.index({ category: 1 });

const Assessment = mongoose.model('Assessment', assessmentSchema);

export default Assessment;
