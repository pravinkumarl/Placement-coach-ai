import mongoose from 'mongoose';

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const driveApplicationSchema = new mongoose.Schema(
  {
    driveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlacementDrive',
      required: [true, 'Drive ID is required'],
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student ID is required'],
      index: true,
    },
    status: {
      type: String,
      enum: [
        'Eligible',
        'Applied',
        'Shortlisted',
        'Assessment',
        'Interview',
        'Selected',
        'Rejected',
        'Withdrawn',
      ],
      default: 'Applied',
      index: true,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    stageNotes: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    history: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  { timestamps: true }
);

driveApplicationSchema.index({ driveId: 1, studentId: 1 }, { unique: true });
driveApplicationSchema.index({ status: 1, updatedAt: -1 });

const DriveApplication = mongoose.model('DriveApplication', driveApplicationSchema);

export default DriveApplication;
