const express = require('express');
const router = express.Router();
const {
  getProperties, getPropertyById, createProperty,
  updateProperty, deleteProperty, getMyListings,
} = require('../controllers/propertyController');
const { protect, notBanned } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Public routes
router.get('/', getProperties);

// Protected routes (order matters — specific before param)
router.get('/my-listings', protect, getMyListings);
router.get('/:id', getPropertyById);

router.post('/', protect, notBanned, upload.array('images', 6), createProperty);
router.put('/:id', protect, notBanned, updateProperty);
router.delete('/:id', protect, deleteProperty);

module.exports = router;
