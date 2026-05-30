const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const detectEmotion = require('./utils/emotionalAnalyzer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ─── MongoDB ────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://chatadmin:chat123@cluster0.4wkmxke.mongodb.net/chatify?appName=Cluster0')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB error:', err));

// ─── Schemas ────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, trim: true },
  password: String,
  avatarUrl: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  groupId: String,
  message: String,
  mediaUrl: String,
  mediaType: String,
  emotion: { type: String, default: 'neutral' },  // ← ADD THIS LINE
  seen: { type: Boolean, default: false },
  delivered: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const groupSchema = new mongoose.Schema({
  groupId: { type: String, unique: true },
  name: String,
  members: [String],
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});
const Group = mongoose.model('Group', groupSchema);

// ─── Multer (file uploads) ───────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // FIX: check mimetype starts with image or video instead of substring match
    const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    ok ? cb(null, true) : cb(new Error('Only images and videos allowed'));
  }
});

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ message: 'All fields required' });
    const exists = await User.findOne({ username });
    if (exists) return res.json({ message: 'Username already taken' });
    const hashed = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashed, avatarUrl: null });
    res.json({ message: 'Registration successful', username, avatarUrl: null });
  } catch (e) {
    res.json({ message: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.json({ message: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ message: 'Wrong password' });
    res.json({ message: 'Login successful', username, avatarUrl: user.avatarUrl || null });
  } catch (e) {
    res.json({ message: 'Server error' });
  }
});

// ─── Message History Routes ──────────────────────────────────────────────────
app.get('/api/messages/dm/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const msgs = await Message.find({
      receiver: { $ne: null },
      groupId: null,
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ createdAt: 1 }).limit(200);
    res.json(msgs);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/messages/group/:groupId', async (req, res) => {
  try {
    const msgs = await Message.find({ groupId: req.params.groupId })
      .sort({ createdAt: 1 }).limit(200);
    res.json(msgs);
  } catch (e) {
    res.json([]);
  }
});
// ── Insights Route ──────────────────────────────────────────────────────
app.get('/api/insights/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const msgs = await Message.find({ sender: username });

    const counts = { happy: 0, positive: 0, sad: 0, angry: 0, neutral: 0 };
    msgs.forEach(m => {
      const e = m.emotion || 'neutral';
      if (counts[e] !== undefined) counts[e]++;
      else counts.neutral++;
    });

    const total = msgs.length;
    const topEmotion = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    res.json({ total, counts, topEmotion });
  } catch (e) {
    res.json({ total: 0, counts: {}, topEmotion: 'neutral' });
  }
});
app.post('/api/messages/seen', async (req, res) => {
  try {
    const { viewer, sender } = req.body;
    await Message.updateMany(
      { sender, receiver: viewer, seen: false },
      { seen: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ─── Media Upload Route ──────────────────────────────────────────────────────
app.post('/api/upload', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  res.json({
    url: '/uploads/' + req.file.filename,
    type: mediaType
  });
});

// ─── Group Routes ────────────────────────────────────────────────────────────
app.post('/api/groups/create', async (req, res) => {
  try {
    const { name, members, createdBy } = req.body;
    const groupId = 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const allMembers = [...new Set([...members, createdBy])];
    await Group.create({ groupId, name, members: allMembers, createdBy });
    res.json({ message: 'Group created', groupId, name, members: allMembers });
  } catch (e) {
    res.json({ message: 'Error creating group' });
  }
});

app.get('/api/groups/:username', async (req, res) => {
  try {
    const groups = await Group.find({ members: req.params.username });
    res.json(groups);
  } catch (e) {
    res.json([]);
  }
});
// ── Delete Chat Route ────────────────────────────────────────────────────
app.delete('/api/messages/dm/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    await Message.deleteMany({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

app.delete('/api/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { username } = req.body;
    const group = await Group.findOne({ groupId });
    if (!group) return res.json({ message: 'Group not found' });
    if (group.createdBy !== username) return res.json({ message: 'Only creator can delete' });
    await Group.deleteOne({ groupId });
    await Message.deleteMany({ groupId });
    res.json({ message: 'Group deleted' });
  } catch (e) { res.json({ message: 'Error' }); }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username avatarUrl').sort({ username: 1 });
    res.json(users.map(u => ({ username: u.username, avatarUrl: u.avatarUrl || null })));
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/user/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }, 'username avatarUrl');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ username: user.username, avatarUrl: user.avatarUrl || null });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/profile-picture/remove', async (req, res) => {
  try {
    const { username } = req.body;
    await User.findOneAndUpdate({ username }, { avatarUrl: null });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});
