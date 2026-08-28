import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const ROLES = ['user', 'admin'];
const PROVIDERS = ['email', 'google', 'github'];
const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [
        function () {
          return this.provider === 'email';
        },
        'Password is required',
      ],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Never return password by default
    },
    role: {
      type: String,
      enum: {
        values: ROLES,
        message: 'Role must be one of: ' + ROLES.join(', '),
      },
      default: 'user',
    },
    mobile: {
      type: String,
      trim: true,
      default: '',
    },
    provider: {
      type: String,
      enum: {
        values: PROVIDERS,
        message: 'Provider must be one of: ' + PROVIDERS.join(', '),
      },
      default: 'email',
    },
    providerId: {
      type: String,
      default: null,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
    totalWatchTimeMs: {
      type: Number,
      default: 0,
    },
    profilePicture: {
      type: String,
      default: '',
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate OAuth identities
userSchema.index(
  { provider: 1, providerId: 1 },
  { unique: true, partialFilterExpression: { providerId: { $type: 'string' } } }
  
);

// ─── Pre-save: hash password ─────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();

  try {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
    next();
  } catch (error) {
    next(error);
  }
});

// ─── Instance method: compare password ───────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Instance method: safe JSON (strip password) ─────
userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const User = mongoose.model('User', userSchema);

export default User;
export { ROLES, PROVIDERS };