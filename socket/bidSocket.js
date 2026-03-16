                          const setupSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ─── User Room (for notifications) ────────────────────────
    // Client sends userId to join a personal notification room
    socket.on('register-user', (userId) => {
      if (userId) {
        socket.join(`user-${userId}`);
        console.log(`Socket ${socket.id} registered as user: ${userId}`);
      }
    });

    // User joins a specific property room to receive real-time bid updates
    socket.on('join-property', (propertyId) => {
      socket.join(`property-${propertyId}`);
      console.log(`Socket ${socket.id} joined room: property-${propertyId}`);
    });

    // User leaves a property room
    socket.on('leave-property', (propertyId) => {
      socket.leave(`property-${propertyId}`);
      console.log(`Socket ${socket.id} left room: property-${propertyId}`);
    });

    // ─── Chat Rooms ──────────────────────────────────────────────
    socket.on('join-chat', (conversationId) => {
      socket.join(`chat-${conversationId}`);
      console.log(`Socket ${socket.id} joined chat: chat-${conversationId}`);
    });

    socket.on('leave-chat', (conversationId) => {
      socket.leave(`chat-${conversationId}`);
      console.log(`Socket ${socket.id} left chat: chat-${conversationId}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = setupSocket;
