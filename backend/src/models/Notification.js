import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: 2000,
    },
    type: {
      type: String,
      enum: ['announcement', 'drive', 'alert', 'reminder'],
      default: 'announcement',
    },
    targetRole: {
      type: String,
      enum: ['all', 'student', 'admin'],
      default: 'all',
    },
    targetBranch: {
      type: String,
      default: '',
      trim: true,
    },
    link: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    readBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ targetRole: 1, isPinned: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
