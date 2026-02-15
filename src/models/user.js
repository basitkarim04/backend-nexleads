const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  nexleadsEmail: { type: String },
  password: { type: String, required: true},
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  type: String,
  blocked: {
    type: Boolean,
    default: false,
  },
  bio: String,
  emailOtp: String,
  emailOtpExpires: Date,
  profilePicture: {
    type: String,
    default: '',
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'pro', 'platinum'],
      default: 'free',
    },
    leadsLimit: {
      type: Number,
      default: 30,
    },
    leadsUsed: {
      type: Number,
      default: 0,
    },
    resetDate: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

module.exports = mongoose.model('User', userSchema);