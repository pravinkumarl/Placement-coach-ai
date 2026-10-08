import mongoose from 'mongoose';

const questionOptionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      trim: true,
      index: true,
      default: '',
    },
    title: {
      type: String,
      required: [true, 'Question title is required'],
      trim: true,
      maxlength: 300,
    },
    question: {
      type: String,
      required: [true, 'Question prompt is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['mcq', 'code', 'sql', 'interview', 'communication', 'technical'],
      default: 'mcq',
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      index: true,
    },
    topic: {
      type: String,
      required: [true, 'Topic is required'],
      trim: true,
      index: true,
    },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      default: 'Medium',
      index: true,
    },
    marks: {
      type: Number,
      default: 1,
      min: 1,
    },
    options: {
      type: [questionOptionSchema],
      default: [],
    },
    correctKey: {
      type: String,
      default: '',
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    hint: {
      type: String,
      default: '',
    },
    explanation: {
      type: String,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

questionSchema.index({ category: 1, topic: 1 });
questionSchema.index({ type: 1, difficulty: 1 });
questionSchema.index({ createdAt: -1 });

const Question = mongoose.model('Question', questionSchema);

export default Question;
