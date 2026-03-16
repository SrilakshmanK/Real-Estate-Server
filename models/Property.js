const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Property title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    propertyType: {
      type: String,
      enum: ['house', 'apartment', 'land', 'commercial'],
      required: [true, 'Property type is required'],
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: 0,
    },
    images: [{ type: String }], // Cloudinary URLs

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'SOLD'],
      default: 'PENDING',
    },
    adminNote: {
      type: String,
      default: '',
    },

    // ─── Auction Fields ───────────────────────────────────────
    isAuction: {
      type: Boolean,
      default: false,
    },
    minBidIncrement: {
      type: Number,
      default: 0,
    },
    auctionStartTime: {
      type: Date,
    },
    auctionEndTime: {
      type: Date,
    },
    currentHighestBid: {
      type: Number,
      default: 0,
    },
    highestBidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ─── Deal Closing ─────────────────────────────────────────
    dealStatus: {
      type: String,
      enum: ['NONE', 'ACCEPTED', 'REJECTED'],
      default: 'NONE',
    },
  },
  { timestamps: true }
);

// Indexes for performance
propertySchema.index({ status: 1 });
propertySchema.index({ isAuction: 1, auctionEndTime: 1 });
propertySchema.index({ location: 'text', title: 'text' });
propertySchema.index({ basePrice: 1 });
propertySchema.index({ owner: 1 });

module.exports = mongoose.model('Property', propertySchema);
