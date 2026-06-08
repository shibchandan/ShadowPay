import mongoose from 'mongoose';

const idempotencySchema = new mongoose.Schema({
  _id: { type: String, required: true }, // packetHash
  createdAt: { type: Date, default: Date.now, expires: 86400 } // TTL index: auto-expires after 24 hours
});

export const Idempotency = mongoose.model('Idempotency', idempotencySchema);
