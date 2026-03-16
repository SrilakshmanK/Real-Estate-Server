require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const setupSocket = require('./socket/bidSocket');

// ─── Route imports ────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const auctionRoutes = require('./routes/auctionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const chatRoutes = require('./routes/chatRoutes');

// ─── Connect to database ──────────────────────────────────────
connectDB();

const app = express();
const httpServer = http.createServer(app);

// ─── Socket.io setup ─────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

setupSocket(io);
// Make io accessible in controllers via req.app.get('io')
app.set('io', io);

// ─── Middleware ───────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);

// ─── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Real Estate Auction API is running 🚀' });
});

// ─── 404 Handler ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
