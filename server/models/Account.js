import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // VPA, e.g., 'alice@shadowpay'
  name: { type: String, required: true },
  balance: { type: mongoose.Schema.Types.Decimal128, required: true },
  prefundedBalance: { type: mongoose.Schema.Types.Decimal128, default: 0.00 },
  publicKeyPath: { type: String }
}, {
  optimisticConcurrency: true,
  versionKey: 'version'
});

export const Account = mongoose.model('Account', accountSchema);
