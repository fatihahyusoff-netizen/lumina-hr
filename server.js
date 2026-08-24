require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db'); // initializes + seeds DB on first run

const authRoutes = require('./routes/auth.routes');
const apiRoutes = require('./routes/api.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global safety net: never let a crash reach the browser as an HTML error page.
// Logs the full error to the terminal (so it's visible when troubleshooting)
// and returns a clean JSON message instead.
app.use((err, req, res, next) => {
  console.error('Unhandled server error on', req.method, req.path, ':', err);
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body was not valid JSON.' });
  }
  res.status(500).json({ error: 'Something went wrong on the server. Check the terminal for details.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`LUMINA HR backend running on http://localhost:${PORT}`);
});
