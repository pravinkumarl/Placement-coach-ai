import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [120, 'Name is too long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [200, 'Email is too long'],
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    phone: { type: String, trim: true, default: '' },
    college: { type: String, trim: true, default: '', maxlength: 200 },
    degree: { type: String, trim: true, default: '', maxlength: 120 },
    branch: { type: String, trim: true, default: '', maxlength: 120 },
    graduationYear: { type: Number, default: new Date().getFullYear() + 1 },
    avatar: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '', maxlength: 1000 },
    cgpa: { type: Number, min: 0, max: 10, default: null },
    social: {
      github: { type: String, trim: true, default: '' },
      linkedin: { type: String, trim: true, default: '' },
    },
    targetRole: { type: String, trim: true, default: '', maxlength: 160 },
    targetCompanies: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    readinessScore: { type: Number, min: 0, max: 100, default: 0 },
    lastAssessmentAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ getters: false, virtuals: false });
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);

export default User;
