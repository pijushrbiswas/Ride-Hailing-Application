const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 8080;

// Enable CORS for API calls
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

// Serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🌐 Frontend server running at http://localhost:${PORT}`);
  console.log(`📡 Connecting to backend at http://localhost:3000`);
});
