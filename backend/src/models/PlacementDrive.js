import mongoose from 'mongoose';

const placementDriveSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: 200,
    },
    role: {
      type: String,
      required: [true, 'Job role is required'],
      trim: true,
      maxlength: 200,
    },
    package: {
      type: String,
      trim: true,
      default: '',
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 3000,
    },
    driveDate: {
      type: Date,
      default: null,
    },
    applicationDeadline: {
      type: Date,
      default: null,
    },
    eligibleBranches: {
      type: [String],
      default: ['CSE', 'IT', 'ECE', 'EEE', 'Mechanical', 'Civil'],
    },
    minCgpa: {
      type: Number,
      min: 0,
      max: 10,
      default: 6.5,
    },
    minReadiness: {
      type: Number,
      min: 0,
      max: 100,
      default: 60,
    },
    requiredSkills: {
      type: [String],
      default: [],
    },
    maxBacklogs: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Draft', 'Open', 'Closed', 'Completed'],
      default: 'Open',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

placementDriveSchema.index({ status: 1, driveDate: 1 });
placementDriveSchema.index({ createdAt: -1 });

const PlacementDrive = mongoose.model('PlacementDrive', placementDriveSchema);

export default PlacementDrive;
