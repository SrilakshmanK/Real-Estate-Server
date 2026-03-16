const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

// Use memory storage - we'll stream to Cloudinary manually
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Upload a single buffer to Cloudinary and return secure URL
const uploadToCloudinary = (buffer, folder = 'realestate') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    Readable.from(buffer).pipe(uploadStream);
  });
};

// Upload multiple files and return array of URLs
const uploadMultipleToCloudinary = async (files, folder = 'realestate') => {
  const uploads = files.map((file) => uploadToCloudinary(file.buffer, folder));
  return Promise.all(uploads);
};

module.exports = { upload, uploadToCloudinary, uploadMultipleToCloudinary };