app.post('/api/profile-picture', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const username = req.body.username;
    if (!username) return res.status(400).json({ message: 'Missing username' });
    const avatarUrl = '/uploads/' + req.file.filename;
    const user = await User.findOneAndUpdate(
      { username },
      { avatarUrl },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Avatar updated', avatarUrl });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: 'Server error' });
  }
});
app.delete('/api/message/:id', async (req, res) => {
  try {
    await Message.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// Delete account
app.delete('/api/delete-account/:username', async (req,res)=>{
  try{
    const username=req.params.username;

    await User.deleteOne({ username });

    await Message.deleteMany({
      $or:[
        { sender: username },
        { receiver: username }
      ]
    });

    await Group.updateMany({},{
      $pull:{ members: username }
    });

    res.json({ success:true });

  }catch(err){
    console.log(err);
    res.json({ success:false });
  }
});


// ─── Socket.IO ───────────────────────────────────────────────────────────────
const onlineUsers = new Map(); // username -> socketId

io.on('connection', (socket) => {

  socket.on('user_join', (username) => {
    onlineUsers.set(username, socket.id);
    socket.username = username;
    io.emit('user_list', [...onlineUsers.keys()]);
  });

  socket.on('send_message', async (data) => {
    const { sender, receiver, groupId, message, mediaUrl, mediaType } = data;
    try {
   const emotion = detectEmotion(message || '');

const msg = await Message.create({
  sender, receiver: receiver || null,
  groupId: groupId || null,
  message, mediaUrl: mediaUrl || null,
  mediaType: mediaType || null,
  delivered: true,
  emotion
});

      const payload = {
        _id: msg._id,
        sender, receiver, groupId,
        message, mediaUrl, mediaType,
        delivered: true, seen: false,
        createdAt: msg.createdAt,
        emotion
      };

      if (groupId) {
        // Send to all group members
        const group = await Group.findOne({ groupId });
        if (group) {
          group.members.forEach(member => {
            const sid = onlineUsers.get(member);
            if (sid) io.to(sid).emit('receive_message', payload);
          });
        }
      } else {
        // FIX: Only send to receiver, NOT back to sender
        // Sender already appends bubble optimistically in the frontend
        const receiverSocket = onlineUsers.get(receiver);
        if (receiverSocket) {
          io.to(receiverSocket).emit('receive_message', payload);
        }
        // Send confirmation back to sender with the saved _id and timestamp
        socket.emit('message_sent', payload);
      }
    } catch (e) {
      console.error('Message save error:', e);
    }
  });

  // FIX: Typing for groups — broadcast to all group members except sender
  socket.on('typing', async ({ sender, receiver, groupId }) => {
    if (groupId) {
      const group = await Group.findOne({ groupId });
      if (group) {
        group.members.forEach(member => {
          if (member !== sender) {
            const sid = onlineUsers.get(member);
            if (sid) io.to(sid).emit('user_typing', { username: sender, groupId });
          }
        });
      }
    } else {
      const sid = onlineUsers.get(receiver);
      if (sid) io.to(sid).emit('user_typing', { username: sender });
    }
  });

  socket.on('message_seen', async ({ viewer, sender }) => {
    try {
      await Message.updateMany(
        { sender, receiver: viewer, seen: false },
        { seen: true }
      );
      const senderSocket = onlineUsers.get(sender);
      if (senderSocket) {
        io.to(senderSocket).emit('messages_seen', { by: viewer, sender });
      }
    } catch (e) {}
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit('user_list', [...onlineUsers.keys()]);
    }
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});