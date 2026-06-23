const mongoose = require('mongoose');

const ListingSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  urdu:        { type: String, default: '' },
  category:    { type: String, default: 'Other' },
  price:       { type: Number, required: true },
  stock:       { type: Number, required: true },
  seller:      { type: String, required: true },
  city:        { type: String, required: true },
  phone:       { type: String, required: true },
  desc:        { type: String, default: '' },
  status:      { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  imageBase64: { type: String, default: '' },  // stored temporarily until admin uploads to GoDaddy
  imageUrl:    { type: String, default: '' },  // final URL after admin uploads image
  emoji:       { type: String, default: '🌿' },
  createdAt:   { type: Date, default: Date.now },
  approvedAt:  { type: Date },
  adminNote:   { type: String, default: '' },
});

module.exports = mongoose.model('Listing', ListingSchema);