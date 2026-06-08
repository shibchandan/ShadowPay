import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  packetHash: { type: String, required: true, unique: true }, // Unique index as defense in depth
  senderVpa: { type: String, required: true },
  receiverVpa: { type: String, required: true },
  amount: { type: mongoose.Schema.Types.Decimal128, required: true },
  signedAt: { type: Date, required: true },
  settledAt: { type: Date, default: Date.now },
  bridgeNodeId: { type: String, required: true },
  hopCount: { type: Number, required: true },
  status: { type: String, enum: ['SETTLED', 'REJECTED'], required: true },
  auditedPath: { type: Array, default: [] }
});

export const Transaction = mongoose.model('Transaction', transactionSchema);
