const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    bidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

// Compound index: fetch all bids for a property sorted by time
bidSchema.index({ property: 1, createdAt: -1 });
bidSchema.index({ bidder: 1 });

module.exports = mongoose.model('Bid', bidSchema);
