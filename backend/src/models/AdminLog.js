import mongoose from 'mongoose';

const adminLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    adminName: {
      type: String,
      default: 'Admin',
      trim: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    resource: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    resourceId: {
      type: String,
      default: '',
      trim: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    result: {
      type: String,
      enum: ['success', 'failure'],
      default: 'success',
    },
    ipAddress: {
      type: String,
      default: '',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

adminLogSchema.index({ createdAt: -1 });

const AdminLog = mongoose.model('AdminLog', adminLogSchema);

export default AdminLog;
