import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'general', trim: true },
    order: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
    estimatedHours: { type: Number, default: 4, min: 0 },
    completedAt: { type: Date, default: null },
  },
  { _id: true }
);

const roadmapSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    summary: { type: String, default: '' },
    focusAreas: { type: [String], default: [] },
    milestones: { type: [milestoneSchema], default: [] },
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    isGenerated: { type: Boolean, default: false },
    generatedBy: { type: String, default: 'system' },
    lastGeneratedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

roadmapSchema.methods.recalculate = function recalculate() {
  const total = this.milestones.length;
  if (total === 0) {
    this.completionPercentage = 0;
    return this.completionPercentage;
  }
  const done = this.milestones.filter((m) => m.status === 'completed').length;
  this.completionPercentage = Math.round((done / total) * 100);
  return this.completionPercentage;
};

const Roadmap = mongoose.model('Roadmap', roadmapSchema);

export default Roadmap;
