import mongoose from 'mongoose';

const topicPerformanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    topic: { type: String, required: true, trim: true },
    category: { type: String, default: '', trim: true },
    attempts: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0, min: 0, max: 100 },
    lastAttemptAt: { type: Date, default: null },
  },
  { timestamps: true }
);

topicPerformanceSchema.index({ userId: 1, topic: 1 }, { unique: true });

const TopicPerformance = mongoose.model('TopicPerformance', topicPerformanceSchema);

export default TopicPerformance;
