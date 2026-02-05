// Simple server to serve the dist folder
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files from dist folder
app.use(express.static(path.join(__dirname, 'dist')));

// Serve index.html for all routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serving dist folder on http://localhost:${PORT}`);
  console.log('Make sure the backend server is also running on port 5000');
});
