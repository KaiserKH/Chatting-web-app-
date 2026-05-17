require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { initSocket } = require('./config/socket');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const friendRoutes = require('./routes/friends');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const storyRoutes = require('./routes/stories');
const notificationRoutes = require('./routes/notifications');
const uploadRoutes = require('./routes/upload');

const app = express();
const server = http.createServer(app);
const io = initSocket(server);

const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(publicDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.set('io', io);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:']
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({ error: error.message || 'Internal server error' });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
